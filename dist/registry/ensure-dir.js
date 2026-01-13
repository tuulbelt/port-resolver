/**
 * Registry directory initialization
 */
import { existsSync, mkdirSync } from 'node:fs';
import { validatePath } from '../utils/path-validation.js';
/**
 * Ensure registry directory exists with secure permissions
 */
export function ensureRegistryDir(config) {
    const pathResult = validatePath(config.registryDir);
    if (!pathResult.ok) {
        return { ok: false, error: pathResult.error };
    }
    try {
        if (!existsSync(pathResult.value)) {
            mkdirSync(pathResult.value, { recursive: true, mode: 0o700 });
        }
        return { ok: true, value: undefined };
    }
    catch (err) {
        return { ok: false, error: err };
    }
}
//# sourceMappingURL=ensure-dir.js.map