/**
 * Port Lifecycle Management with PortManager
 *
 * This example demonstrates the PortManager class for tracking and managing
 * port allocations across the lifetime of an application or test suite.
 *
 * Features demonstrated:
 * - PortManager for allocation tracking
 * - Release by tag instead of port number
 * - Automatic cleanup patterns
 * - Integration with application lifecycle
 *
 * Run this example:
 *   npx tsx examples/port-manager.ts
 */

import { PortManager } from '../src/index.ts';
import { createServer, type Server } from 'node:net';

/**
 * Example 1: Basic PortManager usage
 *
 * Use when you want to track allocations by name
 */
async function basicUsage() {
  console.log('Example 1: Basic PortManager usage\n');

  const manager = new PortManager();

  // Allocate ports with descriptive tags
  await manager.allocate('api-server');
  await manager.allocate('database');
  await manager.allocate('cache');

  console.log('  Allocated Ports:');

  // Retrieve ports by tag
  const api = manager.get('api-server');
  const db = manager.get('database');
  const cache = manager.get('cache');

  if (api && db && cache) {
    console.log(`    API Server: ${api.port}`);
    console.log(`    Database:   ${db.port}`);
    console.log(`    Cache:      ${cache.port}`);
  }

  console.log();
  console.log('  Benefit: Access ports by name, not number');

  // Cleanup all at once
  await manager.releaseAll();
  console.log('  ✓ All ports released');
  console.log();
}

/**
 * Example 2: Release by tag instead of port number
 *
 * Use when you want to release specific services
 */
async function releaseByTag() {
  console.log('Example 2: Release ports by tag\n');

  const manager = new PortManager();

  // Allocate services
  await manager.allocate('frontend');
  await manager.allocate('backend');
  await manager.allocate('worker');

  console.log('  Initial allocations:');
  for (const alloc of manager.getAllocations()) {
    console.log(`    ${alloc.tag}: port ${alloc.port}`);
  }

  // Release just the worker
  await manager.release('worker');
  console.log('\n  After releasing "worker":');
  for (const alloc of manager.getAllocations()) {
    console.log(`    ${alloc.tag}: port ${alloc.port}`);
  }

  console.log();
  console.log('  Pattern: Selective service shutdown');

  await manager.releaseAll();
  console.log();
}

/**
 * Example 3: Allocate multiple ports for one service
 *
 * Use when a service needs multiple ports
 */
async function multiplePortsPerService() {
  console.log('Example 3: Multiple ports per service\n');

  const manager = new PortManager();

  // API server needs 3 ports: HTTP, HTTPS, gRPC
  await manager.allocate('api-http');
  await manager.allocate('api-https');
  await manager.allocate('api-grpc');

  console.log('  API Server Configuration:');
  const http = manager.get('api-http');
  const https = manager.get('api-https');
  const grpc = manager.get('api-grpc');

  if (http && https && grpc) {
    console.log(`    HTTP:  ${http.port}`);
    console.log(`    HTTPS: ${https.port}`);
    console.log(`    gRPC:  ${grpc.port}`);
  }

  console.log();
  console.log('  Pattern: Related ports with descriptive tags');

  await manager.releaseAll();
  console.log();
}

/**
 * Example 4: Batch allocation with PortManager
 *
 * Use when you need multiple ports at once
 */
async function batchAllocation() {
  console.log('Example 4: Batch allocation with PortManager\n');

  const manager = new PortManager();

  // Allocate worker pool
  await manager.allocateMultiple(5, 'worker-pool');

  console.log('  Worker Pool (5 ports):');
  const allocations = manager.getAllocations();
  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i]!;
    console.log(`    Worker ${i + 1}: port ${alloc.port} (tag: ${alloc.tag})`);
  }

  console.log();
  console.log('  Use case: Horizontal scaling, load balancing');

  await manager.releaseAll();
  console.log();
}

/**
 * Example 5: Application lifecycle integration
 *
 * Use in application startup and shutdown
 */
async function applicationLifecycle() {
  console.log('Example 5: Application lifecycle integration\n');

  class Application {
    private portManager = new PortManager();
    private servers: Server[] = [];

    async start(): Promise<void> {
      console.log('  Application starting...');

      // Allocate all needed ports
      await this.portManager.allocate('http');
      await this.portManager.allocate('websocket');
      await this.portManager.allocate('metrics');

      const http = this.portManager.get('http');
      const ws = this.portManager.get('websocket');
      const metrics = this.portManager.get('metrics');

      if (http && ws && metrics) {
        console.log(`    HTTP server:       port ${http.port}`);
        console.log(`    WebSocket server:  port ${ws.port}`);
        console.log(`    Metrics endpoint:  port ${metrics.port}`);

        // Start servers (simulated)
        this.servers.push(await this.startServer(http.port));
        this.servers.push(await this.startServer(ws.port));
        this.servers.push(await this.startServer(metrics.port));

        console.log('  ✓ Application started');
      }
    }

    async stop(): Promise<void> {
      console.log('\n  Application stopping...');

      // Stop all servers
      for (const server of this.servers) {
        server.close();
      }

      // Release all ports
      const released = await this.portManager.releaseAll();
      if (released.ok) {
        console.log(`  ✓ Released ${released.value} ports`);
      }

      console.log('  ✓ Application stopped');
    }

    private async startServer(port: number): Promise<Server> {
      return new Promise((resolve) => {
        const server = createServer();
        server.listen(port, () => resolve(server));
      });
    }
  }

  const app = new Application();
  await app.start();
  await app.stop();

  console.log();
}

