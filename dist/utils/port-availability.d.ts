/**
 * Port availability checking utilities
 */
import type { Result, PortConfig } from '../types.js';
/**
 * Check if a port is available by attempting to bind to it
 */
export declare function isPortAvailable(port: number, host?: string): Promise<boolean>;
/**
 * Find an available port in the given range
 */
export declare function findAvailablePort(config: PortConfig, exclude?: Set<number>): Promise<Result<number>>;
//# sourceMappingURL=port-availability.d.ts.map