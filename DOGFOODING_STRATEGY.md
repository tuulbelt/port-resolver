# Dogfooding Strategy: Port Resolver (portres)

**Tool:** Port Resolver (`portres`)
**Dependencies:** `@tuulbelt/file-based-semaphore-ts` (REQUIRED)
**Classification:** Phase 2 Wave 2 (REQUIRED dependency pattern)

This document outlines how this tool leverages other Tuulbelt tools to demonstrate composability and validate production reliability.

---

## Library Composition (REQUIRED Dependency)

Port Resolver uses **file-based-semaphore-ts** as a **REQUIRED** library dependency, demonstrating PRINCIPLES.md Exception 2: Tuulbelt tools may compose other Tuulbelt tools while maintaining zero external dependencies.

### Why This Composition is Essential

**Problem:** Concurrent test suites allocate ports simultaneously, creating race conditions:
```
Process A: Read registry → Port 50123 available → Write registry (port 50123)
Process B: Read registry → Port 50123 available → Write registry (port 50123)  ❌ COLLISION
```

**Solution:** Atomic registry access via semaphore (REQUIRED):
```
Process A: Acquire lock → Read → Allocate 50123 → Write → Release lock
Process B: Wait for lock → Acquire lock → Read → Allocate 50124 → Release lock  ✅ NO COLLISION
```

### Integration Pattern (REQUIRED)

```typescript
// In portres/src/index.ts (line 18)
import { Semaphore } from '@tuulbelt/file-based-semaphore-ts';

// All registry operations wrapped in semaphore:
async get(): Promise<Result<PortAllocation>> {
  const lock = await this.acquireLock();
  try {
    const registry = await this.readRegistry();
    // ... allocation logic
    await this.writeRegistry(registry);
    return { ok: true, value: allocation };
  } finally {
    await lock.release();
  }
}
```

**Git URL Dependency (Auto-Fetched):**

```json
// package.json
{
  "dependencies": {
    "@tuulbelt/file-based-semaphore-ts": "git+https://github.com/tuulbelt/file-based-semaphore-ts.git"
  }
}
```

**Benefits:**
- Zero port collisions (50+ concurrent allocations succeed)
- Registry integrity maintained (valid JSON always)
- Deterministic test behavior
- Production-grade reliability
- Works standalone (npm auto-fetches dependency from GitHub)

---

## High-Value Compositions

### 1. Test Flakiness Detector - Validate test reliability

**Why:** Port allocation is inherently race-prone. Tests must be deterministic even when ports are allocated concurrently across multiple processes. Any flakiness in our test suite would indicate potential port collision issues in production.

**Script:** `scripts/dogfood-flaky.sh`

```bash
./scripts/dogfood-flaky.sh 20
# Validates all 79 tests are deterministic across 20 runs
# Catches any timing-dependent port collision issues
```

**What it validates:**
- Port allocation doesn't collide under concurrent test execution (13 new concurrent tests)
- Registry file operations are atomic (4 new semaphore integration tests)
- Stale entry detection works reliably
- No timing-dependent test failures
- Performance benchmarks maintain acceptable thresholds (4 new perf tests)

**Expected Outcome:**
```
✅ NO FLAKINESS DETECTED (79 tests × 20 runs = 1,580 executions)
```

### 2. Output Diffing Utility - Prove deterministic outputs

