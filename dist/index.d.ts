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
}
//# sourceMappingURL=index.d.ts.map