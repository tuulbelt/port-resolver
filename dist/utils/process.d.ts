/**
 * Process-related utilities
 */
import type { PortEntry } from '../types.js';
/**
 * Check if a process is still running
 */
export declare function isProcessRunning(pid: number): boolean;
/**
 * Filter out stale entries from the registry
 */
export declare function filterStaleEntries(entries: PortEntry[], staleTimeout: number): {
    active: PortEntry[];
    stale: PortEntry[];
};
//# sourceMappingURL=process.d.ts.map