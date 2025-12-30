#!/usr/bin/env npx tsx
/**
 * Dogfood: Semaphore Integration Validation
 *
 * Verifies that concurrent port allocations don't produce duplicates.
 * This proves the file-based-semaphore-ts integration is working correctly.
 */

import { PortResolver } from '../src/index.ts';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CONCURRENT_REQUESTS = 20;
const RUNS = 5;

console.log('Dogfood: Semaphore Integration Validation');
console.log(`Running ${RUNS} runs × ${CONCURRENT_REQUESTS} concurrent allocations = ${RUNS * CONCURRENT_REQUESTS} total allocations\n`);

// Create a unique test directory
const testDir = join(tmpdir(), `portres-dogfood-${Date.now()}`);
mkdirSync(testDir, { recursive: true });

let passed = 0;
let failed = 0;

async function runConcurrentTest(runNumber: number): Promise<boolean> {
  // Create a fresh resolver with isolated directory
  const resolver = new PortResolver({
    registryDir: testDir,
    minPort: 50000,
    maxPort: 55000,
  });

  // Clear registry before each run
  const clearResult = await resolver.clear();
  if (!clearResult.ok) {
    console.error(`Run ${runNumber}: Failed to clear registry: ${clearResult.error.message}`);
    return false;
  }

  // Launch concurrent port allocations
  const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
    resolver.get({ tag: `test-${runNumber}-${i}` })
  );

  const results = await Promise.all(promises);

  // Check for failures
  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.error(`Run ${runNumber}: ${failures.length} allocation failures`);
    for (const f of failures) {
      if (!f.ok) console.error(`  - ${f.error.message}`);
    }
    return false;
  }

  // Check for duplicates
  const ports = results
    .filter((r) => r.ok)
    .map((r) => (r as { ok: true; value: { port: number } }).value.port);
  const uniquePorts = new Set(ports);

  if (uniquePorts.size !== ports.length) {
    console.error(`Run ${runNumber}: DUPLICATE PORTS DETECTED!`);
    console.error(`  Allocated ${ports.length} ports, but only ${uniquePorts.size} unique`);

    // Find the duplicates
    const counts = new Map<number, number>();
    for (const port of ports) {
      counts.set(port, (counts.get(port) || 0) + 1);
    }
    for (const [port, count] of counts) {
      if (count > 1) {
        console.error(`  Port ${port} allocated ${count} times`);
      }
    }
    return false;
  }

  // Release all ports
  for (const port of ports) {
    const releaseResult = await resolver.release(port);
    if (!releaseResult.ok) {
      console.error(`Run ${runNumber}: Failed to release port ${port}: ${releaseResult.error.message}`);
      // Don't fail the test for release errors, just log
    }
  }

  console.log(`✓ Run ${runNumber}: ${ports.length} unique ports allocated concurrently`);
  return true;
}

async function main() {
  try {
    for (let run = 1; run <= RUNS; run++) {
      const success = await runConcurrentTest(run);
      if (success) {
        passed++;
      } else {
        failed++;
      }
    }
  } finally {
    // Cleanup test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed}/${RUNS} runs passed, ${failed} failed`);

  if (failed > 0) {
    console.error('\n❌ SEMAPHORE INTEGRATION VALIDATION FAILED');
    console.error('Concurrent port allocations produced duplicates.');
    console.error('This indicates the semaphore is not properly serializing access.');
    process.exit(1);
  }

  console.log('\n✅ SEMAPHORE INTEGRATION VALIDATED');
  console.log('All concurrent allocations produced unique ports.');
  console.log('file-based-semaphore-ts is properly serializing registry access.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
