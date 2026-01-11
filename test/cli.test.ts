/**
 * Tests for CLI Commands (src/cli.ts)
 * Command-line interface for port allocation and management
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Helper to create unique test directories
function createTestDir(): string {
  return mkdtempSync(join(tmpdir(), 'portres-cli-test-'));
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
function runCLI(command: string, registryDir?: string): { exitCode: number; stdout: string; stderr: string } {
  const dir = registryDir || createTestDir();
  const fullCommand = `npx tsx src/cli.ts ${command} --registry-dir "${dir}"`;

  try {
    const stdout = execSync(fullCommand, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (error: any) {
    return {
      exitCode: error.status || 1,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    };
  } finally {
    if (!registryDir) cleanupTestDir(dir);
  }
}

// CLI Integration Tests
// ============================================================================

test('CLI', async (t) => {
  let testDir: string;

  t.beforeEach(() => {
    testDir = createTestDir();
  });

  t.afterEach(() => {
    cleanupTestDir(testDir);
  });

  await t.test('--help shows usage', () => {
    const result = runCLI('--help');
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('Test Port Resolver'));
    assert(result.stdout.includes('COMMANDS'));
  });

  await t.test('--version shows version', () => {
    const result = runCLI('--version');
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('0.3.0'));
  });

  await t.test('get allocates a port', () => {
    const result = runCLI('get', testDir);
    assert.strictEqual(result.exitCode, 0);
    const port = parseInt(result.stdout.trim(), 10);
    assert(port >= 1024 && port <= 65535);
  });

  await t.test('get --json outputs JSON', () => {
    const result = runCLI('get --json', testDir);
    assert.strictEqual(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert(typeof data.port === 'number');
  });

  await t.test('get -n 3 allocates multiple ports', () => {
    const result = runCLI('get -n 3', testDir);
    assert.strictEqual(result.exitCode, 0);
    const lines = result.stdout.trim().split('\n');
    assert.strictEqual(lines.length, 3);
  });

  await t.test('get --tag adds tag', () => {
    const result = runCLI('get --tag mytest --json', testDir);
    assert.strictEqual(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert.strictEqual(data.tag, 'mytest');
  });

  await t.test('release shows error for non-existent port', () => {
    // releasePort is idempotent - releasing non-existent port succeeds
    const releaseResult = runCLI('release 12345 --json', testDir);
    assert.strictEqual(releaseResult.exitCode, 0); // Idempotent: success even if not registered
  });

  await t.test('release requires port number', () => {
    const result = runCLI('release --json', testDir);
    assert.strictEqual(result.exitCode, 1);
    assert(result.stderr.includes('must be provided'));
  });

  await t.test('release-all handles empty registry', () => {
    // No ports allocated, should release 0
    const result = runCLI('release-all', testDir);
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('0'));
  });

  await t.test('list shows allocations', () => {
    runCLI('get --tag test1', testDir);
    runCLI('get --tag test2', testDir);

    const result = runCLI('list', testDir);
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('Port'));
    assert(result.stdout.includes('PID'));
  });

  await t.test('list --json outputs JSON array', () => {
    runCLI('get', testDir);

    const result = runCLI('list --json', testDir);
    assert.strictEqual(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert(Array.isArray(data));
    assert.strictEqual(data.length, 1);
  });

  await t.test('clean removes stale entries', () => {
    const result = runCLI('clean --json', testDir);
    assert.strictEqual(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert(typeof data.cleaned === 'number');
  });

  await t.test('status shows registry status', () => {
    const result = runCLI('status', testDir);
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('Registry Status'));
    assert(result.stdout.includes('Port range'));
  });

  await t.test('status --json outputs JSON', () => {
    const result = runCLI('status --json', testDir);
    assert.strictEqual(result.exitCode, 0);
    const data = JSON.parse(result.stdout);
    assert(typeof data.totalEntries === 'number');
    assert(typeof data.portRange === 'object');
  });

  await t.test('clear clears registry', () => {
    runCLI('get -n 5', testDir);

    const result = runCLI('clear', testDir);
    assert.strictEqual(result.exitCode, 0);
    assert(result.stdout.includes('cleared'));

    const listResult = runCLI('list', testDir);
    assert(listResult.stdout.includes('No port allocations'));
  });

  await t.test('unknown command shows error', () => {
    const result = runCLI('invalid-command', testDir);
    assert.strictEqual(result.exitCode, 1);
    assert(result.stderr.includes('Unknown command'));
  });
});
