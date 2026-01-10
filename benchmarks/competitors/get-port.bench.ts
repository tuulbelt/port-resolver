#!/usr/bin/env node --import tsx
/**
 * get-port Competitor Benchmark
 *
 * Comparison with get-port (sindresorhus/get-port)
 *
 * Run: npm run bench:compare
 */

import { bench, baseline, group, run } from 'tatami-ng';
import getPortLib from 'get-port';

// Prevent dead code elimination
let result: any;
let counter = 0;

// ============================================================================
// get-port Benchmarks (for comparison)
// ============================================================================

group('get-port (Competitor)', () => {
  baseline('get-port: single port', async () => {
    result = await getPortLib();
  });

  bench('get-port: with preferred port', async () => {
    result = await getPortLib({ port: 50000 + counter++ });
  });

  bench('get-port: with port range', async () => {
    result = await getPortLib({ port: [50000, 50001, 50002, 50003, 50004] });
  });
});

group('get-port: Concurrent Allocation', () => {
  baseline('concurrent: 5 parallel', async () => {
    const promises = Array.from({ length: 5 }, () => getPortLib());
    result = await Promise.all(promises);
  });

  bench('concurrent: 10 parallel', async () => {
    const promises = Array.from({ length: 10 }, () => getPortLib());
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
