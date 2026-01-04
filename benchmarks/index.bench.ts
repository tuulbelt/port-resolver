#!/usr/bin/env node --import tsx
/**
 * Port Resolver Benchmarks
 *
 * Measures performance of core operations using tatami-ng for statistical rigor.
 *
 * Run: npm run bench
 *
 * See: /docs/BENCHMARKING_STANDARDS.md
 */

import { bench, baseline, group, run } from 'tatami-ng';
import { PortResolver, getPort, releasePort } from '../src/index.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Prevent dead code elimination
let result: number | PortResolver | boolean | undefined;
let tempDir: string;
let counter = 0;

// Setup/teardown
function setup() {
  tempDir = mkdtempSync(join(tmpdir(), 'portres-bench-'));
}

function teardown() {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Core Operations Benchmarks
// ============================================================================

group('PortResolver Creation', () => {
  setup();

  baseline('create: default options', () => {
    result = new PortResolver({
      stateDir: tempDir,
    });
  });

  bench('create: with range', () => {
    result = new PortResolver({
      stateDir: tempDir,
      minPort: 10000,
      maxPort: 20000,
    });
  });

  bench('create: with tag prefix', () => {
    result = new PortResolver({
      stateDir: tempDir,
      tagPrefix: 'bench-test',
    });
  });

  teardown();
});

group('Port Allocation', () => {
  setup();
  const resolver = new PortResolver({ stateDir: tempDir });

  baseline('get: first port', async () => {
    const tag = `tag-${counter++}`;
    result = await getPort(tag, { stateDir: tempDir });
  });

  bench('get: with specific range', async () => {
    const tag = `tag-${counter++}`;
    result = await getPort(tag, { stateDir: tempDir, minPort: 50000, maxPort: 60000 });
  });

  teardown();
});

group('Port Release', () => {
  setup();

  baseline('release: existing port', async () => {
    const tag = `release-${counter++}`;
    await getPort(tag, { stateDir: tempDir });
    result = await releasePort(tag, { stateDir: tempDir });
  });

  teardown();
});

// ============================================================================
// Run Benchmarks
// ============================================================================

await run({
  units: false,
  silent: false,
  json: false,
});
