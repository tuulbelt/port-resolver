/**
 * Advanced usage patterns for Test Port Resolver / portres
 *
 * This example demonstrates:
 * - Custom port ranges and configuration
 * - Integration with test frameworks
 * - Concurrent test isolation patterns
 * - Cleanup strategies
 * - Error handling patterns
 *
 * Run this example:
 *   npx tsx examples/advanced.ts
 */

import { createServer, type Server } from 'node:net';
import { PortResolver, isPortAvailable } from '../src/index.ts';

/**
 * Example: Configure custom port ranges
 *
 * Use when you need specific port ranges for different purposes
 */
async function customPortRanges() {
  console.log('Example 1: Custom port ranges\n');

  // Range for web servers (high ports)
  const webResolver = new PortResolver({
    minPort: 8000,
    maxPort: 9000,
  });

  // Range for databases (different range)
  const dbResolver = new PortResolver({
    minPort: 27000,
    maxPort: 27100,
  });

  const webPort = await webResolver.get({ tag: 'web-server' });
  const dbPort = await dbResolver.get({ tag: 'database' });

  if (webPort.ok && dbPort.ok) {
    console.log(`  Web server port: ${webPort.value.port} (range: 8000-9000)`);
    console.log(`  Database port: ${dbPort.value.port} (range: 27000-27100)`);
  }

  // Cleanup
  await webResolver.releaseAll();
  await dbResolver.releaseAll();
  console.log();
}

/**
 * Example: Integration with test frameworks
 *
 * Pattern for using portres in test setup/teardown
 */
async function testFrameworkIntegration() {
  console.log('Example 2: Test framework integration\n');

  // Shared resolver for all tests
  const testResolver = new PortResolver();
  const allocatedPorts: number[] = [];

  // Simulate beforeEach
  async function beforeEach(): Promise<number> {
    const result = await testResolver.get({ tag: 'test-server' });
    if (!result.ok) {
      throw new Error(`Failed to get port: ${result.error.message}`);
    }
    allocatedPorts.push(result.value.port);
    return result.value.port;
  }

  // Simulate afterAll
  async function afterAll(): Promise<void> {
    const released = await testResolver.releaseAll();
    if (released.ok) {
      console.log(`  Cleanup: released ${released.value} ports`);
    }
  }

  // Simulate running 3 tests
  console.log('  Running 3 tests with isolated ports:');
  for (let i = 1; i <= 3; i++) {
    const port = await beforeEach();
    console.log(`    Test ${i}: using port ${port}`);
  }

  await afterAll();
  console.log();
}

/**
 * Example: Concurrent test isolation
 *
 * Pattern for running multiple servers concurrently without conflicts
 */
async function concurrentTestIsolation() {
  console.log('Example 3: Concurrent server isolation\n');

  const resolver = new PortResolver();
  const servers: Server[] = [];

  // Allocate 3 ports for concurrent servers
  const portsResult = await resolver.getMultiple(3, { tag: 'concurrent-test' });
  if (!portsResult.ok) {
    console.error('  Failed to allocate ports');
    return;
  }

  // Start servers on each port
  const ports = portsResult.value.map((p) => p.port);
  console.log(`  Allocated ports: ${ports.join(', ')}`);

  for (const port of ports) {
    const server = createServer((socket) => {
      socket.end('Hello from test server\n');
    });

    await new Promise<void>((resolve) => {
      server.listen(port, '127.0.0.1', () => {
        console.log(`  Server started on port ${port}`);
        resolve();
      });
    });

    servers.push(server);
  }

  // Verify all ports are in use
  console.log('  Verifying port allocation:');
  for (const port of ports) {
    const available = await isPortAvailable(port);
    console.log(`    Port ${port}: ${available ? 'available (error!)' : 'in use (correct)'}`);
  }

  // Cleanup servers
  for (const server of servers) {
    server.close();
  }
  await resolver.releaseAll();

  console.log('  All servers stopped and ports released');
  console.log();
}

/**
 * Example: Cleanup strategies
 *
 * Different approaches to handle port cleanup
 */
