/**
 * releasePort - Convenience function for port deallocation
 */

import type { Result, PortConfig } from '../types.js';
import { PortResolver } from '../core/port-resolver.js';
import { DEFAULT_CONFIG } from '../config.js';
import { readRegistry } from '../registry/index.js';

// ============================================================================

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
export async function releasePort(options: {
  tag?: string;
  port?: number;
  config?: Partial<PortConfig>;
}): Promise<Result<void>> {
  const resolver = new PortResolver(options.config);

  if (options.tag) {
    // Look up port by tag, then release
    const config = { ...DEFAULT_CONFIG, ...options.config };
    const registryResult = readRegistry(config);
    if (!registryResult.ok) {
      return { ok: false, error: registryResult.error };
    }

    const registry = registryResult.value;
    const entry = registry.entries.find(e => e.tag === options.tag);

    if (!entry) {
      // Tag not found - already released or never allocated (idempotent)
      return { ok: true, value: undefined };
    }

    // Release the port, handling "not registered" error gracefully
    const result = await resolver.release(entry.port);
    if (!result.ok && result.error.message.includes('is not registered')) {
      // Port was already released - idempotent behavior
      return { ok: true, value: undefined };
    }
    return result;
  } else if (options.port !== undefined) {
    // Release by port number with idempotent behavior
    const result = await resolver.release(options.port);
    if (!result.ok) {
      // Handle idempotent cases: port not registered, invalid port number, etc.
      // All these cases mean the port is effectively "not allocated", so return success
      if (result.error.message.includes('is not registered') ||
          result.error.message.includes('Invalid port number')) {
        return { ok: true, value: undefined };
      }
    }
    return result;
  }

  return { ok: false, error: new Error('Either tag or port must be provided') };
}
