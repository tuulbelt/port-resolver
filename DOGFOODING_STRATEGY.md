# Dogfooding Strategy: Test Port Resolver (portres)

This document outlines how this tool leverages other Tuulbelt tools to demonstrate composability.

## High-Value Compositions

### 1. Test Flakiness Detector - Validate test reliability

**Why:** Port allocation is inherently race-prone. Tests must be deterministic even when ports are allocated concurrently across multiple processes. Any flakiness in our test suite would indicate potential port collision issues in production.

**Script:** `scripts/dogfood-flaky.sh`

```bash
./scripts/dogfood-flaky.sh 10
# Validates all 56 tests are deterministic across 10 runs
# Catches any timing-dependent port collision issues
```

**What it validates:**
- Port allocation doesn't collide under concurrent test execution
- Registry file operations are atomic
- Stale entry detection works reliably
- No timing-dependent test failures

### 2. Output Diffing Utility - Prove deterministic outputs

**Why:** Port allocation results must be consistent. While the actual port numbers may differ between runs (they're dynamically allocated), the test pass/fail results must be identical. This proves our port allocation algorithm is stable.

**Script:** `scripts/dogfood-diff.sh`

```bash
./scripts/dogfood-diff.sh
# Compares normalized test outputs between two runs
# Proves port allocation logic is deterministic
```

**What it validates:**
- Same number of tests pass/fail each run
- Test assertions behave consistently
- No order-dependent failures

### 3. File-Based Semaphore (TS) - Cross-tool Integration

**Why:** portres uses semats when available for atomic registry access. This demonstrates Tuulbelt's library composition pattern where tools enhance each other without creating runtime dependencies.

**Integration Pattern:**

```typescript
// In portres/src/index.ts
async function loadSemaphore(): Promise<SemaphoreModule | null> {
  try {
    const siblingPath = join(process.cwd(), '..', 'file-based-semaphore-ts', 'src', 'index.ts');
    if (!existsSync(siblingPath)) return null;
    return await import(`file://${siblingPath}`);
  } catch {
    return null; // Graceful fallback
  }
}
```

**Benefits:**
- Enhanced concurrency safety when in monorepo
- Works standalone without semaphore (graceful fallback)
- Demonstrates optional tool composition

## Implementation Checklist

- [x] Identify high-value compositions (flaky detection, output diffing, semaphore integration)
- [x] Create composition scripts (`scripts/dogfood-flaky.sh`, `scripts/dogfood-diff.sh`)
- [x] Update README with dogfooding section
- [ ] Update GH Pages docs (if applicable)
- [x] Test graceful fallback when tools not available
- [x] Document in this file

## Expected Outcomes

1. **Proves Reliability:** 56 tests × 10 runs = 560 test executions without flakiness
2. **Demonstrates Composability:** Uses flaky, odiff, and semats via CLI and library
3. **Real Value:** Port allocation reliability is critical for test infrastructure

## Tool-Specific Validation

### Port Collision Prevention

portres exists specifically to prevent port collisions. The dogfood scripts validate this works:

```bash
# Scenario: Multiple parallel test processes
./scripts/dogfood-flaky.sh 20

# If any run fails due to EADDRINUSE or port collisions,
# the flakiness detector will catch it immediately
```

### Registry Atomicity

The semaphore integration ensures registry operations are atomic:

```bash
# When semats is available (monorepo context):
# [INFO] Using file-based-semaphore-ts for registry locking

# When standalone:
# [INFO] Running without semaphore (standalone mode)
```

---

**Guidelines:**
- Only implement compositions that provide REAL value
- Don't dogfood just for the sake of dogfooding
- Focus on 2-4 high-impact compositions
- Keep tools standalone (graceful fallback)
- Prioritize: Test validation > Output consistency > Domain-specific needs

**Status:** Customized for test-port-resolver
