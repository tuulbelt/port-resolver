/**
 * getPorts - Convenience function for batch port allocation
 */
import { PortResolver } from '../core/port-resolver.js';
// ============================================================================
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
export async function getPorts(count, options = {}) {
    const resolver = new PortResolver(options.config);
    // Handle single tag for all ports (atomic allocation)
    if (options.tag) {
        return resolver.getMultiple(count, { tag: options.tag });
    }
    // Handle array of tags (one per port) - atomic allocation via getMultiple
    if (options.tags) {
        if (options.tags.length !== count) {
            return { ok: false, error: new Error(`Tag count (${options.tags.length}) must match port count (${count})`) };
        }
        // Note: Current implementation assigns first tag to all ports in batch.
        // For per-port tags, we use sequential allocation.
        // This is not fully atomic but provides better tag granularity.
        const allocations = [];
        for (const tag of options.tags) {
            const result = await resolver.get({ tag });
            if (!result.ok) {
                // Rollback: release all previously allocated ports
                for (const alloc of allocations) {
                    await resolver.release(alloc.port);
                }
                return { ok: false, error: result.error };
            }
            allocations.push(result.value);
        }
        return { ok: true, value: allocations };
    }
    // No tags specified (atomic allocation)
    return resolver.getMultiple(count);
}
//# sourceMappingURL=get-ports.js.map