/**
 * Example 6: Test suite integration
 *
 * Use in test setup and teardown
 */
async function testSuiteIntegration() {
  console.log('Example 6: Test suite integration\n');

  class TestSuite {
    private portManager = new PortManager();

    async beforeAll(): Promise<void> {
      console.log('  Test Suite Setup (beforeAll)');

      // Allocate shared test infrastructure
      await this.portManager.allocate('test-db');
      await this.portManager.allocate('test-cache');

      const db = this.portManager.get('test-db');
      const cache = this.portManager.get('test-cache');

      console.log(`    Test DB:    port ${db?.port}`);
      console.log(`    Test Cache: port ${cache?.port}`);
    }

    async beforeEach(testName: string): Promise<number | undefined> {
      // Each test gets its own server port
      await this.portManager.allocate(`test-${testName}`);
      const allocation = this.portManager.get(`test-${testName}`);
      return allocation?.port;
    }

    async afterEach(testName: string): Promise<void> {
      // Release test-specific port
      await this.portManager.release(`test-${testName}`);
    }

    async afterAll(): Promise<void> {
      console.log('\n  Test Suite Teardown (afterAll)');

      // Release all ports
      const released = await this.portManager.releaseAll();
      if (released.ok) {
        console.log(`    Released ${released.value} ports`);
      }
    }
  }

  const suite = new TestSuite();

  await suite.beforeAll();

  // Simulate 3 tests
  console.log('\n  Running Tests:');
  for (let i = 1; i <= 3; i++) {
    const testName = `api-test-${i}`;
    const port = await suite.beforeEach(testName);
    console.log(`    ✓ ${testName} (port ${port})`);
    await suite.afterEach(testName);
  }

  await suite.afterAll();

  console.log();
}

/**
 * Example 7: Error recovery and cleanup
 */
async function errorRecovery() {
  console.log('Example 7: Error recovery and cleanup\n');

  const manager = new PortManager();

  try {
    // Allocate ports
    await manager.allocate('service-1');
    await manager.allocate('service-2');

    console.log('  Allocated 2 ports');

    // Simulate error during service startup
    throw new Error('Service startup failed');
  } catch (err) {
    console.log(`  ✗ Error: ${(err as Error).message}`);
    console.log('  Cleaning up allocated ports...');

    // PortManager tracks all allocations - easy cleanup
    const released = await manager.releaseAll();
    if (released.ok) {
      console.log(`  ✓ Released ${released.value} ports on error`);
    }
  }

  console.log();
  console.log('  Pattern: try/catch with automatic cleanup');
  console.log();
}

/**
 * Example 8: Check allocations status
 */
async function checkAllocations() {
  console.log('Example 8: Check current allocations\n');

  const manager = new PortManager();

  // Allocate some ports
  await manager.allocate('frontend');
  await manager.allocate('backend');
  await manager.allocate('worker-1');
  await manager.allocate('worker-2');

  console.log('  Current Allocations:');
  const allocations = manager.getAllocations();
  console.log(`    Total: ${allocations.length} ports`);
  console.log();

  for (const alloc of allocations) {
    console.log(`    ${alloc.tag?.padEnd(12)} → port ${alloc.port}`);
  }

  console.log();
  console.log('  Use case: Health checks, debugging, monitoring');

  await manager.releaseAll();
  console.log();
}

// Main execution
async function main() {
  console.log('Port Resolver - PortManager Lifecycle Patterns\n');
  console.log('='.repeat(60) + '\n');

  await basicUsage();
  await releaseByTag();
  await multiplePortsPerService();
  await batchAllocation();
  await applicationLifecycle();
  await testSuiteIntegration();
  await errorRecovery();
  await checkAllocations();

  console.log('PortManager Benefits:');
  console.log('  ✓ Track allocations by descriptive tags');
  console.log('  ✓ Release by tag instead of port number');
  console.log('  ✓ View all allocations: getAllocations()');
  console.log('  ✓ Simple cleanup: releaseAll()');
  console.log('  ✓ Integrates with application lifecycle');
  console.log();

  console.log('When to Use PortManager:');
  console.log('  • Long-running applications with multiple services');
  console.log('  • Test suites with shared infrastructure');
  console.log('  • Applications that need selective service restart');
  console.log('  • Scenarios requiring port lookup by name');
  console.log();

  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
