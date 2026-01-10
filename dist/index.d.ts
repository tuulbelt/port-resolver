#!/usr/bin/env -S npx tsx
/**
 * Test Port Resolver / portres
 *
 * Concurrent test port allocation - avoid port conflicts in parallel tests.
 * Uses file-based registry with semaphore integration for atomic access.
 *
 * Part of the Tuulbelt collection: https://github.com/tuulbelt
 */
/** Result type for operations that can fail */
export type Result<T, E = Error> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: E;
};
/** Port allocation configuration */
export interface PortConfig {
    /** Minimum port number (default: 49152 - start of dynamic/private range) */
    minPort: number;
    /** Maximum port number (default: 65535) */
    maxPort: number;
    /** Registry directory path (default: ~/.portres/) */
    registryDir: string;
    /** Allow privileged ports (< 1024) - requires explicit opt-in */
    allowPrivileged: boolean;
    /** Maximum ports per request (default: 100) */
    maxPortsPerRequest: number;
    /** Maximum registry entries (default: 1000) */
    maxRegistrySize: number;
    /** Stale entry timeout in ms (default: 1 hour) */
    staleTimeout: number;
    /** Verbose output */
    verbose: boolean;
}
/** Default configuration */
export declare const DEFAULT_CONFIG: PortConfig;
/** Port allocation entry */
export interface PortEntry {
    port: number;
    pid: number;
    timestamp: number;
    tag?: string;
}
/** Port registry */
export interface PortRegistry {
    version: number;
    entries: PortEntry[];
}
/** Port allocation result */
export interface PortAllocation {
    port: number;
    tag?: string;
}
/** Registry status */
export interface RegistryStatus {
    totalEntries: number;
    activeEntries: number;
    staleEntries: number;
    ownedByCurrentProcess: number;
    portRange: {
        min: number;
        max: number;
    };
}
/**
 * Check if a port is available by attempting to bind to it
 */
export declare function isPortAvailable(port: number, host?: string): Promise<boolean>;
/**
 * Find an available port in the given range
 */
export declare function findAvailablePort(config: PortConfig, exclude?: Set<number>): Promise<Result<number>>;
export declare class PortResolver {
    private config;
    constructor(config?: Partial<PortConfig>);
    /**
     * Acquire a lock on the registry using semats.
     * This ensures atomic access to the port registry across processes.
     */
    private acquireLock;
    /**
     * Get a single available port
     */
    get(options?: {
        tag?: string;
    }): Promise<Result<PortAllocation>>;
    /**
     * Get multiple available ports
     */
    getMultiple(count: number, options?: {
        tag?: string;
    }): Promise<Result<PortAllocation[]>>;
    /**
     * Release a port
     */
    release(port: number): Promise<Result<void>>;
    /**
     * Release all ports owned by the current process
     */
    releaseAll(): Promise<Result<number>>;
    /**
     * List all port allocations
     */
    list(): Promise<Result<PortEntry[]>>;
    /**
     * Clean stale entries from the registry
     */
    clean(): Promise<Result<number>>;
    /**
     * Get registry status
     */
    status(): Promise<Result<RegistryStatus>>;
    /**
     * Clear the entire registry
     */
    clear(): Promise<Result<void>>;
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
    reserveRange(options: {
        start: number;
        count: number;
        tag?: string;
    }): Promise<Result<PortAllocation[]>>;
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
    getPortInRange(options: {
        min: number;
        max: number;
        tag?: string;
    }): Promise<Result<PortAllocation>>;
}
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
export declare function getPort(options?: {
    tag?: string;
    config?: Partial<PortConfig>;
}): Promise<Result<PortAllocation>>;
/**
 * Get multiple available ports atomically (convenience function)
 *
 * Allocates N ports atomically - either all succeed or all fail (transactional).
 *
 * @example
 * ```ts
 * import { getPorts } from '@tuulbelt/port-resolver';
 *
 * const result = await getPorts(3, { tags: ['http', 'grpc', 'metrics'] });
 * if (result.ok) {
 *   const [httpPort, grpcPort, metricsPort] = result.value;
 *   console.log(`HTTP: ${httpPort.port}, gRPC: ${grpcPort.port}, Metrics: ${metricsPort.port}`);
 * }
 * ```
 */
export declare function getPorts(count: number, options?: {
    tags?: string[];
    tag?: string;
    config?: Partial<PortConfig>;
}): Promise<Result<PortAllocation[]>>;
/**
 * Port Manager for lifecycle-managed port allocation.
 *
 * Provides automatic cleanup and tracking for test suites.
 *
 * @example
 * ```ts
 * import { PortManager } from '@tuulbelt/port-resolver';
 *
 * const manager = new PortManager();
 *
 * // Allocate ports
 * const port1 = await manager.allocate('test-1');
 * const port2 = await manager.allocate('test-2');
 *
 * // ... run tests ...
 *
 * // Cleanup all at once
 * await manager.releaseAll();
 * ```
 */
export declare class PortManager {
    private resolver;
    private allocations;
    constructor(config?: Partial<PortConfig>);
    /**
     * Allocate a single port with optional tag
     */
    allocate(tag?: string): Promise<Result<PortAllocation>>;
    /**
     * Allocate multiple ports atomically
     */
    allocateMultiple(count: number, tag?: string): Promise<Result<PortAllocation[]>>;
    /**
     * Release a specific port by tag or port number
     */
    release(tagOrPort: string | number): Promise<Result<void>>;
    /**
     * Release all ports managed by this instance
     */
    releaseAll(): Promise<Result<number>>;
    /**
     * Get all allocations managed by this instance
     */
    getAllocations(): PortAllocation[];
    /**
     * Get allocation by tag
     */
    get(tag: string): PortAllocation | undefined;
}
//# sourceMappingURL=index.d.ts.map