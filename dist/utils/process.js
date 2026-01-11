/**
 * Process-related utilities
 */
/**
 * Check if a process is still running
 */
export function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Filter out stale entries from the registry
 */
export function filterStaleEntries(entries, staleTimeout) {
    const now = Date.now();
    const active = [];
    const stale = [];
    for (const entry of entries) {
        const isStale = !isProcessRunning(entry.pid) || (now - entry.timestamp > staleTimeout);
        if (isStale) {
            stale.push(entry);
        }
        else {
            active.push(entry);
        }
    }
    return { active, stale };
}
//# sourceMappingURL=process.js.map