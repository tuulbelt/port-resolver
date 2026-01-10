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
import {
  PortResolver,
  getPort,
  getPorts,
  releasePort,
  PortManager
} from '../src/index.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Prevent dead code elimination
let result: any;
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

group('Single Port Allocation', () => {
  setup();

  baseline('getPort: module-level API', async () => {
    const tag = `tag-${counter++}`;
    result = await getPort({ tag, config: { stateDir: tempDir } });
  });

  bench('get: via PortResolver instance', async () => {
    const resolver = new PortResolver({ stateDir: tempDir });
    const tag = `tag-${counter++}`;
    result = await resolver.get({ tag });
  });

  bench('get: with specific range', async () => {
    const resolver = new PortResolver({
      stateDir: tempDir,
      minPort: 50000,
      maxPort: 60000
    });
    const tag = `tag-${counter++}`;
    result = await resolver.get({ tag });
  });

  teardown();
});

group('Batch Port Allocation (v0.2.0)', () => {
  setup();

  baseline('getPorts: 3 ports', async () => {
    const tags = [`batch-${counter++}`, `batch-${counter++}`, `batch-${counter++}`];
    result = await getPorts(3, { tags, config: { stateDir: tempDir } });
  });

  bench('getPorts: 5 ports', async () => {
    const tags = Array.from({ length: 5 }, () => `batch-${counter++}`);
    result = await getPorts(5, { tags, config: { stateDir: tempDir } });
  });

  bench('getPorts: 10 ports', async () => {
    const tags = Array.from({ length: 10 }, () => `batch-${counter++}`);
    result = await getPorts(10, { tags, config: { stateDir: tempDir } });
  });

  bench('getPorts: 3 ports (rollback on failure)', async () => {
    // This will fail due to range constraint, testing rollback performance
    result = await getPorts(3, {
      config: { stateDir: tempDir, minPort: 50000, maxPort: 50001 }
    });
  });

  teardown();
});

group('Port Range Allocation (v0.2.0)', () => {
  setup();
  const resolver = new PortResolver({ stateDir: tempDir });

  baseline('reserveRange: 5 contiguous ports', async () => {
    const tag = `range-${counter++}`;
    result = await resolver.reserveRange({ start: 50000 + (counter * 10), count: 5, tag });
  });

  bench('reserveRange: 10 contiguous ports', async () => {
    const tag = `range-${counter++}`;
    result = await resolver.reserveRange({ start: 51000 + (counter * 20), count: 10, tag });
  });

  bench('getPortInRange: bounded allocation', async () => {
    const tag = `bounded-${counter++}`;
    result = await resolver.getPortInRange({ min: 60000, max: 65000, tag });
  });

  teardown();
});

group('PortManager Lifecycle (v0.2.0)', () => {
  setup();

  baseline('manager: allocate single port', async () => {
    const manager = new PortManager({ stateDir: tempDir });
    const tag = `mgr-${counter++}`;
    result = await manager.allocate(tag);
    await manager.releaseAll();
  });

  bench('manager: allocate + release by tag', async () => {
    const manager = new PortManager({ stateDir: tempDir });
    const tag = `mgr-${counter++}`;
    await manager.allocate(tag);
    result = await manager.release(tag);
  });

  bench('manager: allocate multiple + releaseAll', async () => {
    const manager = new PortManager({ stateDir: tempDir });
    await manager.allocate(`mgr-${counter++}`);
    await manager.allocate(`mgr-${counter++}`);
    await manager.allocate(`mgr-${counter++}`);
    result = await manager.releaseAll();
  });

  bench('manager: get allocation by tag', async () => {
    const manager = new PortManager({ stateDir: tempDir });
    const tag = `mgr-${counter++}`;
    await manager.allocate(tag);
    result = manager.get(tag);
    await manager.releaseAll();
  });

  teardown();
});

group('Port Release', () => {
  setup();

  baseline('releasePort: module-level API', async () => {
    const tag = `release-${counter++}`;
    await getPort({ tag, config: { stateDir: tempDir } });
    result = await releasePort({ tag, config: { stateDir: tempDir } });
  });

  bench('release: via PortResolver instance', async () => {
    const resolver = new PortResolver({ stateDir: tempDir });
    const tag = `release-${counter++}`;
    await resolver.get({ tag });
    result = await resolver.release({ tag });
  });

  teardown();
});

group('Concurrent Allocation Stress Test', () => {
  setup();

  baseline('concurrent: 5 parallel allocations', async () => {
    const promises = Array.from({ length: 5 }, async (_, i) => {
      const tag = `concurrent-${counter++}`;
      return getPort({ tag, config: { stateDir: tempDir } });
    });
    result = await Promise.all(promises);
  });

  bench('concurrent: 10 parallel allocations', async () => {
    const promises = Array.from({ length: 10 }, async (_, i) => {
      const tag = `concurrent-${counter++}`;
      return getPort({ tag, config: { stateDir: tempDir } });
    });
    result = await Promise.all(promises);
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
  samples: 256,
  time: 2_000_000_000, // 2 seconds per benchmark
  warmup: true,
  latency: true,
  throughput: true,
});
