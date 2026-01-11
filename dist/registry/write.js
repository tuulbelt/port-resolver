/**
 * Registry writing operations
 */
import { writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { ensureRegistryDir } from './ensure-dir.js';
import { getRegistryPath } from './paths.js';
/**
 * Write the registry file with secure permissions
 */
export function writeRegistry(config, registry) {
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
    }
    catch (err) {
        return { ok: false, error: err };
    }
}
//# sourceMappingURL=write.js.map