**Why:** Port allocation results must be consistent. While the actual port numbers may differ between runs (they're dynamically allocated), the test pass/fail results must be identical. This proves our port allocation algorithm is stable.

**Script:** `scripts/dogfood-diff.sh`

```bash
./scripts/dogfood-diff.sh
# Compares normalized test outputs between two runs
# Proves port allocation logic is deterministic
```

**What it validates:**
- Same number of tests pass/fail each run (79/79 passing)
- Test assertions behave consistently
- No order-dependent failures
- Concurrent execution tests produce identical results

### 3. File-Based Semaphore (TS) - REQUIRED Library Integration

**Why:** portres **REQUIRES** file-based-semaphore-ts for atomic registry access. This is not optional - the tool cannot function correctly in concurrent environments without it. This demonstrates Tuulbelt's library composition pattern (PRINCIPLES.md Exception 2).

**Integration Evidence:**

```typescript
// src/index.ts (line 18) - REQUIRED import
import { Semaphore } from '@tuulbelt/file-based-semaphore-ts';

// Centralized lock management (lines 270-283)
private async acquireLock(): Promise<Lock> {
  const lockName = 'portres-registry';
  return await this.semaphore.acquire(lockName);
}
```

**Validation Tests:**

New semaphore integration tests (test/index.test.ts lines 913-1040):
- `test('semaphore prevents race conditions in registry writes')`
- `test('semaphore allows read operations during allocation')`
- `test('maintains registry integrity under concurrent stress')`
- `test('handles concurrent clean operations safely')`

**Benefits:**
- Guaranteed atomic registry operations
- Zero external dependencies (both tools use only Node.js stdlib)
- Git URL dependency auto-fetched during `npm install`
- Works identically in monorepo and standalone contexts

## Implementation Checklist

- [x] Identify high-value compositions (flaky detection, output diffing, **REQUIRED** semaphore integration)
- [x] Create composition scripts (`scripts/dogfood-flaky.sh`, `scripts/dogfood-diff.sh`)
- [x] Update README with dogfooding section
- [x] Update GH Pages docs (VitePress documentation complete)
- [x] Implement REQUIRED dependency (file-based-semaphore-ts via git URL)
- [x] Add 13 new tests validating semaphore integration and concurrency
- [x] Document in this file

## Expected Outcomes

1. **Proves Reliability:** 79 tests × 20 runs = 1,580 test executions without flakiness
2. **Demonstrates Composability:** Uses flaky, odiff for validation + **REQUIRES** semats for production functionality
3. **Real Value:** Port allocation reliability is critical for test infrastructure - semaphore is essential, not optional

## Tool-Specific Validation

### Port Collision Prevention

portres exists specifically to prevent port collisions. The semaphore integration and dogfood scripts validate this works:

```bash
# Scenario: Multiple parallel test processes with high concurrent load
./scripts/dogfood-flaky.sh 20

# Validates:
# - 79 tests pass consistently across 20 runs
# - 13 new concurrent execution tests prevent port collisions
# - 4 new semaphore integration tests verify atomic registry access
# - 4 new performance benchmarks maintain < 100ms allocation latency
# - 3 new network tests verify IPv6, interface binding, port boundaries
# - 4 new cleanup tests ensure registry consistency
# - 3 new cross-process tests validate multi-process coordination

# If any run fails due to EADDRINUSE or port collisions,
# the flakiness detector will catch it immediately
```

**New Test Categories:**
- **Concurrent Execution Tests** (5 tests, lines 780-911)
  - Promise.all concurrent allocations
  - Concurrent batch allocations (getMultiple)
  - Mixed concurrent operations
  - Port collision prevention under load
  - Concurrent allocation and release

- **Semaphore Integration Tests** (4 tests, lines 917-1040)
  - Race condition prevention in registry writes
  - Read/write coexistence under semaphore
  - Registry integrity under concurrent stress
  - Concurrent clean operations safety

- **Performance Benchmarks** (4 tests, lines 1046-1125)
  - Allocation latency (< 100ms)
  - Batch allocation linear scaling
  - List operation with many entries (< 50ms)
  - Concurrent allocation throughput (< 50ms avg)

### Registry Atomicity (REQUIRED)

The semaphore integration ensures registry operations are atomic. This is **REQUIRED** - the tool cannot work correctly without it:

```typescript
// Every registry operation wrapped in semaphore lock:
async get(): Promise<Result<PortAllocation>> {
  const lock = await this.acquireLock();
  try {
    // ... atomic operation
  } finally {
    await lock.release();  // Always released, even on error
  }
}
```

**Git URL Dependency Setup:**

```bash
# Standalone (auto-fetches dependency):
git clone https://github.com/tuulbelt/port-resolver.git
cd port-resolver
npm install  # Automatically clones file-based-semaphore-ts
npm test     # All 79 tests pass

# Monorepo (submodules):
git submodule update --init --recursive
cd tools/port-resolver
npm install
npm test
```

Both contexts work identically - dependency auto-fetched in both cases.

---

## Zero External Dependencies Preserved

**Transitive Closure Verification:**

```bash
# port-resolver dependencies:
cat package.json | grep -A 5 '"dependencies"'
# "@tuulbelt/file-based-semaphore-ts": "git+https://github.com/..."

# file-based-semaphore-ts dependencies:
cat ../file-based-semaphore-ts/package.json | grep -A 5 '"dependencies"'
# {} (EMPTY - zero external deps)

# Result: Full transitive closure has zero external dependencies ✅
```

---

**Guidelines:**
- Only implement compositions that provide REAL value ✅
- Don't dogfood just for the sake of dogfooding ✅
- Focus on 2-4 high-impact compositions ✅ (3 compositions documented)
- **REQUIRED dependencies are valid** (PRINCIPLES.md Exception 2) ✅
- Prioritize: Production functionality > Test validation > Output consistency

**Status:** Updated for Wave 2 REQUIRED dependency pattern (2025-12-29)
