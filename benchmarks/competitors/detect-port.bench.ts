#!/usr/bin/env node --import tsx
/**
 * detect-port Competitor Benchmark
 *
 * Comparison with detect-port (node-modules/detect-port)
 *
 * Run: npm run bench:compare
 */

import { bench, baseline, group, run } from 'tatami-ng';
import detectPort from 'detect-port';

// Prevent dead code elimination
let result: any;
let counter = 0;

// ============================================================================
// detect-port Benchmarks (for comparison)
// ============================================================================

group('detect-port (Competitor)', () => {
  baseline('detect-port: find available port', async () => {
    result = await detectPort(50000 + counter++);
  });

  bench('detect-port: with different ports', async () => {
    result = await detectPort(51000 + counter++);
  });
});

group('detect-port: Concurrent Allocation', () => {
  baseline('concurrent: 5 parallel', async () => {
    const promises = Array.from({ length: 5 }, (_, i) => detectPort(52000 + i));
    result = await Promise.all(promises);
  });

  bench('concurrent: 10 parallel', async () => {
    const promises = Array.from({ length: 10 }, (_, i) => detectPort(53000 + i));
    result = await Promise.all(promises);
  });
});

// ============================================================================
// Run Benchmarks
// ============================================================================

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
