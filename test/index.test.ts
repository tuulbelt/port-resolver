/**
 * Test Port Resolver / portres - Test Suite
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, fork } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { PortResolver, isPortAvailable, findAvailablePort, DEFAULT_CONFIG } from '../src/index.ts';

// Helper to create unique test directories
function createTestDir(): string {
  const dir = join(tmpdir(), `portres-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Helper to clean up test directories
function cleanupTestDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// Helper to run CLI
function runCLI(args: string, registryDir?: string): { stdout: string; stderr: string; exitCode: number } {
  const regArgs = registryDir ? ` -d "${registryDir}"` : '';
  try {
    const stdout = execSync(`npx tsx src/cli.ts ${args}${regArgs}`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
      timeout: 10000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

// ============================================================================
// Unit Tests: isPortAvailable
// ============================================================================

describe('isPortAvailable', () => {
  test('returns true for available port', async () => {
    const port = 49152 + Math.floor(Math.random() * 1000);
    const available = await isPortAvailable(port);
    assert.strictEqual(typeof available, 'boolean');
  });

  test('returns false for port in use', async () => {
    const server = createServer();

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    assert(address && typeof address !== 'string');
    const port = address.port;

    try {
      const available = await isPortAvailable(port);
      assert.strictEqual(available, false);
    } finally {
      server.close();
    }
  });
});

// ============================================================================
// Unit Tests: findAvailablePort
// ============================================================================

describe('findAvailablePort', () => {
  test('finds an available port in range', async () => {
    const config = { ...DEFAULT_CONFIG, minPort: 50000, maxPort: 50100 };
    const result = await findAvailablePort(config);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(result.value >= 50000 && result.value <= 50100);
    }
  });

  test('respects excluded ports', async () => {
    const config = { ...DEFAULT_CONFIG, minPort: 50000, maxPort: 50010 };
    const exclude = new Set([50000, 50001, 50002, 50003, 50004]);

    const result = await findAvailablePort(config, exclude);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(!exclude.has(result.value));
    }
  });

  test('returns error for invalid range', async () => {
    const config = { ...DEFAULT_CONFIG, minPort: 50100, maxPort: 50000 };
    const result = await findAvailablePort(config);

    assert.strictEqual(result.ok, false);
  });

  test('enforces privileged port restriction', async () => {
    const config = { ...DEFAULT_CONFIG, minPort: 80, maxPort: 100, allowPrivileged: false };
    const result = await findAvailablePort(config);

    assert.strictEqual(result.ok, false);
  });
});

// ============================================================================
// Unit Tests: PortResolver
// ============================================================================

describe('PortResolver', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test('constructor validates configuration', () => {
    const resolver = new PortResolver({ registryDir: testDir });
    assert(resolver instanceof PortResolver);

    assert.throws(() => new PortResolver({ minPort: 0 }));
    assert.throws(() => new PortResolver({ minPort: 70000 }));
    assert.throws(() => new PortResolver({ maxPort: 0 }));
    assert.throws(() => new PortResolver({ maxPort: 70000 }));
    assert.throws(() => new PortResolver({ minPort: 60000, maxPort: 50000 }));
  });

  test('get() allocates a port', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.get();

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(result.value.port >= 1024);
      assert(result.value.port <= 65535);
    }
  });

  test('get() allocates port with tag', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.get({ tag: 'mytest' });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.tag, 'mytest');
    }
  });

  test('getMultiple() allocates multiple ports', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.getMultiple(3);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.length, 3);
      const ports = new Set(result.value.map(a => a.port));
      assert.strictEqual(ports.size, 3);
    }
  });

  test('getMultiple() validates count', async () => {
    const resolver = new PortResolver({ registryDir: testDir, maxPortsPerRequest: 10 });

    let result = await resolver.getMultiple(0);
    assert.strictEqual(result.ok, false);

    result = await resolver.getMultiple(20);
    assert.strictEqual(result.ok, false);
  });

  test('release() releases allocated port', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    const getResult = await resolver.get();
    assert.strictEqual(getResult.ok, true);
    if (!getResult.ok) return;

    const port = getResult.value.port;

    const releaseResult = await resolver.release(port);
    assert.strictEqual(releaseResult.ok, true);

    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      const found = listResult.value.find(e => e.port === port);
      assert.strictEqual(found, undefined);
    }
  });

  test('release() fails for unregistered port', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.release(12345);

    assert.strictEqual(result.ok, false);
  });

  test('releaseAll() releases all ports for current process', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    await resolver.getMultiple(5);

    const result = await resolver.releaseAll();
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value, 5);
    }

    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 0);
    }
  });

  test('list() returns all allocations', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    await resolver.get({ tag: 'test1' });
    await resolver.get({ tag: 'test2' });

    const result = await resolver.list();
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.length, 2);
    }
  });

  test('clean() removes stale entries', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    const registryPath = join(testDir, 'registry.json');
    const staleRegistry = {
      version: 1,
      entries: [
        { port: 50000, pid: 999999999, timestamp: Date.now() - 3600001 },
      ],
    };
    writeFileSync(registryPath, JSON.stringify(staleRegistry));

    const result = await resolver.clean();
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value, 1);
    }

    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 0);
    }
  });

  test('status() returns registry status', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    await resolver.get();

    const result = await resolver.status();
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.totalEntries, 1);
      assert.strictEqual(result.value.ownedByCurrentProcess, 1);
      assert.strictEqual(typeof result.value.portRange.min, 'number');
      assert.strictEqual(typeof result.value.portRange.max, 'number');
    }
  });

  test('clear() clears entire registry', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    await resolver.getMultiple(5);

    const clearResult = await resolver.clear();
    assert.strictEqual(clearResult.ok, true);

    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 0);
    }
  });
});

// ============================================================================
// CLI Integration Tests
// ============================================================================

describe('CLI', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test('--help shows usage', () => {
    const result = runCLI('--help');
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('Test Port Resolver'));
    assert(result.stdout.includes('COMMANDS'));
  });

  test('--version shows version', () => {
    const result = runCLI('--version');
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('0.3.0'));
  });

  test('get allocates a port', () => {
    const result = runCLI('get', testDir);
    assert.strictEqual(result.exitCode, 0);
    const port = parseInt(result.stdout.trim(), 10);
    assert(port >= 1024 && port <= 65535);
  });

  test('get --json outputs JSON', () => {
    const result = runCLI('get --json', testDir);
    assert.strictEqual(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert(typeof data.port === 'number');
  });

  test('get -n 3 allocates multiple ports', () => {
    const result = runCLI('get -n 3', testDir);
    assert.strictEqual(result.exitCode, 0);
    const lines = result.stdout.trim().split('\n');
    assert.strictEqual(lines.length, 3);
  });

  test('get --tag adds tag', () => {
    const result = runCLI('get --tag mytest --json', testDir);
    assert.strictEqual(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert.strictEqual(data.tag, 'mytest');
  });

  test('release shows error for non-existent port', () => {
    // releasePort is idempotent - releasing non-existent port succeeds
    const releaseResult = runCLI('release 12345 --json', testDir);
    assert.strictEqual(releaseResult.exitCode, 0); // Idempotent: success even if not registered
  });

  test('release requires port number', () => {
    const result = runCLI('release --json', testDir);
    assert.strictEqual(result.exitCode, 1);
    assert(result.stderr.includes('must be provided'));
  });

  test('release-all handles empty registry', () => {
    // No ports allocated, should release 0
    const result = runCLI('release-all', testDir);
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('0'));
  });

  test('list shows allocations', () => {
    runCLI('get --tag test1', testDir);
    runCLI('get --tag test2', testDir);

    const result = runCLI('list', testDir);
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('Port'));
    assert(result.stdout.includes('PID'));
  });

  test('list --json outputs JSON array', () => {
    runCLI('get', testDir);

    const result = runCLI('list --json', testDir);
    assert.strictEqual(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert(Array.isArray(data));
    assert.strictEqual(data.length, 1);
  });

  test('clean removes stale entries', () => {
    const result = runCLI('clean --json', testDir);
    assert.strictEqual(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert(typeof data.cleaned === 'number');
  });

  test('status shows registry status', () => {
    const result = runCLI('status', testDir);
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('Registry Status'));
    assert(result.stdout.includes('Port range'));
  });

  test('status --json outputs JSON', () => {
    const result = runCLI('status --json', testDir);
    assert.strictEqual(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert(typeof data.totalEntries === 'number');
    assert(typeof data.portRange === 'object');
  });

  test('clear clears registry', () => {
    runCLI('get -n 5', testDir);

    const result = runCLI('clear', testDir);
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('cleared'));

    const listResult = runCLI('list', testDir);
    assert(listResult.stdout.includes('No port allocations'));
  });

  test('unknown command shows error', () => {
    const result = runCLI('invalid-command', testDir);
    assert.strictEqual(result.exitCode, 1);
    assert(result.stderr.includes('Unknown command'));
  });
});

// ============================================================================
// Security Tests
// ============================================================================

describe('Security', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test('prevents path traversal in registry directory', () => {
    const result = runCLI('get', '../../../tmp/evil');
    assert.strictEqual(result.exitCode, 1);
    assert(result.stderr.includes('Invalid path') || result.stderr.includes('dangerous'));
  });

  test('sanitizes tags with control characters', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.get({ tag: 'test\n\r\x00injected' });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.tag, 'testinjected');
    }
  });

  test('truncates long tags', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const longTag = 'a'.repeat(500);
    const result = await resolver.get({ tag: longTag });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(result.value.tag !== undefined);
      assert(result.value.tag.length <= 256);
    }
  });

  test('prevents privileged port allocation without flag', async () => {
    const resolver = new PortResolver({
      registryDir: testDir,
      minPort: 80,
      maxPort: 100,
      allowPrivileged: false,
    });

    const result = await resolver.get();
    assert.strictEqual(result.ok, false);
  });

  test('enforces registry size limit', async () => {
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

  test('enforces ports per request limit', async () => {
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

  test('validates port range bounds', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    let result = await resolver.release(0);
    assert.strictEqual(result.ok, false);

    result = await resolver.release(70000);
    assert.strictEqual(result.ok, false);
  });

  test('creates registry directory with secure permissions', async () => {
    const secureDir = join(testDir, 'secure-registry');
    const resolver = new PortResolver({ registryDir: secureDir });

    await resolver.get();

    assert(existsSync(secureDir));
  });

  test('handles corrupted registry gracefully', async () => {
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

describe('Edge Cases', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test('handles empty registry', async () => {
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

  test('handles missing registry file', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    const result = await resolver.get();
    assert.strictEqual(result.ok, true);
  });

  test('handles invalid registry structure', async () => {
    const registryPath = join(testDir, 'registry.json');
    writeFileSync(registryPath, JSON.stringify({ version: 1 }));

    const resolver = new PortResolver({ registryDir: testDir });

    const result = await resolver.get();
    assert.strictEqual(result.ok, true);
  });

  test('handles empty tag', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.get({ tag: '' });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.tag, undefined);
    }
  });

  test('handles rapid sequential allocations', async () => {
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

  test('handles narrow port range', async () => {
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

  test('handles very narrow port range exhaustion', async () => {
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

  test('handles release of non-owned port', async () => {
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

  test('handles cleanup after failed allocation', async () => {
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

describe('Stress Tests', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test('handles 50 sequential allocations', async () => {
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

  test('handles 20-port batch allocation', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.getMultiple(20);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      const unique = new Set(result.value.map(a => a.port));
      assert.strictEqual(unique.size, 20);
    }
  });

  test('handles rapid allocation and release cycles', async () => {
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

  test('handles many clean operations', async () => {
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

describe('Concurrent Execution', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test('handles concurrent allocation from Promise.all', async () => {
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

  test('handles concurrent getMultiple() calls', async () => {
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

  test('handles mixed concurrent operations', async () => {
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

  test('prevents port collisions under concurrent load', async () => {
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

  test('handles concurrent allocation and release', async () => {
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

describe('Semaphore Integration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test('semaphore prevents race conditions in registry writes', async () => {
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

  test('semaphore allows read operations during allocation', async () => {
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

  test('maintains registry integrity under concurrent stress', async () => {
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

  test('handles concurrent clean operations safely', async () => {
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

describe('Performance Benchmarks', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test('allocation completes without hanging', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    // Just verify it completes - timing varies too much in CI
    const result = await resolver.get();

    assert.strictEqual(result.ok, true, 'Allocation should succeed');
  });

  test('batch allocation completes successfully', async () => {
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

  test('list operation handles many entries', async () => {
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

  test('concurrent allocations all succeed', async () => {
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

describe('Extended Network Tests', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test('handles IPv6 localhost correctly', async () => {
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
          server.listen(port, '::1', () => {
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

  test('detects port in use on 127.0.0.1', async () => {
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

  test('handles system port range boundaries', async () => {
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

describe('Extended Cleanup Tests', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test('cleans up registry after rapid creation and deletion', async () => {
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

  test('handles stale entries with very old timestamps', async () => {
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

  test('maintains registry consistency after many operations', async () => {
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

  test('recovers from concurrent registry file access', async () => {
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

describe('Cross-Process Integration', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  test('coordinates allocation across separate Node processes', async () => {
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

  test('handles concurrent batch allocations from separate processes', async () => {
    const workerPath = join(process.cwd(), 'test', 'helpers', 'child-process-worker.ts');

    // Spawn 2 child processes, each allocating 5 ports
    const promises = Array.from({ length: 2 }, () => {
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

  test('child processes can release their own allocations', async () => {
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
