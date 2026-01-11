/**
 * PortResolver - Main class for port allocation
 */
import type { Result, PortConfig, PortAllocation, PortEntry, RegistryStatus } from '../types.js';
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
//# sourceMappingURL=port-resolver.d.ts.map