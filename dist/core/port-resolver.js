/**
 * PortResolver - Main class for port allocation
 */
import { Semaphore } from '@tuulbelt/file-based-semaphore-ts';
import { DEFAULT_CONFIG, REGISTRY_VERSION } from '../config.js';
import { sanitizeTag } from '../utils/path-validation.js';
import { isPortAvailable, findAvailablePort } from '../utils/port-availability.js';
import { filterStaleEntries } from '../utils/process.js';
import { getLockPath, ensureRegistryDir, readRegistry, writeRegistry } from '../registry/index.js';
export class PortResolver {
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        // Validate configuration
        if (this.config.minPort < 1 || this.config.minPort > 65535) {
            throw new Error('minPort must be between 1 and 65535');
        }
        if (this.config.maxPort < 1 || this.config.maxPort > 65535) {
            throw new Error('maxPort must be between 1 and 65535');
        }
        if (this.config.minPort > this.config.maxPort) {
            throw new Error('minPort must be less than or equal to maxPort');
        }
        if (!this.config.allowPrivileged && this.config.minPort < 1024) {
            this.config.minPort = 1024;
        }
    }
    /**
     * Acquire a lock on the registry using semats.
     * This ensures atomic access to the port registry across processes.
     */
    async acquireLock() {
        const lockPathResult = getLockPath(this.config);
        if (!lockPathResult.ok) {
            throw new Error(`Failed to get lock path: ${lockPathResult.error.message}`);
        }
        const dirResult = ensureRegistryDir(this.config);
        if (!dirResult.ok) {
            throw new Error(`Failed to ensure registry directory: ${dirResult.error.message}`);
        }
        const semaphore = new Semaphore(lockPathResult.value);
        const result = await semaphore.acquire({ timeout: 5000, tag: 'portres' });
        if (!result.ok) {
            throw new Error(`Failed to acquire lock: ${result.error.message}`);
        }
        return { release: () => semaphore.release() };
    }
    /**
     * Get a single available port
     */
    async get(options = {}) {
        const result = await this.getMultiple(1, options);
        if (!result.ok) {
            return result;
        }
        const first = result.value[0];
        if (!first) {
            return { ok: false, error: new Error('No ports allocated') };
        }
        return { ok: true, value: first };
    }
    /**
     * Get multiple available ports
     */
    async getMultiple(count, options = {}) {
        // Validate count
        if (count < 1) {
            return { ok: false, error: new Error('Count must be at least 1') };
        }
        if (count > this.config.maxPortsPerRequest) {
            return { ok: false, error: new Error(`Count exceeds maximum (${this.config.maxPortsPerRequest})`) };
        }
        const lock = await this.acquireLock();
        try {
            // Read registry
            const registryResult = readRegistry(this.config);
            if (!registryResult.ok) {
                return { ok: false, error: registryResult.error };
            }
            const registry = registryResult.value;
            // Clean stale entries
            const { active } = filterStaleEntries(registry.entries, this.config.staleTimeout);
            registry.entries = active;
            // Check registry size limit
            if (registry.entries.length + count > this.config.maxRegistrySize) {
                return { ok: false, error: new Error('Registry size limit exceeded') };
            }
            // Get already allocated ports
            const allocatedPorts = new Set(registry.entries.map(e => e.port));
            // Find available ports
            const allocations = [];
            const pid = process.pid;
            const timestamp = Date.now();
            for (let i = 0; i < count; i++) {
                const portResult = await findAvailablePort(this.config, allocatedPorts);
                if (!portResult.ok) {
                    // Rollback allocations
                    for (const alloc of allocations) {
                        const idx = registry.entries.findIndex(e => e.port === alloc.port && e.pid === pid);
                        if (idx !== -1) {
                            registry.entries.splice(idx, 1);
                        }
                    }
                    return { ok: false, error: portResult.error };
                }
                const port = portResult.value;
                allocatedPorts.add(port);
                // Sanitize tag to prevent registry injection
                const safeTag = sanitizeTag(options.tag);
                const entry = { port, pid, timestamp, tag: safeTag };
                registry.entries.push(entry);
                allocations.push({ port, tag: safeTag });
            }
            // Write registry
            const writeResult = writeRegistry(this.config, registry);
            if (!writeResult.ok) {
                return { ok: false, error: writeResult.error };
            }
            return { ok: true, value: allocations };
        }
        finally {
            lock.release();
        }
    }
    /**
     * Release a port
     */
    async release(port) {
        // Validate port
        if (port < 1 || port > 65535) {
            return { ok: false, error: new Error('Invalid port number') };
        }
        const lock = await this.acquireLock();
        try {
            const registryResult = readRegistry(this.config);
            if (!registryResult.ok) {
                return { ok: false, error: registryResult.error };
            }
            const registry = registryResult.value;
            const pid = process.pid;
            // Find and remove the entry
            const idx = registry.entries.findIndex(e => e.port === port && e.pid === pid);
            if (idx === -1) {
                // Check if port is owned by another process
                const otherEntry = registry.entries.find(e => e.port === port);
                if (otherEntry) {
                    return { ok: false, error: new Error(`Port ${port} is owned by another process (PID: ${otherEntry.pid})`) };
                }
                return { ok: false, error: new Error(`Port ${port} is not registered`) };
            }
            registry.entries.splice(idx, 1);
            const writeResult = writeRegistry(this.config, registry);
            if (!writeResult.ok) {
                return { ok: false, error: writeResult.error };
            }
            return { ok: true, value: undefined };
        }
        finally {
            lock.release();
        }
    }
    /**
     * Release all ports owned by the current process
     */
    async releaseAll() {
        const lock = await this.acquireLock();
        try {
            const registryResult = readRegistry(this.config);
            if (!registryResult.ok) {
                return { ok: false, error: registryResult.error };
            }
            const registry = registryResult.value;
            const pid = process.pid;
            const before = registry.entries.length;
            registry.entries = registry.entries.filter(e => e.pid !== pid);
            const released = before - registry.entries.length;
            const writeResult = writeRegistry(this.config, registry);
            if (!writeResult.ok) {
                return { ok: false, error: writeResult.error };
            }
            return { ok: true, value: released };
        }
        finally {
            lock.release();
        }
    }
    /**
     * List all port allocations
     */
    async list() {
        const lock = await this.acquireLock();
        try {
            const registryResult = readRegistry(this.config);
            if (!registryResult.ok) {
                return { ok: false, error: registryResult.error };
            }
            return { ok: true, value: registryResult.value.entries };
        }
        finally {
            lock.release();
        }
    }
    /**
     * Clean stale entries from the registry
     */
    async clean() {
        const lock = await this.acquireLock();
        try {
            const registryResult = readRegistry(this.config);
            if (!registryResult.ok) {
                return { ok: false, error: registryResult.error };
            }
            const registry = registryResult.value;
            const { active, stale } = filterStaleEntries(registry.entries, this.config.staleTimeout);
            registry.entries = active;
            const writeResult = writeRegistry(this.config, registry);
            if (!writeResult.ok) {
                return { ok: false, error: writeResult.error };
            }
            return { ok: true, value: stale.length };
        }
        finally {
            lock.release();
        }
    }
    /**
     * Get registry status
     */
    async status() {
        const lock = await this.acquireLock();
        try {
            const registryResult = readRegistry(this.config);
            if (!registryResult.ok) {
                return { ok: false, error: registryResult.error };
            }
            const registry = registryResult.value;
            const { active, stale } = filterStaleEntries(registry.entries, this.config.staleTimeout);
            const pid = process.pid;
            const status = {
                totalEntries: registry.entries.length,
                activeEntries: active.length,
                staleEntries: stale.length,
                ownedByCurrentProcess: registry.entries.filter(e => e.pid === pid).length,
                portRange: { min: this.config.minPort, max: this.config.maxPort },
            };
            return { ok: true, value: status };
        }
        finally {
            lock.release();
        }
    }
    /**
     * Clear the entire registry
     */
    async clear() {
        const lock = await this.acquireLock();
        try {
            const registry = { version: REGISTRY_VERSION, entries: [] };
            const writeResult = writeRegistry(this.config, registry);
            if (!writeResult.ok) {
                return { ok: false, error: writeResult.error };
            }
            return { ok: true, value: undefined };
        }
        finally {
            lock.release();
        }
    }
    /**
     * Reserve a contiguous range of ports starting from a specific port
     *
     * @example
     * ```ts
     * const result = await resolver.reserveRange({ start: 50000, count: 5, tag: 'cluster' });
     * if (result.ok) {
     *   console.log(`Reserved ports: ${result.value.map(a => a.port).join(', ')}`);
     *   // Output: Reserved ports: 50000, 50001, 50002, 50003, 50004
     * }
     * ```
     */
    async reserveRange(options) {
        const { start, count, tag } = options;
        // Validate inputs
        if (count < 1) {
            return { ok: false, error: new Error('Count must be at least 1') };
        }
        if (count > this.config.maxPortsPerRequest) {
            return { ok: false, error: new Error(`Count exceeds maximum (${this.config.maxPortsPerRequest})`) };
        }
        if (start < 1 || start > 65535) {
            return { ok: false, error: new Error('Start port must be between 1 and 65535') };
        }
        if (start + count - 1 > 65535) {
            return { ok: false, error: new Error('Port range exceeds maximum (65535)') };
        }
        if (!this.config.allowPrivileged && start < 1024) {
            return { ok: false, error: new Error('Cannot reserve privileged ports (< 1024) without allowPrivileged flag') };
        }
        const lock = await this.acquireLock();
        try {
            // Read registry
            const registryResult = readRegistry(this.config);
            if (!registryResult.ok) {
                return { ok: false, error: registryResult.error };
            }
            const registry = registryResult.value;
            // Clean stale entries
            const { active } = filterStaleEntries(registry.entries, this.config.staleTimeout);
            registry.entries = active;
            // Check registry size limit
            if (registry.entries.length + count > this.config.maxRegistrySize) {
                return { ok: false, error: new Error('Registry size limit exceeded') };
            }
            // Get already allocated ports
            const allocatedPorts = new Set(registry.entries.map(e => e.port));
            // Check if all ports in range are available
            const requestedPorts = [];
            for (let i = 0; i < count; i++) {
                const port = start + i;
                if (allocatedPorts.has(port)) {
                    return { ok: false, error: new Error(`Port ${port} in range is already allocated`) };
                }
                // Check if port is actually available on the network
                const available = await isPortAvailable(port);
                if (!available) {
                    return { ok: false, error: new Error(`Port ${port} in range is in use`) };
                }
                requestedPorts.push(port);
            }
            // Allocate all ports in range
            const allocations = [];
            const pid = process.pid;
            const timestamp = Date.now();
            const safeTag = sanitizeTag(tag);
            for (const port of requestedPorts) {
                const entry = { port, pid, timestamp, tag: safeTag };
                registry.entries.push(entry);
                allocations.push({ port, tag: safeTag });
            }
            // Write registry
            const writeResult = writeRegistry(this.config, registry);
            if (!writeResult.ok) {
                return { ok: false, error: writeResult.error };
            }
            return { ok: true, value: allocations };
        }
        finally {
            lock.release();
        }
    }
    /**
     * Get any available port within a specific range
     *
     * @example
     * ```ts
     * const result = await resolver.getPortInRange({ min: 50000, max: 50100, tag: 'api' });
     * if (result.ok) {
     *   console.log(`Port allocated: ${result.value.port}`);
     * }
     * ```
     */
    async getPortInRange(options) {
        const { min, max, tag } = options;
        // Validate inputs
        if (min < 1 || min > 65535) {
            return { ok: false, error: new Error('Min port must be between 1 and 65535') };
        }
        if (max < 1 || max > 65535) {
            return { ok: false, error: new Error('Max port must be between 1 and 65535') };
        }
        if (min > max) {
            return { ok: false, error: new Error('Min port must be less than or equal to max port') };
        }
        if (!this.config.allowPrivileged && min < 1024) {
            return { ok: false, error: new Error('Cannot allocate privileged ports (< 1024) without allowPrivileged flag') };
        }
        const lock = await this.acquireLock();
        try {
            // Read registry
            const registryResult = readRegistry(this.config);
            if (!registryResult.ok) {
                return { ok: false, error: registryResult.error };
            }
            const registry = registryResult.value;
            // Clean stale entries
            const { active } = filterStaleEntries(registry.entries, this.config.staleTimeout);
            registry.entries = active;
            // Check registry size limit
            if (registry.entries.length + 1 > this.config.maxRegistrySize) {
                return { ok: false, error: new Error('Registry size limit exceeded') };
            }
            // Get already allocated ports
            const allocatedPorts = new Set(registry.entries.map(e => e.port));
            // Find available port in range using custom config
            const rangeConfig = { ...this.config, minPort: min, maxPort: max };
            const portResult = await findAvailablePort(rangeConfig, allocatedPorts);
            if (!portResult.ok) {
                return { ok: false, error: portResult.error };
            }
            const port = portResult.value;
            const pid = process.pid;
            const timestamp = Date.now();
            const safeTag = sanitizeTag(tag);
            // Add to registry
            const entry = { port, pid, timestamp, tag: safeTag };
            registry.entries.push(entry);
            // Write registry
            const writeResult = writeRegistry(this.config, registry);
            if (!writeResult.ok) {
                return { ok: false, error: writeResult.error };
            }
            return { ok: true, value: { port, tag: safeTag } };
        }
        finally {
            lock.release();
        }
    }
}
// ============================================================================
// Module-Level Convenience APIs (propval pattern)
// ============================================================================
/**
 * Get a single available port (convenience function)
 *
 * @example
 * ```ts
 * import { getPort } from '@tuulbelt/port-resolver';
 *
 * const result = await getPort({ tag: 'api-server' });
 * if (result.ok) {
 *   console.log(`Port allocated: ${result.value.port}`);
 * }
 * ```
 */
//# sourceMappingURL=port-resolver.js.map