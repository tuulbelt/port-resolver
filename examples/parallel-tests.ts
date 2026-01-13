/**
 * Parallel Test Execution with Port Allocation
 *
 * This example demonstrates how to use port-resolver in parallel test suites
 * to ensure each test gets isolated ports without conflicts.
 *
 * Features demonstrated:
 * - reserveRange() for contiguous port allocation
 * - getPortInRange() for bounded allocation
 * - Concurrent test execution patterns
 * - Port isolation across test workers
 *
 * Run this example:
 *   npx tsx examples/parallel-tests.ts
 */

import { createServer, type Server } from 'node:net';
import { PortResolver } from '../src/index.ts';

/**
 * Example 1: Reserve contiguous range for microservices cluster
 *
 * Use when you need adjacent ports for related services
 */
async function microservicesCluster() {
  console.log('Example 1: Reserve contiguous port range for cluster\n');

  const resolver = new PortResolver();

  // Reserve 5 contiguous ports for: API, Database, Cache, Queue, Metrics
  const result = await resolver.reserveRange({
    start: 50000,
    count: 5,
    tag: 'microservices-cluster',
  });

  if (result.ok) {
    console.log('  Cluster ports allocated:');
    console.log(`    API Server:    ${result.value[0]?.port}`);
    console.log(`    Database:      ${result.value[1]?.port}`);
    console.log(`    Cache:         ${result.value[2]?.port}`);
    console.log(`    Message Queue: ${result.value[3]?.port}`);
    console.log(`    Metrics:       ${result.value[4]?.port}`);
    console.log();
    console.log('  Benefits: Predictable port numbering, easy to debug');
  }

  // Cleanup
  await resolver.releaseAll();
  console.log();
}

/**
 * Example 2: Get port within specific range for constrained environments
 *
 * Use when firewall rules or deployment policies restrict port ranges
 */
async function constrainedEnvironment() {
  console.log('Example 2: Allocate within firewall-allowed range\n');

  const resolver = new PortResolver();

  // Firewall only allows ports 8000-8100
  const apiResult = await resolver.getPortInRange({
    min: 8000,
    max: 8100,
    tag: 'api-server',
  });

  const dbResult = await resolver.getPortInRange({
    min: 8000,
    max: 8100,
    tag: 'database',
  });

  if (apiResult.ok && dbResult.ok) {
    console.log('  Allocated within firewall rules (8000-8100):');
    console.log(`    API:      ${apiResult.value.port}`);
    console.log(`    Database: ${dbResult.value.port}`);
    console.log();
    console.log('  Use case: Corporate networks, cloud security groups');
  }

  await resolver.releaseAll();
  console.log();
}

/**
 * Example 3: Parallel test workers with isolated port ranges
 *
 * Use when running tests with --maxWorkers or --parallel flags
 */
async function parallelTestWorkers() {
  console.log('Example 3: Parallel test workers (simulating Jest --maxWorkers=3)\n');

  // Simulate 3 test workers running concurrently
  const workers = [
    { id: 1, tests: ['API tests', 'Auth tests'] },
    { id: 2, tests: ['DB tests', 'Cache tests'] },
    { id: 3, tests: ['Queue tests', 'Email tests'] },
  ];

  // Each worker gets its own resolver
  const workerExecutions = workers.map(async (worker) => {
    const resolver = new PortResolver();
    const testResults: string[] = [];

    for (const testName of worker.tests) {
      // Each test allocates a port
      const portResult = await resolver.get({ tag: testName });

      if (portResult.ok) {
        const { port } = portResult.value;

        // Simulate test execution
        const server = await startTestServer(port);
        testResults.push(`    ✓ ${testName} on port ${port}`);
        server.close();
      }
    }

    // Cleanup worker's ports
    await resolver.releaseAll();

    return { worker: worker.id, results: testResults };
  });

  // Wait for all workers to complete
  const results = await Promise.all(workerExecutions);

  console.log('  Test Results:');
  for (const { worker, results: testResults } of results) {
    console.log(`  Worker ${worker}:`);
    for (const result of testResults) {
      console.log(result);
    }
  }

  console.log('\n  Note: All workers ran concurrently without port conflicts!');
  console.log();
}

