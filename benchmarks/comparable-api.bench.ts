#!/usr/bin/env node --import tsx
/**
 * Comparable API Benchmarks
 *
 * Side-by-side comparison with competitors using equivalent operations.
 * This ensures fair comparison by benchmarking the same task across libraries.
 *
 * Methodology:
 * - Each benchmark performs the SAME operation (single port allocation)
 * - Variations test equivalent features where available
 * - Non-comparable features (exclusive to port-resolver) are marked clearly
 *
 * Run: npm run bench:compare
 */

import { bench, baseline, group, run } from 'tatami-ng';
import { getPort as getPortPR } from '../src/api/index.ts';
import getPortLib from 'get-port';
import detectPort from 'detect-port';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Prevent dead code elimination
let result: any;
let counter = 0;
let tempDir: string;

// Setup/teardown
function setup() {
  tempDir = mkdtempSync(join(tmpdir(), 'portres-comp-bench-'));
}

function teardown() {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Comparable API: Single Port Allocation
// ============================================================================

group('Single Port Allocation (Comparable)', () => {
  setup();

  baseline('port-resolver: getPort()', async () => {
    result = await getPortPR({ config: { registryDir: tempDir } });
  });

  bench('get-port: getPort()', async () => {
    result = await getPortLib();
  });

  bench('detect-port: detectPort()', async () => {
    result = await detectPort();
  });

  teardown();
});

// ============================================================================
// Comparable API: Port with Preferred Value
// ============================================================================

group('Port with Preferred Value (Comparable)', () => {
  setup();

  baseline('port-resolver: with minPort/maxPort', async () => {
    result = await getPortPR({
      config: {
        registryDir: tempDir,
        minPort: 50000 + counter,
        maxPort: 50100,
      },
    });
    counter++;
  });

  bench('get-port: with preferred port', async () => {
    result = await getPortLib({ port: 50000 + counter });
    counter++;
  });

  bench('detect-port: with preferred port', async () => {
    result = await detectPort(50000 + counter);
    counter++;
  });

  teardown();
});

// ============================================================================
// Comparable API: Concurrent Allocation (5 parallel)
// ============================================================================

group('Concurrent Allocation - 5 Parallel (Comparable)', () => {
  setup();

  baseline('port-resolver: 5 parallel (concurrent-safe)', async () => {
    const promises = Array.from({ length: 5 }, async (_, i) => {
      return getPortPR({
        tag: `concurrent-${counter++}`,
        config: { registryDir: tempDir },
      });
    });
    result = await Promise.all(promises);
  });

  bench('get-port: 5 parallel (no concurrency safety)', async () => {
    const promises = Array.from({ length: 5 }, () => getPortLib());
    result = await Promise.all(promises);
  });

  bench('detect-port: 5 parallel (no concurrency safety)', async () => {
    const promises = Array.from({ length: 5 }, () => detectPort());
    result = await Promise.all(promises);
  });

  teardown();
});

// ============================================================================
// Comparable API: Concurrent Allocation (10 parallel)
// ============================================================================

group('Concurrent Allocation - 10 Parallel (Comparable)', () => {
  setup();

  baseline('port-resolver: 10 parallel (concurrent-safe)', async () => {
    const promises = Array.from({ length: 10 }, async (_, i) => {
      return getPortPR({
        tag: `concurrent-${counter++}`,
        config: { registryDir: tempDir },
      });
    });
    result = await Promise.all(promises);
  });

  bench('get-port: 10 parallel (no concurrency safety)', async () => {
    const promises = Array.from({ length: 10 }, () => getPortLib());
    result = await Promise.all(promises);
  });

  bench('detect-port: 10 parallel (no concurrency safety)', async () => {
    const promises = Array.from({ length: 10 }, () => detectPort());
    result = await Promise.all(promises);
  });

  teardown();
});

// ============================================================================
// Port-Resolver Exclusive Features (Not Comparable)
// ============================================================================

console.log('\n⚠️  Note: The following features are EXCLUSIVE to port-resolver:\n');
console.log('   • Cross-process concurrent safety (file-based semaphore)');
console.log('   • Tag-based port tracking (named allocations)');
console.log('   • Batch allocation with atomic rollback (getPorts)');
console.log('   • Contiguous range reservation (reserveRange)');
console.log('   • Lifecycle management (PortManager)');
console.log('   • Port registry with cleanup\n');
console.log('   Competitors do NOT provide these features.\n');
console.log('═'.repeat(70));

// ============================================================================
// Run Benchmarks
// ============================================================================

await run({
  units: false,
  silent: false,
  json: false,
  samples: 256,
  time: 2_000_000_000, // 2 seconds per benchmark
  warmup: true,
  latency: true,
  throughput: true,
});
