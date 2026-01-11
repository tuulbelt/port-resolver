/**
 * Port Resolver - Concurrent test port allocation
 *
 * A zero-dependency tool for managing port allocation in concurrent test environments.
 *
 * @example
 * ```ts
 * import { getPort, getPorts, releasePort } from '@tuulbelt/port-resolver';
 *
 * // Get a single port
 * const result = await getPort({ tag: 'api-server' });
 * if (result.ok) {
 *   console.log(`Allocated port: ${result.value.port}`);
 * }
 *
 * // Get multiple ports atomically
 * const multiResult = await getPorts(3, { tags: ['http', 'grpc', 'metrics'] });
 * if (multiResult.ok) {
 *   const [httpPort, grpcPort, metricsPort] = multiResult.value;
 * }
 *
 * // Release by tag
 * await releasePort({ tag: 'api-server' });
 * ```
 *
 * @example
 * ```ts
 * import { PortResolver, PortManager } from '@tuulbelt/port-resolver';
 *
 * // Using PortResolver class for advanced scenarios
 * const resolver = new PortResolver({
 *   minPort: 8000,
 *   maxPort: 9000,
 *   allowPrivileged: false,
 * });
 *
 * const port = await resolver.get({ tag: 'web-server' });
 *
 * // Using PortManager for lifecycle management
 * const manager = new PortManager();
 * const port1 = await manager.allocate('test-1');
 * const port2 = await manager.allocate('test-2');
 *
 * // Cleanup all at once
 * await manager.releaseAll();
 * ```
 *
 * @packageDocumentation
 */
// ============================================================================
// Config Exports (for advanced users)
// ============================================================================
export { DEFAULT_CONFIG, DANGEROUS_PATH_PATTERNS, TAG_CONTROL_CHARS, MAX_TAG_LENGTH, REGISTRY_VERSION, } from './config.js';
// ============================================================================
// Utility Exports (for advanced users)
// ============================================================================
export { sanitizeTag, validatePath, } from './utils/path-validation.js';
export { isPortAvailable, findAvailablePort, } from './utils/port-availability.js';
export { isProcessRunning, filterStaleEntries, } from './utils/process.js';
// ============================================================================
// Registry Exports (for advanced users)
// ============================================================================
export { getRegistryPath, getLockPath, } from './registry/paths.js';
export { ensureRegistryDir, } from './registry/ensure-dir.js';
export { readRegistry, } from './registry/read.js';
export { writeRegistry, } from './registry/write.js';
// ============================================================================
// Core Class Exports
// ============================================================================
export { PortResolver, } from './core/port-resolver.js';
export { PortManager, } from './core/port-manager.js';
// ============================================================================
// API Function Exports (Primary Public API)
// ============================================================================
export { getPort, } from './api/get-port.js';
export { getPorts, } from './api/get-ports.js';
export { releasePort, } from './api/release-port.js';
//# sourceMappingURL=index.js.map