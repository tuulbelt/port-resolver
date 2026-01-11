/**
 * Process-related utilities
 */

import type { PortEntry } from '../types.js';

/**
 * Check if a process is still running
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Filter out stale entries from the registry
 */
export function filterStaleEntries(entries: PortEntry[], staleTimeout: number): { active: PortEntry[]; stale: PortEntry[] } {
  const now = Date.now();
  const active: PortEntry[] = [];
  const stale: PortEntry[] = [];

  for (const entry of entries) {
    const isStale = !isProcessRunning(entry.pid) || (now - entry.timestamp > staleTimeout);
    if (isStale) {
      stale.push(entry);
    } else {
      active.push(entry);
    }
  }

  return { active, stale };
}
