/**
 * Batch Port Allocation with Module-Level APIs
 *
 * This example demonstrates the module-level convenience APIs:
 * - getPort() - Single port allocation
 * - getPorts() - Batch allocation with individual tags
 * - Rollback semantics when allocation fails
 *
 * Run this example:
 *   npx tsx examples/batch-allocation.ts
 */

import { getPort, getPorts } from '../src/index.ts';

/**
 * Example 1: Simple single port allocation with getPort()
 *
 * Use when you need just one port quickly
 */
async function singlePortAllocation() {
  console.log('Example 1: Single port allocation with getPort()\n');

  // No need to create PortResolver instance
  const result = await getPort({ tag: 'api-server' });

  if (result.ok) {
    console.log(`  Allocated port ${result.value.port} for ${result.value.tag}`);
    console.log();
    console.log('  Convenience: No class instantiation needed');
  }

  console.log();
}

/**
 * Example 2: Batch allocation with same tag (atomic)
 *
 * Use when multiple ports share the same purpose
 */
async function batchWithSameTag() {
  console.log('Example 2: Batch allocation with same tag\n');

  // Allocate 3 ports all tagged as 'worker-pool'
  const result = await getPorts(3, { tag: 'worker-pool' });

  if (result.ok) {
    console.log('  Worker Pool Ports:');
    for (let i = 0; i < result.value.length; i++) {
      const { port, tag } = result.value[i]!;
      console.log(`    Worker ${i + 1}: port ${port} (tag: ${tag})`);
    }
    console.log();
    console.log('  All ports share tag "worker-pool"');
  }

  console.log();
}

/**
 * Example 3: Batch allocation with individual tags
 *
 * Use when each port has a distinct purpose
 */
async function batchWithIndividualTags() {
  console.log('Example 3: Batch allocation with individual tags\n');

  // Each port gets its own tag
  const result = await getPorts(3, {
    tags: ['http-server', 'grpc-server', 'metrics-server'],
  });

  if (result.ok) {
    console.log('  Service Ports:');
    for (const { port, tag } of result.value) {
      console.log(`    ${tag}: port ${port}`);
    }
    console.log();
    console.log('  Each port has a descriptive tag');
  }

  console.log();
}

/**
 * Example 4: Demonstrate rollback on failure
 *
 * If ANY allocation fails, ALL previous allocations are rolled back
 */
async function demonstrateRollback() {
  console.log('Example 4: Rollback semantics on allocation failure\n');

  // Create a constrained environment (very small range)
  const config = { minPort: 50000, maxPort: 50002 }; // Only 3 ports available

  // Try to allocate 5 ports (will fail after 3rd)
  const result = await getPorts(5, {
    tags: ['service-1', 'service-2', 'service-3', 'service-4', 'service-5'],
    config,
  });

  if (!result.ok) {
    console.log('  Allocation failed (as expected):');
    console.log(`    Error: ${result.error.message}`);
    console.log();
    console.log('  Rollback guarantee:');
    console.log('    - Even though 3 ports were available');
    console.log('    - NO partial allocation occurred');
    console.log('    - All-or-nothing semantics preserved');
    console.log();
    console.log('  This prevents orphaned port allocations');
  }

  console.log();
}

/**
 * Example 5: Complex multi-service setup
 *
 * Real-world pattern: allocate ports for entire application stack
 */
async function applicationStack() {
  console.log('Example 5: Application stack setup\n');

  // Allocate all ports needed for the stack
  const result = await getPorts(6, {
    tags: [
      'frontend-server',
      'api-gateway',
      'auth-service',
      'database',
      'cache',
      'metrics-exporter',
    ],
  });

  if (result.ok) {
    console.log('  Application Stack Configuration:');
    console.log();

    // Create a config object from allocations
    const config: Record<string, number> = {};
    for (const { port, tag } of result.value) {
      if (tag) {
        config[tag] = port;
      }
    }

    console.log('  Environment Variables:');
    console.log(`    FRONTEND_PORT=${config['frontend-server']}`);
    console.log(`    API_GATEWAY_PORT=${config['api-gateway']}`);
    console.log(`    AUTH_SERVICE_PORT=${config['auth-service']}`);
    console.log(`    DATABASE_PORT=${config['database']}`);
    console.log(`    CACHE_PORT=${config['cache']}`);
    console.log(`    METRICS_PORT=${config['metrics-exporter']}`);
    console.log();
    console.log('  Ready to start all services!');
  }

  console.log();
}

