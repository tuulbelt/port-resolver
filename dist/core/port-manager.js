/**
 * PortManager - Lifecycle management for ports with tag-based tracking
 */
import { PortResolver } from './port-resolver.js';
export class PortManager {
    resolver;
    allocations = new Map();
    constructor(config = {}) {
        this.resolver = new PortResolver(config);
    }
    /**
     * Allocate a single port with optional tag
     *
     * @param tag - Optional tag for tracking. Must be unique within this PortManager instance.
     * @returns Result with allocated port information
     *
     * @remarks
     * If a tag is provided and already exists in this PortManager's tracking,
     * the allocation will fail to prevent accidentally losing track of the previous allocation.
     */
    async allocate(tag) {
        // Prevent duplicate tags within this PortManager instance
        if (tag && this.allocations.has(tag)) {
            return { ok: false, error: new Error(`Tag '${tag}' is already in use by this PortManager instance`) };
        }
        const result = await this.resolver.get({ tag });
        if (result.ok) {
            const key = tag || `port-${result.value.port}`;
            this.allocations.set(key, result.value);
        }
        return result;
    }
    /**
     * Allocate multiple ports atomically
     */
    async allocateMultiple(count, tag) {
        const result = await this.resolver.getMultiple(count, { tag });
        if (result.ok) {
            for (const alloc of result.value) {
                // Use port number as key to ensure uniqueness (tag may be shared)
                const key = `port-${alloc.port}`;
                this.allocations.set(key, alloc);
            }
        }
        return result;
    }
    /**
     * Release a specific port by tag or port number
     *
     * @param tagOrPort - Tag string or port number to release
     * @returns Result indicating success or failure
     *
     * @remarks
     * This method is idempotent - releasing a port that is not tracked
     * by this PortManager instance will succeed (returns ok: true).
     * The port will still be released from the registry if it exists there.
     */
    async release(tagOrPort) {
        let port;
        if (typeof tagOrPort === 'number') {
            port = tagOrPort;
            // Remove from allocations map
            for (const [key, alloc] of this.allocations.entries()) {
                if (alloc.port === port) {
                    this.allocations.delete(key);
                    break;
                }
            }
        }
        else {
            const alloc = this.allocations.get(tagOrPort);
            if (alloc) {
                port = alloc.port;
                this.allocations.delete(tagOrPort);
            }
            // If not found in allocations, we'll still try to release from registry (idempotent)
        }
        // If we have a port number, release it from the registry
        if (port !== undefined) {
            return this.resolver.release(port);
        }
        // Tag not found in this PortManager instance - that's okay (idempotent)
        // Return success since the desired state (port not allocated) is achieved
        return { ok: true, value: undefined };
    }
    /**
     * Release all ports managed by this instance
     */
    async releaseAll() {
        let released = 0;
        const errors = [];
        for (const [tag, alloc] of this.allocations.entries()) {
            const result = await this.resolver.release(alloc.port);
            if (result.ok) {
                released++;
            }
            else {
                errors.push(`${tag}: ${result.error.message}`);
            }
        }
        this.allocations.clear();
        if (errors.length > 0) {
            return { ok: false, error: new Error(`Failed to release some ports: ${errors.join(', ')}`) };
        }
        return { ok: true, value: released };
    }
    /**
     * Get all allocations managed by this instance
     */
    getAllocations() {
        return Array.from(this.allocations.values());
    }
    /**
     * Get allocation by tag
     */
    get(tag) {
        return this.allocations.get(tag);
    }
}
//# sourceMappingURL=port-manager.js.map