/**
 * getPorts - Convenience function for batch port allocation
 */
import type { Result, PortConfig, PortAllocation } from '../types.js';
/**
 * Get multiple available ports atomically (convenience function).
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
export declare function getPorts(count: number, options?: {
    tags?: string[];
    tag?: string;
    config?: Partial<PortConfig>;
}): Promise<Result<PortAllocation[]>>;
//# sourceMappingURL=get-ports.d.ts.map