/**
 * Example 6: Custom configuration per allocation
 *
 * Use when you need specific port ranges
 */
async function customConfiguration() {
  console.log('Example 6: Custom configuration for specific ranges\n');

  // Public-facing services need ports in specific range (e.g., 8000-9000)
  const publicResult = await getPorts(2, {
    tags: ['public-api', 'public-websocket'],
    config: { minPort: 8000, maxPort: 9000 },
  });

  // Internal services can use any high port
  const internalResult = await getPorts(2, {
    tags: ['internal-queue', 'internal-metrics'],
    config: { minPort: 50000, maxPort: 60000 },
  });

  if (publicResult.ok && internalResult.ok) {
    console.log('  Public Services (8000-9000):');
    for (const { port, tag } of publicResult.value) {
      console.log(`    ${tag}: ${port}`);
    }

    console.log();
    console.log('  Internal Services (50000-60000):');
    for (const { port, tag } of internalResult.value) {
      console.log(`    ${tag}: ${port}`);
    }

    console.log();
    console.log('  Use case: Firewall rules, security policies, reverse proxy config');
  }

  console.log();
}

/**
 * Example 7: Error handling patterns
 */
async function errorHandlingPatterns() {
  console.log('Example 7: Error handling patterns\n');

  // Pattern 1: Validate before use
  const result1 = await getPort({ tag: 'critical-service' });
  if (!result1.ok) {
    console.error(`  Failed to allocate port: ${result1.error.message}`);
    return;
  }
  console.log(`  ✓ Allocated port ${result1.value.port} for critical-service`);

  // Pattern 2: Graceful degradation
  const result2 = await getPorts(5, { tag: 'optional-workers' });
  if (!result2.ok) {
    console.log('  ⚠ Failed to allocate 5 workers, falling back to fewer workers');

    // Try with fewer ports
    const fallback = await getPorts(2, { tag: 'optional-workers' });
    if (fallback.ok) {
      console.log(`  ✓ Allocated ${fallback.value.length} workers instead`);
    }
  } else {
    console.log(`  ✓ Allocated ${result2.value.length} workers`);
  }

  // Pattern 3: Cleanup on error
  try {
    const result3 = await getPorts(3, { tags: ['svc-1', 'svc-2', 'svc-3'] });
    if (!result3.ok) {
      throw new Error(`Port allocation failed: ${result3.error.message}`);
    }

    // ... use ports ...

    // Simulate error during service startup
    throw new Error('Service startup failed');
  } catch (err) {
    console.log(`  ✓ Caught error: ${(err as Error).message}`);
    console.log('  ✓ No cleanup needed - rollback already occurred');
  }

  console.log();
}

// Main execution
async function main() {
  console.log('Port Resolver - Batch Allocation Patterns\n');
  console.log('='.repeat(60) + '\n');

  await singlePortAllocation();
  await batchWithSameTag();
  await batchWithIndividualTags();
  await demonstrateRollback();
  await applicationStack();
  await customConfiguration();
  await errorHandlingPatterns();

  console.log('Module-Level API Benefits:');
  console.log('  ✓ No need to create PortResolver instances');
  console.log('  ✓ One-liner port allocation: await getPort()');
  console.log('  ✓ Batch allocation with individual tags: getPorts(n, { tags: [...] })');
  console.log('  ✓ Automatic rollback on partial failure (all-or-nothing)');
  console.log('  ✓ Custom config per allocation request');
  console.log();

  console.log('When to Use:');
  console.log('  • getPort()   → Quick single port allocation');
  console.log('  • getPorts()  → Multiple ports with tags or same purpose');
  console.log('  • Class API   → Advanced features (status, clean, custom registry)');
  console.log();

  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
