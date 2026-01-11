/**
 * Edge Case Tests for port-resolver v0.2.0
 *
 * Tests recommended edge cases from AUDIT_FINDINGS.md
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PortResolver, getPort, getPorts, PortManager, type PortAllocation } from '../src/index.js';

function createTempRegistry(): string {
  return mkdtempSync(join(tmpdir(), 'port-resolver-edge-'));
}

function cleanupRegistry(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}

// ============================================================================
// Range API Edge Cases
// ============================================================================

test('Range API Edge Cases', async (t) => {
  await t.test('reserveRange with overlapping existing allocations', async () => {
    const registryDir = createTempRegistry();

    try {
      const resolver = new PortResolver({ registryDir, minPort: 50000, maxPort: 50100 });

      // Allocate individual ports that will overlap with range
      const port1 = await resolver.get({ tag: 'existing-1' });
      assert.strictEqual(port1.ok, true);

      const port2 = await resolver.get({ tag: 'existing-2' });
      assert.strictEqual(port2.ok, true);

      // Reserve a range - should work around existing allocations
      const range = await resolver.reserveRange({ count: 5, tag: 'my-range' });
      assert.strictEqual(range.ok, true);
      if (range.ok) {
        assert.strictEqual(range.value.ports.length, 5);

        // Verify no overlap
        if (port1.ok && port2.ok) {
          const existing = [port1.value.port, port2.value.port];
          const overlap = range.value.ports.some(p => existing.includes(p));
          assert.strictEqual(overlap, false);
        }
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('getPortInRange with no available ports in range', async () => {
    const registryDir = createTempRegistry();

    try {
      // Use very narrow range
      const resolver = new PortResolver({ registryDir, minPort: 60000, maxPort: 60002 });

      // Allocate all ports in range (3 ports: 60000, 60001, 60002)
      const p1 = await resolver.get({ tag: 'p1' });
      const p2 = await resolver.get({ tag: 'p2' });
      const p3 = await resolver.get({ tag: 'p3' });

      assert.strictEqual(p1.ok, true);
      assert.strictEqual(p2.ok, true);
      assert.strictEqual(p3.ok, true);

      // Try to get port in specific sub-range - should fail
      const result = await resolver.getPortInRange({
        tag: 'overflow',
        min: 60000,
        max: 60002
      });

      assert.strictEqual(result.ok, false);
      assert(result.error.message.includes('No available ports'));
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('Range validation: min > max', async () => {
    const registryDir = createTempRegistry();

    try {
      const resolver = new PortResolver({ registryDir });

      const result = await resolver.getPortInRange({
        tag: 'invalid',
        min: 50100,
        max: 50000  // max < min
      });

      assert.strictEqual(result.ok, false);
      assert(result.error.message.includes('less than or equal to'));
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('Range validation: count exceeds available range', async () => {
    const registryDir = createTempRegistry();

    try {
      const resolver = new PortResolver({ registryDir, minPort: 50000, maxPort: 50005 });

      // Try to reserve 10 ports from range that only has 6 (50000-50005)
      const result = await resolver.reserveRange({ count: 10, tag: 'too-many' });

      assert.strictEqual(result.ok, false);
      assert(result.error.message.includes('No available ports'));
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});

// ============================================================================
// PortManager Edge Cases
// ============================================================================

test('PortManager Edge Cases', async (t) => {
  await t.test('Double allocation of same tag fails', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      // Allocate port with tag
      const first = await manager.allocate('api');
      assert.strictEqual(first.ok, true);

      // Try to allocate again with same tag
      const second = await manager.allocate('api');
      assert.strictEqual(second.ok, false);
      assert(second.error.message.includes('already in use'));
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('Release non-existent tag succeeds (idempotent)', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      // Release tag that was never allocated
      const result = await manager.release('non-existent');

      // Should succeed (idempotent behavior - PortManager.release handles this)
      assert.strictEqual(result.ok, true);
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('allocateMultiple consistency', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      // Allocate 3 ports with same prefix tag
      const result = await manager.allocateMultiple(3, 'service');

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.length, 3);
        // All should have unique tags and ports
        const tags = result.value.map(a => a.tag);
        const ports = result.value.map(a => a.port);
        assert.strictEqual(new Set(tags).size, 3);
        assert.strictEqual(new Set(ports).size, 3);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('allocateMultiple with exhausted port range fails', async () => {
    const registryDir = createTempRegistry();

    try {
      // Very narrow range (only 3 ports)
      const manager = new PortManager({ registryDir, minPort: 60000, maxPort: 60002 });

      // Try to allocate 5 ports when only 3 available
      const result = await manager.allocateMultiple(5, 'service');

      assert.strictEqual(result.ok, false);
      assert(result.error.message.includes('No available ports'));
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});

// ============================================================================
// Module-Level API Edge Cases
// ============================================================================

test('Module-Level API Edge Cases', async (t) => {
  await t.test('getPorts with tags array uses correct count', async () => {
    const registryDir = createTempRegistry();

    try {
      // Provide 3 tags
      const result = await getPorts({
        tags: ['api', 'db', 'cache'],
        config: { registryDir }
      });

      // Should allocate 3 ports (one per tag)
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.length, 3);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('getPort config inheritance (custom port range)', async () => {
    const registryDir = createTempRegistry();

    try {
      // Use custom minPort/maxPort in config
      const result = await getPort({
        tag: 'custom',
        config: { registryDir, minPort: 55000, maxPort: 55100 }
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert(result.value.port >= 55000 && result.value.port <= 55100);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('getPorts with count only (no tags)', async () => {
    const registryDir = createTempRegistry();

    try {
      // Allocate 5 ports without specific tags
      const result = await getPorts({
        count: 5,
        config: { registryDir }
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.length, 5);
        // All should be unique
        const unique = new Set(result.value.map(a => a.port));
        assert.strictEqual(unique.size, 5);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});

// ============================================================================
// Resilience Tests
// ============================================================================

test('Resilience Tests', async (t) => {
  await t.test('Batch allocation rollback verification', async () => {
    const registryDir = createTempRegistry();

    try {
      const resolver = new PortResolver({ registryDir, minPort: 50000, maxPort: 50005 });

      // Allocate some ports first
      await resolver.get({ tag: 'existing-1' });
      await resolver.get({ tag: 'existing-2' });

      // Try to reserve more ports than available
      const result = await resolver.reserveRange({ count: 10, tag: 'batch' });
      assert.strictEqual(result.ok, false);

      // Verify no partial allocation - should still only have 2 allocations
      const list = await resolver.list();
      assert.strictEqual(list.ok, true);
      if (list.ok) {
        assert.strictEqual(list.value.length, 2);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('Concurrent PortManager instances share registry', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager1 = new PortManager({ registryDir });
      const manager2 = new PortManager({ registryDir });

      // Allocate from manager1
      const port1 = await manager1.allocate('service-1');
      assert.strictEqual(port1.ok, true);

      // Manager2 cannot allocate same tag (shares same registry)
      const port2 = await manager2.allocate('service-1');
      assert.strictEqual(port2.ok, false);
      assert(port2.error.message.includes('already in use'));
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('Registry corruption recovery: malformed JSON', async () => {
    const registryDir = createTempRegistry();

    try {
      // Create corrupted registry file
      const registryFile = join(registryDir, 'ports.json');
      writeFileSync(registryFile, '{ invalid json }');

      // Try to allocate - should handle gracefully
      const result = await getPort({ tag: 'test', config: { registryDir } });

      // Should fail with clear error (not crash)
      assert.strictEqual(result.ok, false);
      assert(result.error.message.length > 0);
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('Registry corruption recovery: missing version field', async () => {
    const registryDir = createTempRegistry();

    try {
      // Create registry without version field
      const registryFile = join(registryDir, 'ports.json');
      writeFileSync(registryFile, JSON.stringify({ entries: [] }));

      const result = await getPort({ tag: 'test', config: { registryDir } });

      // Should fail with validation error
      assert.strictEqual(result.ok, false);
      assert(result.error.message.includes('version') || result.error.message.includes('Invalid'));
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('Large batch allocation performance', async () => {
    const registryDir = createTempRegistry();

    try {
      const tags = Array.from({ length: 50 }, (_, i) => `service-${i}`);

      const result = await getPorts({ tags, config: { registryDir } });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.length, 50);
        // Verify uniqueness
        const unique = new Set(result.value.map(a => a.port));
        assert.strictEqual(unique.size, 50);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('Stress test: rapid allocate/release cycles', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      // Rapidly allocate and release 20 times
      for (let i = 0; i < 20; i++) {
        const tag = `service-${i}`;

        const allocated = await manager.allocate(tag);
        assert.strictEqual(allocated.ok, true);

        const released = await manager.release(tag);
        assert.strictEqual(released.ok, true);
      }

      // Verify clean state with releaseAll
      const remaining = await manager.releaseAll();
      assert.strictEqual(remaining.ok, true);
      if (remaining.ok) {
        assert.strictEqual(remaining.value, 0);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});
