/**
 * Registry path utilities
 */
import { join } from 'node:path';
import { validatePath } from '../utils/path-validation.js';
const REGISTRY_FILE = 'registry.json';
const LOCK_FILE = 'registry.lock';
/**
 * Get the registry file path
 */
export function getRegistryPath(config) {
    const pathResult = validatePath(config.registryDir);
    if (!pathResult.ok) {
        return pathResult;
    }
    return { ok: true, value: join(pathResult.value, REGISTRY_FILE) };
}
/**
 * Get the lock file path
 */
export function getLockPath(config) {
    const pathResult = validatePath(config.registryDir);
    if (!pathResult.ok) {
        return pathResult;
    }
    return { ok: true, value: join(pathResult.value, LOCK_FILE) };
}
//# sourceMappingURL=paths.js.map