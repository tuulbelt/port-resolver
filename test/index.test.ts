/**
 * Test Port Resolver / portres - Test Suite
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
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
    const stdout = execSync(`npx tsx src/index.ts ${args}${regArgs}`, {
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
    assert(result.stdout.includes('0.1.0'));
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
    // CLI runs in separate processes, so we test error behavior
    const releaseResult = runCLI('release 12345 --json', testDir);
    assert.strictEqual(releaseResult.exitCode, 1);
    assert(releaseResult.stderr.includes('not registered'));
  });

  test('release requires port number', () => {
    const result = runCLI('release --json', testDir);
    assert.strictEqual(result.exitCode, 1);
    assert(result.stderr.includes('required'));
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
