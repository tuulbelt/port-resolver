#!/usr/bin/env node --import tsx
/**
 * API-Equivalent Comparison: port-resolver vs detect-port
 *
 * Compares equivalent operations between port-resolver and detect-port
 * to provide fair, apples-to-apples performance comparison.
 *
 * Run: npm run bench:external
 */

import { bench, baseline, group, run } from 'tatami-ng';
import { getPort as portResolverGet } from '../../src/index.ts';
import detectPort from 'detect-port';
import { mkdtemp, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Prevent dead code elimination
let result: any;
let tempDir: string;
let counter = 0;

// Setup/teardown
function setup() {
  return new Promise<void>((resolve) => {
    mkdtemp(join(tmpdir(), 'portres-bench-'), (err, dir) => {
      if (err) throw err;
      tempDir = dir;
      resolve();
    });
  });
}

function teardown() {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// API-Equivalent Comparisons
// ============================================================================

group('Single Port Detection (API-Equivalent)', () => {
  baseline('port-resolver: getPort()', async () => {
    await setup();
    const tag = `tag-${counter++}`;
    result = await portResolverGet({ tag, config: { registryDir: tempDir } });
    teardown();
  });

  bench('detect-port: default port', async () => {
    result = await detectPort();
  });
});

group('Port Detection with Preferred (API-Equivalent)', () => {
  baseline('port-resolver: with range', async () => {
    await setup();
    const tag = `tag-${counter++}`;
    result = await portResolverGet({
      tag,
      config: { registryDir: tempDir, minPort: 50000, maxPort: 50100 }
    });
    teardown();
  });

  bench('detect-port: with preferred port', async () => {
    result = await detectPort(50000 + counter++);
  });
});

group('Concurrent Detection (API-Equivalent)', () => {
  baseline('port-resolver: 5 parallel', async () => {
    await setup();
    const promises = Array.from({ length: 5 }, async (_, i) => {
      const tag = `concurrent-${counter++}`;
      return portResolverGet({ tag, config: { registryDir: tempDir } });
    });
    result = await Promise.all(promises);
    teardown();
  });

  bench('detect-port: 5 parallel', async () => {
    const promises = Array.from({ length: 5 }, (_, i) => detectPort(50000 + i));
    result = await Promise.all(promises);
  });
});

group('Concurrent Detection - 10 Parallel (API-Equivalent)', () => {
  baseline('port-resolver: 10 parallel', async () => {
    await setup();
    const promises = Array.from({ length: 10 }, async (_, i) => {
      const tag = `concurrent-${counter++}`;
      return portResolverGet({ tag, config: { registryDir: tempDir } });
    });
    result = await Promise.all(promises);
    teardown();
  });

  bench('detect-port: 10 parallel', async () => {
    const promises = Array.from({ length: 10 }, (_, i) => detectPort(50000 + i));
    result = await Promise.all(promises);
  });
});

// ============================================================================
// Run Benchmarks
// ============================================================================

console.log('\n');
console.log('═'.repeat(70));
console.log('  API-Equivalent Comparison: port-resolver vs detect-port');
console.log('═'.repeat(70));
console.log('\nNote: port-resolver includes cross-process safety via file-based');
console.log('semaphore. This adds overhead but prevents race conditions.');
console.log('\n');

await run({
  units: false,
  silent: false,
  json: false,
  samples: 256,
  time: 2_000_000_000,
  warmup: true,
  latency: true,
  throughput: true,
});
