/**
 * getPort - Convenience function for single port allocation
 */
import type { Result, PortConfig, PortAllocation } from '../types.js';
/**
 * Get a single available port (convenience function)
 *
 * @example
 * ```ts
 * import { getPort } from '@tuulbelt/port-resolver';
 *
 * const result = await getPort({ tag: 'api-server' });
 * if (result.ok) {
 *   console.log(`Port allocated: ${result.value.port}`);
 * }
 * ```
 */
export declare function getPort(options?: {
    tag?: string;
    config?: Partial<PortConfig>;
}): Promise<Result<PortAllocation>>;
/**
 * Get multiple available ports atomically (convenience function)
 *
 * Allocates N ports atomically - either all succeed or all fail (transactional).
 *
 * @example
 * ```ts
 * import { getPorts } from '@tuulbelt/port-resolver';
 *
 * const result = await getPorts(3, { tags: ['http', 'grpc', 'metrics'] });
 * if (result.ok) {
 *   const [httpPort, grpcPort, metricsPort] = result.value;
 *   console.log(`HTTP: ${httpPort.port}, gRPC: ${grpcPort.port}, Metrics: ${metricsPort.port}`);
 * }
 * ```
 */
//# sourceMappingURL=get-port.d.ts.map