/**
 * releasePort - Convenience function for port deallocation
 */
import type { Result, PortConfig } from '../types.js';
/**
 * Release a port allocation (module-level convenience function).
 *
 * Release can be done by tag or port number.
 *
 * @example
 * import { releasePort } from '@tuulbelt/port-resolver';
 *
 * // Release by tag
 * const result = await releasePort({ tag: 'api-server' });
 *
 * // Release by port number
 * const result = await releasePort({ port: 8080 });
 *
 * @param options - Release options (tag or port)
 * @returns Result with void on success
 */
export declare function releasePort(options: {
    tag?: string;
    port?: number;
    config?: Partial<PortConfig>;
}): Promise<Result<void>>;
//# sourceMappingURL=release-port.d.ts.map