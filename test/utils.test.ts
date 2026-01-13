/**
 * Unit tests for utility functions
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTag, validatePath } from '../src/utils/path-validation.js';
import { isProcessRunning, filterStaleEntries } from '../src/utils/process.js';
import type { PortEntry } from '../src/types.js';

// ============================================================================
// sanitizeTag() Tests
// ============================================================================

test('sanitizeTag', async (t) => {
  await t.test('returns undefined for undefined input', () => {
    const result = sanitizeTag(undefined);
    assert.strictEqual(result, undefined);
  });

  await t.test('returns undefined for empty string', () => {
    const result = sanitizeTag('');
    assert.strictEqual(result, undefined);
  });

  await t.test('removes control characters (null byte)', () => {
    const result = sanitizeTag('test\x00tag');
    assert.strictEqual(result, 'testtag');
  });

  await t.test('removes control characters (newline)', () => {
    const result = sanitizeTag('test\ntag');
    assert.strictEqual(result, 'testtag');
  });

  await t.test('removes control characters (carriage return)', () => {
    const result = sanitizeTag('test\rtag');
    assert.strictEqual(result, 'testtag');
  });

  await t.test('removes control characters (tab)', () => {
    const result = sanitizeTag('test\ttag');
    assert.strictEqual(result, 'testtag');
  });

  await t.test('removes DEL character (0x7F)', () => {
    const result = sanitizeTag('test\x7Ftag');
    assert.strictEqual(result, 'testtag');
  });

  await t.test('truncates to MAX_TAG_LENGTH (256 chars)', () => {
    const longTag = 'a'.repeat(300);
    const result = sanitizeTag(longTag);
    assert.strictEqual(result?.length, 256);
    assert.strictEqual(result, 'a'.repeat(256));
  });

  await t.test('returns undefined if only control chars', () => {
    const result = sanitizeTag('\x00\n\r\t');
    assert.strictEqual(result, undefined);
  });

  await t.test('passes through normal strings unchanged', () => {
    const result = sanitizeTag('api-server-123');
    assert.strictEqual(result, 'api-server-123');
  });

  await t.test('allows unicode characters', () => {
    const result = sanitizeTag('测试-тест-🚀');
    assert.strictEqual(result, '测试-тест-🚀');
  });

  await t.test('handles tag exactly at MAX_TAG_LENGTH', () => {
    const tag = 'a'.repeat(256);
    const result = sanitizeTag(tag);
    assert.strictEqual(result?.length, 256);
  });
});

// ============================================================================
// validatePath() Tests
// ============================================================================

test('validatePath', async (t) => {
  await t.test('rejects path with .. (parent directory)', () => {
    const result = validatePath('../etc/passwd');
    assert.strictEqual(result.ok, false);
    assert(result.error.message.includes('..'));
  });

  await t.test('rejects path with null byte', () => {
    const result = validatePath('/tmp/test\x00file');
    assert.strictEqual(result.ok, false);
    assert(result.error.message.includes('\x00'));
  });

  await t.test('rejects path with .. in middle', () => {
    const result = validatePath('/tmp/../etc/passwd');
    assert.strictEqual(result.ok, false);
  });

  await t.test('accepts valid absolute path', () => {
    const result = validatePath('/tmp/portres');
    assert.strictEqual(result.ok, true);
    assert(result.value.includes('/tmp/portres'));
  });

  await t.test('accepts valid relative path', () => {
    const result = validatePath('test/registry');
    assert.strictEqual(result.ok, true);
    assert(result.value.includes('test/registry'));
  });

  await t.test('normalizes valid path', () => {
    const result = validatePath('/tmp/./portres');
    assert.strictEqual(result.ok, true);
    // Should normalize away the ./
    assert(!result.value.includes('./'));
  });

  await t.test('resolves to absolute path', () => {
    const result = validatePath('registry');
    assert.strictEqual(result.ok, true);
    // Should be absolute path
    assert(result.value.startsWith('/'));
  });
});

// ============================================================================
// isProcessRunning() Tests
// ============================================================================

test('isProcessRunning', async (t) => {
  await t.test('returns true for current process', () => {
    const result = isProcessRunning(process.pid);
    assert.strictEqual(result, true);
  });

  await t.test('returns false for non-existent PID', () => {
    // PID 99999 is unlikely to exist
    const result = isProcessRunning(99999);
    assert.strictEqual(result, false);
  });

  await t.test('returns true for PID 0 (special: process group)', () => {
    // PID 0 is a special signal target (entire process group)
    // process.kill(0, 0) doesn't throw, so isProcessRunning returns true
    const result = isProcessRunning(0);
    assert.strictEqual(result, true);
  });

  await t.test('returns true for PID -1 (special: all processes)', () => {
    // PID -1 is a special signal target (all processes user can signal)
    // process.kill(-1, 0) doesn't throw, so isProcessRunning returns true
    const result = isProcessRunning(-1);
    assert.strictEqual(result, true);
  });

  await t.test('returns true for init process (PID 1) if exists', () => {
    // PID 1 is init/systemd on Linux
    try {
      process.kill(1, 0);
      // If no error, PID 1 exists
      const result = isProcessRunning(1);
      assert.strictEqual(result, true);
    } catch {
      // If error (permission or doesn't exist), skip assertion
      // Just verify function doesn't crash
      const result = isProcessRunning(1);
      assert.strictEqual(typeof result, 'boolean');
    }
  });
});

// ============================================================================
// filterStaleEntries() Tests
// ============================================================================

test('filterStaleEntries', async (t) => {
  await t.test('separates active from stale by process', () => {
    const entries: PortEntry[] = [
      { port: 3000, pid: process.pid, timestamp: Date.now(), tag: 'active' },
      { port: 3001, pid: 99999, timestamp: Date.now(), tag: 'stale' },
    ];

    const result = filterStaleEntries(entries, 1000000); // Large timeout
    assert.strictEqual(result.active.length, 1);
    assert.strictEqual(result.stale.length, 1);
    assert.strictEqual(result.active[0].port, 3000);
    assert.strictEqual(result.stale[0].port, 3001);
  });

  await t.test('separates active from stale by timeout', () => {
    const now = Date.now();
    const entries: PortEntry[] = [
      { port: 3000, pid: process.pid, timestamp: now, tag: 'recent' },
      { port: 3001, pid: process.pid, timestamp: now - 2000, tag: 'old' },
    ];

    const result = filterStaleEntries(entries, 1000); // 1 second timeout
    assert.strictEqual(result.active.length, 1);
    assert.strictEqual(result.stale.length, 1);
    assert.strictEqual(result.active[0].tag, 'recent');
    assert.strictEqual(result.stale[0].tag, 'old');
  });

  await t.test('handles empty array', () => {
    const result = filterStaleEntries([], 1000);
    assert.strictEqual(result.active.length, 0);
    assert.strictEqual(result.stale.length, 0);
  });

  await t.test('marks all as active when timeout is very large', () => {
    const entries: PortEntry[] = [
      { port: 3000, pid: process.pid, timestamp: Date.now() - 10000, tag: 'test' },
    ];

    const result = filterStaleEntries(entries, 999999999); // Very large timeout
    assert.strictEqual(result.active.length, 1);
    assert.strictEqual(result.stale.length, 0);
  });

  await t.test('marks all as stale when timeout is zero', () => {
    const entries: PortEntry[] = [
      { port: 3000, pid: process.pid, timestamp: Date.now() - 1, tag: 'test' },
    ];

    const result = filterStaleEntries(entries, 0); // Zero timeout
    assert.strictEqual(result.active.length, 0);
    assert.strictEqual(result.stale.length, 1);
  });

  await t.test('handles entries without tags', () => {
    const entries: PortEntry[] = [
      { port: 3000, pid: process.pid, timestamp: Date.now() },
      { port: 3001, pid: 99999, timestamp: Date.now() },
    ];

    const result = filterStaleEntries(entries, 1000000);
    assert.strictEqual(result.active.length, 1);
    assert.strictEqual(result.stale.length, 1);
  });

  await t.test('handles mixed active and stale (both criteria)', () => {
    const now = Date.now();
    const entries: PortEntry[] = [
      { port: 3000, pid: process.pid, timestamp: now, tag: 'active-recent' },
      { port: 3001, pid: process.pid, timestamp: now - 2000, tag: 'active-old' }, // stale by timeout
      { port: 3002, pid: 99999, timestamp: now, tag: 'dead-recent' }, // stale by process
      { port: 3003, pid: 99999, timestamp: now - 2000, tag: 'dead-old' }, // stale by both
    ];

    const result = filterStaleEntries(entries, 1000);
    assert.strictEqual(result.active.length, 1);
    assert.strictEqual(result.stale.length, 3);
    assert.strictEqual(result.active[0].tag, 'active-recent');
  });
});
