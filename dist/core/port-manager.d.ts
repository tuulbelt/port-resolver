/**
 * PortManager - Lifecycle management for ports with tag-based tracking
 */
import type { Result, PortConfig, PortAllocation } from '../types.js';
export declare class PortManager {
    private resolver;
    private allocations;
    constructor(config?: Partial<PortConfig>);
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
    allocate(tag?: string): Promise<Result<PortAllocation>>;
    /**
     * Allocate multiple ports atomically
     */
    allocateMultiple(count: number, tag?: string): Promise<Result<PortAllocation[]>>;
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
//# sourceMappingURL=port-manager.d.ts.map