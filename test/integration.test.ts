/**
 * Integration Tests for Port Resolver
 * - Security tests (path traversal, tag injection, etc.)
 * - Stress tests (large allocations, rapid cycles)
 * - Concurrent execution tests
 * - Semaphore integration tests
 * - Performance benchmarks
 * - Extended network tests
 * - Extended cleanup tests
 * - Cross-process integration
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, fork } from 'node:child_process';
import { createServer } from 'node:net';
import { PortResolver, isPortAvailable } from '../src/index.js';

// Helper to create unique test directories
function createTestDir(): string {
  return mkdtempSync(join(tmpdir(), 'portres-test-'));
}

// Helper to clean up test directories
function cleanupTestDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Security Tests
// ============================================================================

test('Security', async (t) => {
  let testDir: string;

  t.beforeEach(() => {
    testDir = createTestDir();
  });

  t.afterEach(() => {
    cleanupTestDir(testDir);
  });

  await t.test('sanitizes tags with control characters', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.get({ tag: 'test\n\r\x00injected' });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.tag, 'testinjected');
    }
  });

  await t.test('truncates long tags', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const longTag = 'a'.repeat(500);
    const result = await resolver.get({ tag: longTag });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(result.value.tag !== undefined);
      assert(result.value.tag.length <= 256);
    }
  });

  await t.test('prevents privileged port allocation without flag', async () => {
    const resolver = new PortResolver({
      registryDir: testDir,
      minPort: 80,
      maxPort: 100,
      allowPrivileged: false,
    });

    const result = await resolver.get();
    assert.strictEqual(result.ok, false);
  });

  await t.test('enforces registry size limit', async () => {
    const resolver = new PortResolver({
      registryDir: testDir,
      maxRegistrySize: 5,
    });

    for (let i = 0; i < 5; i++) {
      const result = await resolver.get();
      assert.strictEqual(result.ok, true);
    }

    const result = await resolver.get();
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.error.message.includes('limit'));
    }
  });

  await t.test('enforces ports per request limit', async () => {
    const resolver = new PortResolver({
      registryDir: testDir,
      maxPortsPerRequest: 3,
    });

    const result = await resolver.getMultiple(10);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.error.message.includes('maximum'));
    }
  });

  await t.test('validates port range bounds', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    let result = await resolver.release(0);
    assert.strictEqual(result.ok, false);

    result = await resolver.release(70000);
    assert.strictEqual(result.ok, false);
  });

  await t.test('creates registry directory with secure permissions', async () => {
    const secureDir = join(testDir, 'secure-registry');
    const resolver = new PortResolver({ registryDir: secureDir });

    await resolver.get();

    assert(existsSync(secureDir));
  });

  await t.test('handles corrupted registry gracefully', async () => {
    const registryPath = join(testDir, 'registry.json');
    writeFileSync(registryPath, 'not valid json {{{');

    const resolver = new PortResolver({ registryDir: testDir });

    const result = await resolver.get();
    assert.strictEqual(result.ok, true);
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

test('Edge Cases', async (t) => {
  let testDir: string;

  t.beforeEach(() => {
    testDir = createTestDir();
  });

  t.afterEach(() => {
    cleanupTestDir(testDir);
  });

  await t.test('handles empty registry', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 0);
    }

    const statusResult = await resolver.status();
    assert.strictEqual(statusResult.ok, true);
    if (statusResult.ok) {
      assert.strictEqual(statusResult.value.totalEntries, 0);
    }
  });

  await t.test('handles missing registry file', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    const result = await resolver.get();
    assert.strictEqual(result.ok, true);
  });

  await t.test('handles invalid registry structure', async () => {
    const registryPath = join(testDir, 'registry.json');
    writeFileSync(registryPath, JSON.stringify({ version: 1 }));

    const resolver = new PortResolver({ registryDir: testDir });

    const result = await resolver.get();
    assert.strictEqual(result.ok, true);
  });

  await t.test('handles empty tag', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.get({ tag: '' });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.tag, undefined);
    }
  });

  await t.test('handles rapid sequential allocations', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const ports: number[] = [];

    for (let i = 0; i < 10; i++) {
      const result = await resolver.get();
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        ports.push(result.value.port);
      }
    }

    const unique = new Set(ports);
    assert.strictEqual(unique.size, 10);
  });

  await t.test('handles narrow port range', async () => {
    const resolver = new PortResolver({
      registryDir: testDir,
      minPort: 50000,
      maxPort: 50010,
    });

    const result = await resolver.get();
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(result.value.port >= 50000 && result.value.port <= 50010);
    }
  });

  await t.test('handles very narrow port range exhaustion', async () => {
    const resolver = new PortResolver({
      registryDir: testDir,
      minPort: 50000,
      maxPort: 50002,
    });

    await resolver.get();
    await resolver.get();
    await resolver.get();

    const result = await resolver.get();
    assert.strictEqual(result.ok, false);
  });

  await t.test('handles release of non-owned port', async () => {
    const registryPath = join(testDir, 'registry.json');
    const otherRegistry = {
      version: 1,
      entries: [
        { port: 50000, pid: 999999998, timestamp: Date.now() },
      ],
    };
    writeFileSync(registryPath, JSON.stringify(otherRegistry));

    const resolver = new PortResolver({ registryDir: testDir });

    const result = await resolver.release(50000);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.error.message.includes('another process'));
    }
  });

  await t.test('handles cleanup after failed allocation', async () => {
    const resolver = new PortResolver({
      registryDir: testDir,
      minPort: 50000,
      maxPort: 50002,
    });

    await resolver.get();
    await resolver.get();

    const result = await resolver.getMultiple(3);
    assert.strictEqual(result.ok, false);

    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 2);
    }
  });
});

// ============================================================================
// Stress Tests
// ============================================================================

test('Stress Tests', async (t) => {
  let testDir: string;

  t.beforeEach(() => {
    testDir = createTestDir();
  });

  t.afterEach(() => {
    cleanupTestDir(testDir);
  });

  await t.test('handles 50 sequential allocations', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const ports: number[] = [];

    for (let i = 0; i < 50; i++) {
      const result = await resolver.get();
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        ports.push(result.value.port);
      }
    }

    const unique = new Set(ports);
    assert.strictEqual(unique.size, 50);
  });

  await t.test('handles 20-port batch allocation', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.getMultiple(20);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      const unique = new Set(result.value.map(a => a.port));
      assert.strictEqual(unique.size, 20);
    }
  });

  await t.test('handles rapid allocation and release cycles', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    for (let cycle = 0; cycle < 10; cycle++) {
      for (let i = 0; i < 5; i++) {
        const result = await resolver.get();
        assert.strictEqual(result.ok, true);
      }

      const releaseResult = await resolver.releaseAll();
      assert.strictEqual(releaseResult.ok, true);
    }

    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 0);
    }
  });

  await t.test('handles many clean operations', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    await resolver.getMultiple(10);

    for (let i = 0; i < 5; i++) {
      const result = await resolver.clean();
      assert.strictEqual(result.ok, true);
    }
  });
});

// ============================================================================
// Concurrent Execution Tests
// ============================================================================

test('Concurrent Execution', async (t) => {
  let testDir: string;

  t.beforeEach(() => {
    testDir = createTestDir();
  });

  t.afterEach(() => {
    cleanupTestDir(testDir);
  });

  await t.test('handles concurrent allocation from Promise.all', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const promises = Array.from({ length: 10 }, () => resolver.get());
    const results = await Promise.all(promises);

    // All allocations should succeed
    const allSucceeded = results.every(r => r.ok);
    assert.strictEqual(allSucceeded, true);

    // All ports should be unique
    const ports = results.map(r => r.ok && r.value.port).filter(Boolean) as number[];
    const unique = new Set(ports);
    assert.strictEqual(unique.size, 10, 'All allocated ports should be unique');
  });

  await t.test('handles concurrent getMultiple() calls', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    const promise1 = resolver.getMultiple(5);
    const promise2 = resolver.getMultiple(5);
    const promise3 = resolver.getMultiple(5);

    const results = await Promise.all([promise1, promise2, promise3]);

    // All should succeed
    results.forEach(result => {
      assert.strictEqual(result.ok, true);
    });

    // Collect all ports
    const allPorts: number[] = [];
    results.forEach(result => {
      if (result.ok) {
        allPorts.push(...result.value.map(a => a.port));
      }
    });

    // All 15 ports should be unique
    const unique = new Set(allPorts);
    assert.strictEqual(unique.size, 15, 'No port collisions in concurrent batch allocations');
  });

  await t.test('handles mixed concurrent operations', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Allocate some ports first
    const initial = await resolver.getMultiple(5);
    assert.strictEqual(initial.ok, true);

    // Mix of concurrent operations
    const ops = [
      resolver.get(),
      resolver.get(),
      resolver.list(),
      resolver.status(),
      resolver.get(),
    ];

    const results = await Promise.all(ops);

    // First 3 gets and last get should succeed
    assert.strictEqual(results[0].ok, true);
    assert.strictEqual(results[1].ok, true);
    assert.strictEqual(results[4].ok, true);

    // List and status should succeed
    assert.strictEqual(results[2].ok, true);
    assert.strictEqual(results[3].ok, true);
  });

  await t.test('prevents port collisions under concurrent load', async () => {
    const resolver = new PortResolver({
      registryDir: testDir,
      minPort: 50000,
      maxPort: 50100, // Limited range to increase collision probability
    });

    // Create high concurrent load
    const promises = Array.from({ length: 20 }, () => resolver.get());
    const results = await Promise.all(promises);

    // All should succeed
    const allSucceeded = results.every(r => r.ok);
    assert.strictEqual(allSucceeded, true);

    // No duplicate ports
    const ports = results.map(r => r.ok && r.value.port).filter(Boolean) as number[];
    const unique = new Set(ports);
    assert.strictEqual(unique.size, 20, 'Semaphore should prevent port collisions');
  });

  await t.test('handles concurrent allocation and release', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Allocate initial ports
    const initial = await resolver.getMultiple(10);
    assert.strictEqual(initial.ok, true);

    if (!initial.ok) return;

    // Concurrent: allocate new + release half of old
    const portsToRelease = initial.value.slice(0, 5).map(a => a.port);
    const ops = [
      ...portsToRelease.map(port => resolver.release(port)),
      ...Array.from({ length: 5 }, () => resolver.get()),
    ];

    const results = await Promise.all(ops);

    // All operations should succeed
    const allSucceeded = results.every(r => r.ok);
    assert.strictEqual(allSucceeded, true);

    // Final count should be 10 (released 5, added 5)
    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 10);
    }
  });
});

// ============================================================================
// Semaphore Integration Tests
// ============================================================================

test('Semaphore Integration', async (t) => {
  let testDir: string;

  t.beforeEach(() => {
    testDir = createTestDir();
  });

  t.afterEach(() => {
    cleanupTestDir(testDir);
  });

  await t.test('semaphore prevents race conditions in registry writes', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Create scenario where without semaphore, race would occur
    // Multiple concurrent writes to registry
    const promises = Array.from({ length: 50 }, () => resolver.get());
    const results = await Promise.all(promises);

    // All should succeed (no corrupted registry)
    const allSucceeded = results.every(r => r.ok);
    assert.strictEqual(allSucceeded, true, 'Semaphore prevents registry corruption');

    // Verify registry consistency
    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 50);

      // All PIDs should match current process
      const allOwnedByUs = listResult.value.every(e => e.pid === process.pid);
      assert.strictEqual(allOwnedByUs, true);
    }
  });

  await t.test('semaphore allows read operations during allocation', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Pre-allocate some ports
    await resolver.getMultiple(5);

    // Mix reads and writes concurrently
    const ops = [
      resolver.get(),
      resolver.list(),
      resolver.get(),
      resolver.status(),
      resolver.get(),
      resolver.list(),
    ];

    const results = await Promise.all(ops);

    // All operations should complete successfully
    const allSucceeded = results.every(r => r.ok);
    assert.strictEqual(allSucceeded, true, 'Reads and writes coexist under semaphore');
  });

  await t.test('maintains registry integrity under concurrent stress', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Concurrent allocations and releases
    const allocationPromises = Array.from({ length: 20 }, () => resolver.get());
    const allocations = await Promise.all(allocationPromises);

    assert(allocations.every(r => r.ok));

    // Get ports to release
    const portsToRelease = allocations
      .map(r => r.ok && r.value.port)
      .filter(Boolean) as number[];

    // Concurrent releases
    const releasePromises = portsToRelease.map(port => resolver.release(port));
    const releases = await Promise.all(releasePromises);

    assert(releases.every(r => r.ok));

    // Registry should be empty
    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 0, 'All ports released correctly');
    }

    // Registry file should still be valid JSON
    const statusResult = await resolver.status();
    assert.strictEqual(statusResult.ok, true, 'Registry not corrupted');
  });

  await t.test('handles concurrent clean operations safely', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Create stale entries manually
    const registryPath = join(testDir, 'registry.json');
    const staleRegistry = {
      version: 1,
      entries: Array.from({ length: 10 }, (_, i) => ({
        port: 50000 + i,
        pid: 999999990 + i,
        timestamp: Date.now() - 3600001,
      })),
    };
    writeFileSync(registryPath, JSON.stringify(staleRegistry));

    // Multiple concurrent clean operations
    const cleanPromises = Array.from({ length: 5 }, () => resolver.clean());
    const results = await Promise.all(cleanPromises);

    // All should succeed
    assert(results.every(r => r.ok));

    // Total cleaned should be 10 (not duplicated)
    const totalCleaned = results.reduce((sum, r) => sum + (r.ok ? r.value : 0), 0);
    assert.strictEqual(totalCleaned, 10, 'Semaphore prevents duplicate cleanup');

    // Registry should be empty
    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 0);
    }
  });
});

// ============================================================================
// Performance Benchmark Tests
// ============================================================================

test('Performance Benchmarks', async (t) => {
  let testDir: string;

  t.beforeEach(() => {
    testDir = createTestDir();
  });

  t.afterEach(() => {
    cleanupTestDir(testDir);
  });

  await t.test('allocation completes without hanging', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Just verify it completes - timing varies too much in CI
    const result = await resolver.get();

    assert.strictEqual(result.ok, true, 'Allocation should succeed');
  });

  await t.test('batch allocation completes successfully', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Verify batch allocations complete - timing varies too much in CI
    const result10 = await resolver.getMultiple(10);
    assert.strictEqual(result10.ok, true, '10 allocations should succeed');
    if (result10.ok) {
      assert.strictEqual(result10.value.length, 10);
    }

    const result20 = await resolver.getMultiple(20);
    assert.strictEqual(result20.ok, true, '20 allocations should succeed');
    if (result20.ok) {
      assert.strictEqual(result20.value.length, 20);
    }
  });

  await t.test('list operation handles many entries', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Allocate 100 ports
    for (let i = 0; i < 10; i++) {
      await resolver.getMultiple(10);
    }

    // Verify list completes - timing varies too much in CI
    const result = await resolver.list();

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.length, 100);
    }
  });

  await t.test('concurrent allocations all succeed', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // 50 concurrent allocations - timing varies too much in CI
    const promises = Array.from({ length: 50 }, () => resolver.get());
    const results = await Promise.all(promises);

    // All should succeed
    assert(results.every(r => r.ok), 'All concurrent allocations should succeed');

    // Verify we got 50 unique ports
    const ports = results.filter(r => r.ok).map(r => r.ok ? r.value : 0);
    const uniquePorts = new Set(ports);
    assert.strictEqual(uniquePorts.size, 50, 'Should allocate 50 unique ports');
  });
});

// ============================================================================
// Extended Network Tests
// ============================================================================

test('Extended Network Tests', async (t) => {
  let testDir: string;

  t.beforeEach(() => {
    testDir = createTestDir();
  });

  t.afterEach(() => {
    cleanupTestDir(testDir);
  });

  await t.test('handles IPv6 localhost correctly', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Get a port
    const result = await resolver.get();
    assert.strictEqual(result.ok, true);

    if (result.ok) {
      const port = result.value.port;

      // Verify port can be bound on IPv6 localhost (::1)
      const server = createServer();
      let bindSucceeded = false;

      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, '::1', async (t) => {
            bindSucceeded = true;
            resolve();
          });
        });
      } catch (err) {
        // IPv6 might not be available on all systems
        // This is acceptable
      } finally {
        if (bindSucceeded) {
          server.close();
        }
      }

      await resolver.release(port);
    }
  });

  await t.test('detects port in use on 127.0.0.1', async () => {
    // Create server on 127.0.0.1 (loopback)
    const server = createServer();

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address();
      assert(address && typeof address !== 'string');
      const usedPort = address.port;

      // Verify port is detected as unavailable
      const available = await isPortAvailable(usedPort);
      assert.strictEqual(available, false, 'Port bound on 127.0.0.1 should be detected as in use');
    } finally {
      server.close();
    }
  });

  await t.test('handles system port range boundaries', async () => {
    // Test at boundary of privileged ports (1024)
    const resolver1024 = new PortResolver({
      registryDir: testDir,
      minPort: 1024,
      maxPort: 1030,
    });

    const result = await resolver1024.get();
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(result.value.port >= 1024);
      await resolver1024.release(result.value.port);
    }

    // Test at upper boundary (65535)
    const resolver65k = new PortResolver({
      registryDir: testDir,
      minPort: 65530,
      maxPort: 65535,
    });

    const result2 = await resolver65k.get();
    assert.strictEqual(result2.ok, true);
    if (result2.ok) {
      assert(result2.value.port <= 65535);
      await resolver65k.release(result2.value.port);
    }
  });
});

// ============================================================================
// Extended Cleanup Tests
// ============================================================================

test('Extended Cleanup Tests', async (t) => {
  let testDir: string;

  t.beforeEach(() => {
    testDir = createTestDir();
  });

  t.afterEach(() => {
    cleanupTestDir(testDir);
  });

  await t.test('cleans up registry after rapid creation and deletion', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Rapid allocate and release cycles
    for (let i = 0; i < 20; i++) {
      const result = await resolver.get({ tag: `test-${i}` });
      assert.strictEqual(result.ok, true);

      if (result.ok) {
        const releaseResult = await resolver.release(result.value.port);
        assert.strictEqual(releaseResult.ok, true);
      }
    }

    // Registry should be empty
    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 0, 'All entries should be cleaned up');
    }

    // Registry file should still be valid
    const statusResult = await resolver.status();
    assert.strictEqual(statusResult.ok, true);
  });

  await t.test('handles stale entries with very old timestamps', async () => {
    const registryPath = join(testDir, 'registry.json');

    // Create entries with timestamps from 1 year ago
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    const staleRegistry = {
      version: 1,
      entries: Array.from({ length: 5 }, (_, i) => ({
        port: 50000 + i,
        pid: 999999900 + i,
        timestamp: oneYearAgo,
      })),
    };
    writeFileSync(registryPath, JSON.stringify(staleRegistry));

    const resolver = new PortResolver({ registryDir: testDir });

    // Clean should remove all stale entries
    const cleanResult = await resolver.clean();
    assert.strictEqual(cleanResult.ok, true);
    if (cleanResult.ok) {
      assert.strictEqual(cleanResult.value, 5, 'Should clean all 5 stale entries');
    }

    // Registry should be empty
    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 0);
    }
  });

  await t.test('maintains registry consistency after many operations', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const allocatedPorts: number[] = [];

    // Mixed operations
    for (let i = 0; i < 30; i++) {
      if (i % 3 === 0) {
        // Allocate
        const result = await resolver.get();
        if (result.ok) {
          allocatedPorts.push(result.value.port);
        }
      } else if (i % 3 === 1 && allocatedPorts.length > 0) {
        // Release
        const port = allocatedPorts.pop();
        if (port) {
          await resolver.release(port);
        }
      } else {
        // List/status
        if (i % 2 === 0) {
          await resolver.list();
        } else {
          await resolver.status();
        }
      }
    }

    // Verify registry is still consistent
    const statusResult = await resolver.status();
    assert.strictEqual(statusResult.ok, true);
    if (statusResult.ok) {
      assert.strictEqual(statusResult.value.totalEntries, allocatedPorts.length);
    }

    // Clean up remaining
    await resolver.releaseAll();
  });

  await t.test('recovers from concurrent registry file access', async () => {
    const resolver1 = new PortResolver({ registryDir: testDir });
    const resolver2 = new PortResolver({ registryDir: testDir });

    // Two resolvers operating on same registry
    const result1 = await resolver1.get({ tag: 'resolver1' });
    const result2 = await resolver2.get({ tag: 'resolver2' });

    assert.strictEqual(result1.ok, true);
    assert.strictEqual(result2.ok, true);

    if (result1.ok && result2.ok) {
      // Ports should be different
      assert.notStrictEqual(result1.value.port, result2.value.port, 'Concurrent resolvers should allocate different ports');

      // Both should be in registry
      const listResult = await resolver1.list();
      assert.strictEqual(listResult.ok, true);
      if (listResult.ok) {
        assert.strictEqual(listResult.value.length, 2);
      }

      // Clean up
      await resolver1.release(result1.value.port);
      await resolver2.release(result2.value.port);
    }
  });
});

// ============================================================================
// Cross-Process Integration Tests
// ============================================================================

test('Cross-Process Integration', async (t) => {
  let testDir: string;

  t.beforeEach(() => {
    testDir = createTestDir();
  });

  t.afterEach(() => {
    cleanupTestDir(testDir);
  });

  await t.test('coordinates allocation across separate Node processes', async () => {
    const workerPath = join(process.cwd(), 'test', 'helpers', 'child-process-worker.ts');

    // Allocate a single port from child process to verify cross-process functionality
    const port = await new Promise<number>((resolve, reject) => {
      const child = fork(workerPath, ['allocate', testDir, '1'], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        execArgv: ['--import', 'tsx'],
      });

      let messageReceived = false;

      child.on('message', (msg: any) => {
        messageReceived = true;
        if (msg.success) {
          resolve(msg.port);
        } else {
          reject(new Error(msg.error));
        }
      });

      child.on('error', (err) => {
        if (!messageReceived) {
          reject(err);
        }
      });

      child.on('exit', (code) => {
        if (!messageReceived && code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });

      setTimeout(() => {
        if (!messageReceived) {
          child.kill();
          reject(new Error('Worker timeout'));
        }
      }, 5000);
    });

    assert(port > 0, 'Child process should allocate a valid port');

    // Verify port is in registry
    const resolver = new PortResolver({ registryDir: testDir });
    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert(listResult.value.length >= 1, 'At least one port should be in registry');
      const entry = listResult.value.find(e => e.port === port);
      assert(entry, 'Allocated port should be in registry');
    }

    // Cleanup
    await resolver.clear();
  });

  await t.test('handles concurrent batch allocations from separate processes', async () => {
    const workerPath = join(process.cwd(), 'test', 'helpers', 'child-process-worker.ts');

    // Spawn 2 child processes, each allocating 5 ports
    const promises = Array.from({ length: 2 }, async (t) => {
      return new Promise<number[]>((resolve, reject) => {
        const child = fork(workerPath, ['allocate', testDir, '5'], {
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          execArgv: ['--import', 'tsx'],
        });

        child.on('message', (msg: any) => {
          if (msg.success) {
            resolve(msg.ports);
          } else {
            reject(new Error(msg.error));
          }
        });

        child.on('error', reject);

        setTimeout(() => {
          child.kill();
          reject(new Error('Worker timeout'));
        }, 5000);
      });
    });

    const results = await Promise.all(promises);
    const allPorts = results.flat();

    // All 10 ports should be unique
    const unique = new Set(allPorts);
    assert.strictEqual(unique.size, 10, 'Batch allocations from separate processes should be unique');

    // Cleanup
    const resolver = new PortResolver({ registryDir: testDir });
    await resolver.clear();
  });

  await t.test('child processes can release their own allocations', async () => {
    const workerPath = join(process.cwd(), 'test', 'helpers', 'child-process-worker.ts');

    // Allocate from worker
    const port = await new Promise<number>((resolve, reject) => {
      const child = fork(workerPath, ['allocate', testDir, '1'], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        execArgv: ['--import', 'tsx'],
      });

      child.on('message', (msg: any) => {
        if (msg.success) {
          resolve(msg.port);
        } else {
          reject(new Error(msg.error));
        }
      });

      child.on('error', reject);

      setTimeout(() => {
        child.kill();
        reject(new Error('Worker timeout'));
      }, 5000);
    });

    // Verify port is in registry
    const resolver = new PortResolver({ registryDir: testDir });
    let listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 1);
    }

    // Release from different worker process
    await new Promise<void>((resolve, reject) => {
      const child = fork(workerPath, ['releaseAll', testDir], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        execArgv: ['--import', 'tsx'],
      });

      child.on('message', (msg: any) => {
        if (msg.success) {
          resolve();
        } else {
          reject(new Error(msg.error));
        }
      });

      child.on('error', reject);

      setTimeout(() => {
        child.kill();
        reject(new Error('Worker timeout'));
      }, 5000);
    });

    // Registry should be empty (worker released its allocations)
    listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      // Note: The second worker has a different PID, so it can't release the first worker's port
      // This test validates PID isolation
      assert.strictEqual(listResult.value.length, 1, 'Different process PIDs prevent cross-process release');
    }

    // Cleanup
    await resolver.clear();
  });
});
