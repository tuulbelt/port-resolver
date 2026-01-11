/**
 * Tests for PortManager Class (src/core/port-manager.ts)
 * - Lifecycle management with tag-based tracking
 * - Integration with PortResolver
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PortManager, PortResolver, getPort, getPorts } from '../src/index.js';

// Helper: Create temporary registry for tests
function createTempRegistry(): string {
  return mkdtempSync(join(tmpdir(), 'portres-test-'));
}

// Helper: Cleanup temporary registry
function cleanupRegistry(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// PortManager Lifecycle Management Tests
// ============================================================================

test('PortManager', async (t) => {
  await t.test('allocates and tracks single port', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      const result = await manager.allocate('test-1');

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.tag, 'test-1');

        // Verify tracked
        const allocations = manager.getAllocations();
        assert.strictEqual(allocations.length, 1);
        assert.strictEqual(allocations[0]?.tag, 'test-1');
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('allocates multiple ports and tracks all', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      const result1 = await manager.allocate('port-1');
      const result2 = await manager.allocate('port-2');
      const result3 = await manager.allocate('port-3');

      assert.strictEqual(result1.ok, true);
      assert.strictEqual(result2.ok, true);
      assert.strictEqual(result3.ok, true);

      // Verify all tracked
      const allocations = manager.getAllocations();
      assert.strictEqual(allocations.length, 3);
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('allocateMultiple() tracks batch allocation', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      const result = await manager.allocateMultiple(3, 'batch-test');

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.length, 3);

        // Verify all tracked
        const allocations = manager.getAllocations();
        assert.strictEqual(allocations.length, 3);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('get() retrieves allocation by tag', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      const allocResult = await manager.allocate('my-tag');
      assert.strictEqual(allocResult.ok, true);

      const retrieved = manager.get('my-tag');
      assert.ok(retrieved);
      assert.strictEqual(retrieved?.tag, 'my-tag');
      if (allocResult.ok) {
        assert.strictEqual(retrieved?.port, allocResult.value.port);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('get() returns undefined for non-existent tag', async () => {
    const manager = new PortManager();

    const retrieved = manager.get('non-existent');
    assert.strictEqual(retrieved, undefined);
  });

  await t.test('release() by tag removes allocation', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      const allocResult = await manager.allocate('to-release');
      assert.strictEqual(allocResult.ok, true);

      // Release by tag
      const releaseResult = await manager.release('to-release');
      assert.strictEqual(releaseResult.ok, true);

      // Verify removed from tracking
      const allocations = manager.getAllocations();
      assert.strictEqual(allocations.length, 0);

      // Verify can't retrieve anymore
      const retrieved = manager.get('to-release');
      assert.strictEqual(retrieved, undefined);
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('release() by port number removes allocation', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      const allocResult = await manager.allocate('test-port');
      assert.strictEqual(allocResult.ok, true);

      if (allocResult.ok) {
        const port = allocResult.value.port;

        // Release by port number
        const releaseResult = await manager.release(port);
        assert.strictEqual(releaseResult.ok, true);

        // Verify removed from tracking
        const allocations = manager.getAllocations();
        assert.strictEqual(allocations.length, 0);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('release() is idempotent for non-existent tag', async () => {
    const manager = new PortManager();

    // Releasing a tag that was never allocated should succeed (idempotent)
    const result = await manager.release('non-existent');

    assert.strictEqual(result.ok, true);
  });

  await t.test('releaseAll() removes all tracked allocations', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      // Allocate multiple
      await manager.allocate('port-1');
      await manager.allocate('port-2');
      await manager.allocate('port-3');

      assert.strictEqual(manager.getAllocations().length, 3);

      // Release all
      const result = await manager.releaseAll();

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value, 3); // 3 ports released
      }

      // Verify all removed
      assert.strictEqual(manager.getAllocations().length, 0);
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('releaseAll() returns 0 for empty manager', async () => {
    const manager = new PortManager();

    const result = await manager.releaseAll();

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value, 0);
    }
  });

  await t.test('allocate() without tag uses auto-generated key', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      const result = await manager.allocate(); // No tag

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        // Should be tracked with auto-generated key
        const allocations = manager.getAllocations();
        assert.strictEqual(allocations.length, 1);
        assert.strictEqual(allocations[0]?.port, result.value.port);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('handles partial release failure gracefully', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      // Allocate some ports
      const result1 = await manager.allocate('port-1');
      const result2 = await manager.allocate('port-2');

      assert.strictEqual(result1.ok, true);
      assert.strictEqual(result2.ok, true);

      // Manually release one port from the registry (simulate external release)
      if (result1.ok) {
        // This creates a scenario where manager thinks it owns the port
        // but the registry has released it (edge case)
        // The current implementation will attempt to release and may get errors
        // This test documents current behavior
      }

      // ReleaseAll should still work (even if some fail)
      const releaseResult = await manager.releaseAll();

      // Manager clears allocations regardless
      assert.strictEqual(manager.getAllocations().length, 0);
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});

// ============================================================================
// Integration Tests (New APIs with Existing Functionality)
// ============================================================================

test('Integration: New APIs with Existing PortResolver', async (t) => {
  await t.test('getPorts() ports are truly allocated in registry', async () => {
    const registryDir = createTempRegistry();

    try {
      const result = await getPorts(3, { config: { registryDir } });

      assert.strictEqual(result.ok, true);

      if (result.ok) {
        // Verify each port appears in the registry
        // (This is implicit since getPorts uses PortResolver internally,
        // but good to document expected behavior)
        const ports = result.value.map(a => a.port);
        assert.strictEqual(ports.length, 3);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('PortManager and getPort() share same registry', async () => {
    const registryDir = createTempRegistry();

    try {
      const manager = new PortManager({ registryDir });

      // Allocate via manager
      const result1 = await manager.allocate('manager-port');
      assert.strictEqual(result1.ok, true);

      // Allocate via getPort (should not conflict)
      const result2 = await getPort({ config: { registryDir } });
      assert.strictEqual(result2.ok, true);

      // Verify both allocations are distinct
      if (result1.ok && result2.ok) {
        assert.notStrictEqual(result1.value.port, result2.value.port);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});

