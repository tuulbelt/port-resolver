/**
 * Tests for PortResolver Class (src/core/port-resolver.ts)
 * Core port allocation engine with registry management
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PortResolver } from '../src/index.js';

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

test('PortResolver', async (t) => {
  let testDir: string;

  t.beforeEach(() => {
    testDir = createTestDir();
  });

  t.afterEach(() => {
    cleanupTestDir(testDir);
  });

  await t.test('constructor validates configuration', () => {
    const resolver = new PortResolver({ registryDir: testDir });
    assert(resolver instanceof PortResolver);

    assert.throws(() => new PortResolver({ minPort: 0 }));
    assert.throws(() => new PortResolver({ minPort: 70000 }));
    assert.throws(() => new PortResolver({ maxPort: 0 }));
    assert.throws(() => new PortResolver({ maxPort: 70000 }));
    assert.throws(() => new PortResolver({ minPort: 60000, maxPort: 50000 }));
  });

  await t.test('get() allocates a port', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.get();

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(result.value.port >= 1024);
      assert(result.value.port <= 65535);
    }
  });

  await t.test('get() allocates port with tag', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.get({ tag: 'my-server' });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.tag, 'my-server');
    }
  });

  await t.test('getMultiple() allocates multiple ports', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.getMultiple(3);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.length, 3);
      const ports = result.value.map(a => a.port);
      const uniquePorts = new Set(ports);
      assert.strictEqual(uniquePorts.size, 3);
    }
  });

  await t.test('getMultiple() validates count', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    const result = await resolver.getMultiple(0);
    assert.strictEqual(result.ok, false);
  });

  await t.test('release() releases allocated port', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const allocResult = await resolver.get();

    assert.strictEqual(allocResult.ok, true);
    if (allocResult.ok) {
      const releaseResult = await resolver.release(allocResult.value.port);
      assert.strictEqual(releaseResult.ok, true);
    }
  });

  await t.test('release() fails for unregistered port', async () => {
    const resolver = new PortResolver({ registryDir: testDir });
    const result = await resolver.release(99999);
    assert.strictEqual(result.ok, false);
  });

  await t.test('releaseAll() releases all ports for current process', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    await resolver.get();
    await resolver.get();
    await resolver.get();

    const releaseResult = await resolver.releaseAll();
    assert.strictEqual(releaseResult.ok, true);

    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      const myPorts = listResult.value.filter(e => e.pid === process.pid);
      assert.strictEqual(myPorts.length, 0);
    }
  });

  await t.test('list() returns all allocations', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    await resolver.get({ tag: 'test-1' });
    await resolver.get({ tag: 'test-2' });

    const result = await resolver.list();
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(result.value.length >= 2);
    }
  });

  await t.test('clean() removes stale entries', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    const result = await resolver.clean();
    assert.strictEqual(result.ok, true);
  });

  await t.test('status() returns registry status', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    await resolver.get();
    await resolver.get();

    const result = await resolver.status();
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(result.value.totalEntries >= 2);
      assert(result.value.activeEntries >= 2);
    }
  });

  await t.test('clear() clears entire registry', async () => {
    const resolver = new PortResolver({ registryDir: testDir });

    await resolver.get();
    await resolver.get();

    const clearResult = await resolver.clear();
    assert.strictEqual(clearResult.ok, true);

    const listResult = await resolver.list();
    assert.strictEqual(listResult.ok, true);
    if (listResult.ok) {
      assert.strictEqual(listResult.value.length, 0);
    }
  });
});
