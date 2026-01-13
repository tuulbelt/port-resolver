/**
 * Registry writing operations
 */

import { writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { Result, PortConfig, PortRegistry } from '../types.js';
import { ensureRegistryDir } from './ensure-dir.js';
import { getRegistryPath } from './paths.js';

/**
 * Write the registry file with secure permissions
 */
export function writeRegistry(config: PortConfig, registry: PortRegistry): Result<void> {
  const dirResult = ensureRegistryDir(config);
  if (!dirResult.ok) {
    return { ok: false, error: dirResult.error };
  }

  const pathResult = getRegistryPath(config);
  if (!pathResult.ok) {
    return { ok: false, error: pathResult.error };
  }

  try {
    const tempPath = `${pathResult.value}.${randomBytes(8).toString('hex')}.tmp`;
    writeFileSync(tempPath, JSON.stringify(registry, null, 2), { mode: 0o600 });

    // Atomic rename
    renameSync(tempPath, pathResult.value);

    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: err as Error };
  }
}