async function cleanupStrategies() {
  console.log('Example 4: Cleanup strategies\n');

  const resolver = new PortResolver();

  // Strategy 1: Explicit release after use
  console.log('  Strategy 1: Explicit release');
  const port1 = await resolver.get();
  if (port1.ok) {
    console.log(`    Allocated: ${port1.value.port}`);
    await resolver.release(port1.value.port);
    console.log(`    Released: ${port1.value.port}`);
  }

  // Strategy 2: Release all at end
  console.log('  Strategy 2: Release all at end');
  await resolver.get({ tag: 'batch-1' });
  await resolver.get({ tag: 'batch-2' });
  await resolver.get({ tag: 'batch-3' });
  const released = await resolver.releaseAll();
  if (released.ok) {
    console.log(`    Released ${released.value} ports at once`);
  }

  // Strategy 3: Clean stale entries periodically
  console.log('  Strategy 3: Clean stale entries');
  const cleaned = await resolver.clean();
  if (cleaned.ok) {
    console.log(`    Cleaned ${cleaned.value} stale entries`);
  }

  console.log();
}

/**
 * Example: Error handling patterns
 */
async function errorHandling() {
  console.log('Example 5: Error handling patterns\n');

  const resolver = new PortResolver({
    minPort: 50000,
    maxPort: 50003,
    maxPortsPerRequest: 5,
    maxRegistrySize: 10,
  });

  // Pattern 1: Handle allocation failure
  console.log('  Pattern 1: Handle port exhaustion');
  try {
    // Allocate all available ports
    await resolver.getMultiple(4);

    // This should fail - no ports left
    const result = await resolver.get();
    if (!result.ok) {
      console.log(`    Expected error: ${result.error.message}`);
    }
  } finally {
    await resolver.releaseAll();
  }

  // Pattern 2: Handle release failure
  console.log('  Pattern 2: Handle invalid release');
  const releaseResult = await resolver.release(99999);
  if (!releaseResult.ok) {
    console.log(`    Expected error: ${releaseResult.error.message}`);
  }

  // Pattern 3: Validate before use
  console.log('  Pattern 3: Validate port before use');
  const port = await resolver.get();
  if (port.ok) {
    // Double-check port is available (e.g., after long delay)
    const stillAvailable = await isPortAvailable(port.value.port);
    console.log(`    Port ${port.value.port} still available: ${stillAvailable}`);
    await resolver.release(port.value.port);
  }

  console.log();
}

/**
 * Example: Status monitoring
 */
async function statusMonitoring() {
  console.log('Example 6: Status monitoring\n');

  const resolver = new PortResolver();

  // Allocate some ports
  await resolver.getMultiple(5, { tag: 'monitoring-test' });

  // Get status
  const status = await resolver.status();
  if (status.ok) {
    console.log('  Registry Status:');
    console.log(`    Total entries: ${status.value.totalEntries}`);
    console.log(`    Active entries: ${status.value.activeEntries}`);
    console.log(`    Stale entries: ${status.value.staleEntries}`);
    console.log(`    Owned by this process: ${status.value.ownedByCurrentProcess}`);
    console.log(`    Port range: ${status.value.portRange.min}-${status.value.portRange.max}`);
  }

  // List all allocations
  const list = await resolver.list();
  if (list.ok && list.value.length > 0) {
    console.log('\n  Allocations:');
    for (const entry of list.value) {
      console.log(`    Port ${entry.port}: pid=${entry.pid}, tag=${entry.tag ?? 'none'}`);
    }
  }

  await resolver.releaseAll();
  console.log();
}

// Main execution
async function main() {
  console.log('Test Port Resolver - Advanced Usage Patterns\n');
  console.log('='.repeat(50) + '\n');

  await customPortRanges();
  await testFrameworkIntegration();
  await concurrentTestIsolation();
  await cleanupStrategies();
  await errorHandling();
  await statusMonitoring();

  console.log('Performance Tips:');
  console.log('  - Pre-allocate multiple ports with getMultiple() for batch operations');
  console.log('  - Use tags to identify port ownership');
  console.log('  - Call clean() periodically to remove stale entries');
  console.log('  - Use custom port ranges to avoid conflicts with system services');
  console.log('  - Always release ports in test teardown');
  console.log();

  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
