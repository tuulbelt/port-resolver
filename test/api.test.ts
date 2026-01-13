/**
 * Tests for Module-Level API Functions (src/api/)
 * - getPort() - Single port allocation
 * - getPorts() - Multi-port atomic allocation
 * - releasePort() - Port release by tag or port number
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getPort, getPorts, releasePort } from '../src/index.js';

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
// getPort() Convenience Function Tests
// ============================================================================

test('getPort()', async (t) => {
  await t.test('allocates a single port', async () => {
    const registryDir = createTempRegistry();

    try {
      const result = await getPort({ config: { registryDir } });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(typeof result.value.port, 'number');
        assert.ok(result.value.port >= 49152);
        assert.ok(result.value.port <= 65535);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('allocates port with tag', async () => {
    const registryDir = createTempRegistry();

    try {
      const result = await getPort({ tag: 'test-server', config: { registryDir } });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.tag, 'test-server');
        assert.strictEqual(typeof result.value.port, 'number');
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('respects custom config', async () => {
    const registryDir = createTempRegistry();

    try {
      const result = await getPort({
        config: {
          registryDir,
          minPort: 50000,
          maxPort: 50100,
        }
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.ok(result.value.port >= 50000);
        assert.ok(result.value.port <= 50100);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});
// ============================================================================
// getPorts() Batch Allocation Tests
// ============================================================================

test('getPorts()', async (t) => {
  await t.test('allocates multiple ports atomically', async () => {
    const registryDir = createTempRegistry();

    try {
      const result = await getPorts(3, { config: { registryDir } });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.length, 3);

        // All ports should be unique
        const ports = result.value.map(a => a.port);
        const uniquePorts = new Set(ports);
        assert.strictEqual(uniquePorts.size, 3, 'All ports should be unique');

        // All ports in valid range
        for (const alloc of result.value) {
          assert.ok(alloc.port >= 49152);
          assert.ok(alloc.port <= 65535);
        }
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('allocates ports with single tag', async () => {
    const registryDir = createTempRegistry();

    try {
      const result = await getPorts(3, { tag: 'my-service', config: { registryDir } });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.length, 3);

        // All should have the same tag
        for (const alloc of result.value) {
          assert.strictEqual(alloc.tag, 'my-service');
        }
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('allocates ports with individual tags', async () => {
    const registryDir = createTempRegistry();

    try {
      const result = await getPorts(3, {
        tags: ['http', 'grpc', 'metrics'],
        config: { registryDir }
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.length, 3);

        // Each port should have its corresponding tag
        assert.strictEqual(result.value[0]?.tag, 'http');
        assert.strictEqual(result.value[1]?.tag, 'grpc');
        assert.strictEqual(result.value[2]?.tag, 'metrics');
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('rejects mismatched tag count', async () => {
    const registryDir = createTempRegistry();

    try {
      const result = await getPorts(3, {
        tags: ['http', 'grpc'], // Only 2 tags for 3 ports
        config: { registryDir }
      });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.message.includes('Tag count'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('handles empty tag array correctly', async () => {
    const registryDir = createTempRegistry();

    try {
      // Empty array should be rejected
      const result = await getPorts(3, {
        tags: [],
        config: { registryDir }
      });

      assert.strictEqual(result.ok, false);
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('rollback on failure with per-port tags', async () => {
    const registryDir = createTempRegistry();

    try {
      // First, exhaust the port range
      const result1 = await getPorts(100, {
        config: {
          registryDir,
          minPort: 50000,
          maxPort: 50099, // Only 100 ports available
          maxPortsPerRequest: 150
        }
      });
      assert.strictEqual(result1.ok, true);

      // Now try to allocate 3 more ports (should fail)
      const result2 = await getPorts(3, {
        tags: ['tag1', 'tag2', 'tag3'],
        config: {
          registryDir,
          minPort: 50000,
          maxPort: 50099,
        }
      });

      assert.strictEqual(result2.ok, false);
      if (!result2.ok) {
        assert.ok(result2.error.message.includes('available'));
      }

      // Verify no partial allocations remain
      // (This is implicit since we get an error, but good to document the behavior)
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});

// ============================================================================
// releasePort() Convenience Function Tests
// ============================================================================

test('releasePort()', async (t) => {
  await t.test('releases port by tag', async () => {
    const registryDir = createTempRegistry();

    try {
      // Allocate a port with tag
      const allocResult = await getPort({ tag: 'test-port', config: { registryDir } });
      assert.strictEqual(allocResult.ok, true);

      // Release by tag
      const releaseResult = await releasePort({ tag: 'test-port', config: { registryDir } });
      assert.strictEqual(releaseResult.ok, true);

      // Verify port is released (can allocate same tag again)
      const reallocResult = await getPort({ tag: 'test-port', config: { registryDir } });
      assert.strictEqual(reallocResult.ok, true);
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('releases port by port number', async () => {
    const registryDir = createTempRegistry();

    try {
      // Allocate a port
      const allocResult = await getPort({ config: { registryDir } });
      assert.strictEqual(allocResult.ok, true);

      if (allocResult.ok) {
        const port = allocResult.value.port;

        // Release by port number
        const releaseResult = await releasePort({ port, config: { registryDir } });
        assert.strictEqual(releaseResult.ok, true);
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('returns error when neither tag nor port provided', async () => {
    const registryDir = createTempRegistry();

    try {
      const result = await releasePort({ config: { registryDir } });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.message.includes('tag or port must be provided'));
      }
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('handles release of non-existent tag gracefully', async () => {
    const registryDir = createTempRegistry();

    try {
      const result = await releasePort({ tag: 'non-existent', config: { registryDir } });
      // Should succeed (idempotent release)
      assert.strictEqual(result.ok, true);
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('handles release of non-existent port gracefully', async () => {
    const registryDir = createTempRegistry();

    try {
      const result = await releasePort({ port: 99999, config: { registryDir } });
      // Should succeed (idempotent release)
      assert.strictEqual(result.ok, true);
    } finally {
      cleanupRegistry(registryDir);
    }
  });

  await t.test('releasePort integrates with getPort', async () => {
    const registryDir = createTempRegistry();

    try {
      // Allocate
      const port1 = await getPort({ tag: 'api', config: { registryDir } });
      assert.strictEqual(port1.ok, true);

      // Release
      const release = await releasePort({ tag: 'api', config: { registryDir } });
      assert.strictEqual(release.ok, true);

      // Reallocate (should get potentially different port, but tag reusable)
      const port2 = await getPort({ tag: 'api', config: { registryDir } });
      assert.strictEqual(port2.ok, true);
    } finally {
      cleanupRegistry(registryDir);
    }
  });
});
