/**
 * Registry reading operations
 */
import { existsSync, readFileSync } from 'node:fs';
import { REGISTRY_VERSION } from '../config.js';
import { getRegistryPath } from './paths.js';
/**
 * Read the registry file
 */
export function readRegistry(config) {
    const pathResult = getRegistryPath(config);
    if (!pathResult.ok) {
        return { ok: false, error: pathResult.error };
    }
    const registryPath = pathResult.value;
    if (!existsSync(registryPath)) {
        return { ok: true, value: { version: REGISTRY_VERSION, entries: [] } };
    }
    try {
        const content = readFileSync(registryPath, 'utf-8');
        const registry = JSON.parse(content);
        // Validate registry structure - recover gracefully from invalid structure
        if (typeof registry.version !== 'number' || !Array.isArray(registry.entries)) {
            // Treat invalid structure as empty registry (graceful recovery)
            return { ok: true, value: { version: REGISTRY_VERSION, entries: [] } };
        }
        return { ok: true, value: registry };
    }
    catch {
        // If corrupted JSON, return empty registry (graceful recovery)
        return { ok: true, value: { version: REGISTRY_VERSION, entries: [] } };
    }
}
//# sourceMappingURL=read.js.map