/**
 * Example 4: Reserve range with fallback strategy
 *
 * Use when preferred range might be occupied
 */
async function rangeWithFallback() {
  console.log('Example 4: Reserve range with fallback strategy\n');

  const resolver = new PortResolver();

  // Try to reserve preferred range
  let result = await resolver.reserveRange({ start: 50000, count: 3, tag: 'cluster' });

  if (!result.ok) {
    console.log('  Preferred range (50000-50002) unavailable');
    console.log('  Trying fallback range (50010-50012)...');

    // Fallback to different range
    result = await resolver.reserveRange({ start: 50010, count: 3, tag: 'cluster' });
  }

  if (result.ok) {
    console.log(`  Allocated cluster on ports: ${result.value.map((p) => p.port).join(', ')}`);
    console.log();
    console.log('  Pattern: Try preferred range, fall back to alternatives');
  }

  await resolver.releaseAll();
  console.log();
}

/**
 * Example 5: Mixed allocation strategies
 *
 * Use when different services have different requirements
 */
async function mixedAllocation() {
  console.log('Example 5: Mixed allocation strategies in one test suite\n');

  const resolver = new PortResolver();

  // Strategy 1: Contiguous range for related services
  const clusterResult = await resolver.reserveRange({
    start: 50000,
    count: 3,
    tag: 'backend-cluster',
  });

  // Strategy 2: Bounded allocation for specific compliance
  const apiResult = await resolver.getPortInRange({
    min: 8000,
    max: 8100,
    tag: 'public-api',
  });

  // Strategy 3: Any available port for internal service
  const internalResult = await resolver.get({ tag: 'internal-service' });

  if (clusterResult.ok && apiResult.ok && internalResult.ok) {
    console.log('  Port Allocation Summary:');
    console.log(`    Backend cluster:   ${clusterResult.value.map((p) => p.port).join(', ')} (contiguous)`);
    console.log(`    Public API:        ${apiResult.value.port} (compliance range 8000-8100)`);
    console.log(`    Internal service:  ${internalResult.value.port} (any available)`);
    console.log();
    console.log('  Each strategy chosen based on requirements');
  }

  await resolver.releaseAll();
  console.log();
}

/**
 * Example 6: Handling range exhaustion gracefully
 */
async function handleRangeExhaustion() {
  console.log('Example 6: Handle range exhaustion gracefully\n');

  const resolver = new PortResolver();

  // Allocate narrow range
  const range1 = await resolver.reserveRange({ start: 50000, count: 3 });

  // Try to allocate in same exhausted range
  const range2 = await resolver.getPortInRange({ min: 50000, max: 50002 });

  if (range1.ok) {
    console.log(`  Reserved: ${range1.value.map((p) => p.port).join(', ')}`);
  }

  if (!range2.ok) {
    console.log(`  Expected error: ${range2.error.message}`);
    console.log();
    console.log('  Pattern: Validate range availability before critical operations');
  }

  await resolver.releaseAll();
  console.log();
}

// Helper function to start a test server
async function startTestServer(port: number): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      socket.end('Test response\n');
    });

    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

// Main execution
async function main() {
  console.log('Port Resolver - Parallel Test Execution Patterns\n');
  console.log('='.repeat(60) + '\n');

  await microservicesCluster();
  await constrainedEnvironment();
  await parallelTestWorkers();
  await rangeWithFallback();
  await mixedAllocation();
  await handleRangeExhaustion();

  console.log('Best Practices:');
  console.log('  ✓ Use reserveRange() when services need adjacent ports');
  console.log('  ✓ Use getPortInRange() when firewall/compliance restricts ranges');
  console.log('  ✓ Each test worker should have its own PortResolver instance');
  console.log('  ✓ Always releaseAll() in test teardown (afterAll hook)');
  console.log('  ✓ Consider fallback strategies for production resilience');
  console.log();

  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
