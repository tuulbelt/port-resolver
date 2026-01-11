/**
 * Type definitions for port-resolver
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
//# sourceMappingURL=types.d.ts.map