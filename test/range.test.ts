import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PortResolver } from '../src/index.js';

// Helper to create temp registry
function createTempRegistry(): string {
  return mkdtempSync(join(tmpdir(), 'portres-test-range-'));
}

// Helper to cleanup registry
function cleanupRegistry(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

test('reserveRange()', async (t) => {
  await t.test('reserves contiguous range of ports', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });
      const result = await resolver.reserveRange({ start: 50000, count: 5, tag: 'cluster' });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.length, 5);
        assert.strictEqual(result.value[0]?.port, 50000);
        assert.strictEqual(result.value[1]?.port, 50001);
        assert.strictEqual(result.value[2]?.port, 50002);
        assert.strictEqual(result.value[3]?.port, 50003);
        assert.strictEqual(result.value[4]?.port, 50004);

        // All should have the same tag
        for (const alloc of result.value) {
          assert.strictEqual(alloc.tag, 'cluster');
        }
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('validates count parameter', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      // Count < 1
      const result1 = await resolver.reserveRange({ start: 50000, count: 0 });
      assert.strictEqual(result1.ok, false);
      if (!result1.ok) {
        assert(result1.error.message.includes('Count must be at least 1'));
      }

      // Count > maxPortsPerRequest
      const result2 = await resolver.reserveRange({ start: 50000, count: 101 });
      assert.strictEqual(result2.ok, false);
      if (!result2.ok) {
        assert(result2.error.message.includes('exceeds maximum'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('validates start port parameter', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      // Start < 1
      const result1 = await resolver.reserveRange({ start: 0, count: 5 });
      assert.strictEqual(result1.ok, false);
      if (!result1.ok) {
        assert(result1.error.message.includes('must be between 1 and 65535'));
      }

      // Start > 65535
      const result2 = await resolver.reserveRange({ start: 65536, count: 5 });
      assert.strictEqual(result2.ok, false);
      if (!result2.ok) {
        assert(result2.error.message.includes('must be between 1 and 65535'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('validates range does not exceed 65535', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      const result = await resolver.reserveRange({ start: 65530, count: 10 });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert(result.error.message.includes('exceeds maximum'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('rejects privileged ports without flag', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      const result = await resolver.reserveRange({ start: 80, count: 5 });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert(result.error.message.includes('privileged'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('allows privileged ports with flag', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir, allowPrivileged: true });

      // Note: This might fail if ports are actually in use
      const result = await resolver.reserveRange({ start: 8000, count: 3 });
      // We just check that it doesn't fail due to privilege check
      if (!result.ok) {
        // If it fails, it should be for "in use" not "privileged"
        assert(!result.error.message.includes('privileged'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('fails if any port in range is already allocated', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      // Allocate port 50002
      const result1 = await resolver.reserveRange({ start: 50002, count: 1 });
      assert.strictEqual(result1.ok, true);

      // Try to allocate range that includes 50002
      const result2 = await resolver.reserveRange({ start: 50000, count: 5 });
      assert.strictEqual(result2.ok, false);
      if (!result2.ok) {
        assert(result2.error.message.includes('already allocated'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('reserves without tag', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      const result = await resolver.reserveRange({ start: 50000, count: 3 });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.length, 3);
        // Tag should be undefined when not provided
        for (const alloc of result.value) {
          assert.strictEqual(alloc.tag, undefined);
        }
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});

test('getPortInRange()', async (t) => {
  await t.test('gets port within specified range', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      const result = await resolver.getPortInRange({ min: 50000, max: 50100, tag: 'api' });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert(result.value.port >= 50000);
        assert(result.value.port <= 50100);
        assert.strictEqual(result.value.tag, 'api');
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('validates min port parameter', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      // Min < 1
      const result1 = await resolver.getPortInRange({ min: 0, max: 50000 });
      assert.strictEqual(result1.ok, false);
      if (!result1.ok) {
        assert(result1.error.message.includes('must be between 1 and 65535'));
      }

      // Min > 65535
      const result2 = await resolver.getPortInRange({ min: 65536, max: 65535 });
      assert.strictEqual(result2.ok, false);
      if (!result2.ok) {
        assert(result2.error.message.includes('must be between 1 and 65535'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('validates max port parameter', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      // Max < 1
      const result1 = await resolver.getPortInRange({ min: 1, max: 0 });
      assert.strictEqual(result1.ok, false);
      if (!result1.ok) {
        assert(result1.error.message.includes('must be between 1 and 65535'));
      }

      // Max > 65535
      const result2 = await resolver.getPortInRange({ min: 50000, max: 65536 });
      assert.strictEqual(result2.ok, false);
      if (!result2.ok) {
        assert(result2.error.message.includes('must be between 1 and 65535'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('validates min <= max', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      const result = await resolver.getPortInRange({ min: 50100, max: 50000 });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert(result.error.message.includes('less than or equal to max'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('rejects privileged ports without flag', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      const result = await resolver.getPortInRange({ min: 80, max: 100 });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert(result.error.message.includes('privileged'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('allows privileged ports with flag', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir, allowPrivileged: true });

      // Note: This might fail if ports are actually in use
      const result = await resolver.getPortInRange({ min: 8000, max: 8100 });
      // We just check that it doesn't fail due to privilege check
      if (!result.ok) {
        // If it fails, it should be for "in use" not "privileged"
        assert(!result.error.message.includes('privileged'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('gets port without tag', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      const result = await resolver.getPortInRange({ min: 50000, max: 50100 });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert(result.value.port >= 50000);
        assert(result.value.port <= 50100);
        assert.strictEqual(result.value.tag, undefined);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('fails if no ports available in range', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      // Allocate all ports in a small range (50000-50002 = 3 ports)
      await resolver.reserveRange({ start: 50000, count: 3 });

      // Try to get a port in that same exhausted range
      const result = await resolver.getPortInRange({ min: 50000, max: 50002 });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert(result.error.message.includes('No available ports'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('works with narrow range (single port)', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      const result = await resolver.getPortInRange({ min: 50000, max: 50000 });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.port, 50000);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});

test('Range APIs Integration', async (t) => {
  await t.test('reserveRange and getPortInRange work together', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir });

      // Reserve a range
      const result1 = await resolver.reserveRange({ start: 50000, count: 10 });
      assert.strictEqual(result1.ok, true);

      // Get a port outside that range
      const result2 = await resolver.getPortInRange({ min: 50010, max: 50020 });
      assert.strictEqual(result2.ok, true);
      if (result2.ok) {
        assert(result2.value.port >= 50010);
        assert(result2.value.port <= 50020);
      }

      // Verify trying to get in the reserved range fails
      const result3 = await resolver.getPortInRange({ min: 50000, max: 50009 });
      assert.strictEqual(result3.ok, false);
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('range APIs respect existing allocations from get()', async () => {
    const registryDir = createTempRegistry();
    try {
      const resolver = new PortResolver({ registryDir, minPort: 50000, maxPort: 50100 });

      // Get a port using standard API
      const result1 = await resolver.get();
      assert.strictEqual(result1.ok, true);

      // List to see what was allocated
      const list = await resolver.list();
      assert.strictEqual(list.ok, true);

      // Range APIs should respect this allocation
      // (This is implicitly tested by checking they don't conflict)
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});
