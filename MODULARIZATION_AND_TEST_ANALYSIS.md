# Port-Resolver: Modularization & Test Coverage Analysis

**Date:** 2026-01-11
**Current Status:** v0.2.0 with 159 tests passing
**Comparison Baseline:** property-validator v0.10.0 (898 tests, fully modularized)

---

## Executive Summary

### Critical Findings

1. **❌ NOT Modularized**: All code in single 1463-line `src/index.ts` file
2. **⚠️ Limited Tree-Shaking**: While `sideEffects: false` is set, monolithic structure prevents effective tree-shaking
3. **⚠️ Test Coverage Gaps**: Internal helpers, CLI, and error paths undertested
4. **✅ Core Functionality**: Well-tested (159 tests for main APIs)

### Comparison to property-validator

| Aspect | property-validator | port-resolver | Gap |
|--------|-------------------|---------------|-----|
| **Modularization** | ✅ Fully modular (validators/, core/, refinements/) | ❌ Single 1463-line file | CRITICAL |
| **Entry Points** | ✅ Multiple (/v, /lite, /fast) | ❌ Single index.ts | HIGH |
| **Tree-Shaking** | ✅ Effective (per-module) | ⚠️ Limited (all-or-nothing) | HIGH |
| **Tests** | 898 tests | 159 tests | MEDIUM |
| **Test Types** | Unit + Integration | Mostly Integration | MEDIUM |
| **CLI Testing** | ✅ Tested | ❌ Not tested | MEDIUM |
| **Helper Testing** | ✅ Unit tests for helpers | ❌ Integration only | LOW |

---

## Part 1: Modularization Analysis

### Current Structure

```
src/
└── index.ts (1463 lines, 45KB)
    ├── Types (89 lines)
    ├── Path Validation (66 lines)
    ├── Utility Functions (48 lines)
    ├── File Operations (118 lines)
    ├── PortResolver Class (499 lines)
    ├── Module-Level Functions (152 lines)
    ├── PortManager Class (133 lines)
    └── CLI (220 lines)
```

**Issues:**
1. **No separation of concerns** - types, utilities, classes, CLI all mixed
2. **Cannot import subsets** - users must import entire file
3. **Testing complexity** - cannot unit test helpers in isolation
4. **Maintenance burden** - 1463 lines in single file

### Recommended Modular Structure

```
src/
├── index.ts                    # Main entry point (re-exports)
├── types.ts                    # All type definitions
├── config.ts                   # DEFAULT_CONFIG, constants
├── utils/
│   ├── path-validation.ts      # sanitizeTag, validatePath
│   ├── port-availability.ts    # isPortAvailable, findAvailablePort
│   └── process.ts              # isProcessRunning, filterStaleEntries
├── registry/
│   ├── read.ts                 # readRegistry
│   ├── write.ts                # writeRegistry
│   ├── paths.ts                # getRegistryPath, getLockPath
│   └── index.ts                # Re-exports
├── core/
│   ├── port-resolver.ts        # PortResolver class
│   ├── port-manager.ts         # PortManager class
│   └── index.ts                # Re-exports
├── api/
│   ├── get-port.ts             # getPort function
│   ├── get-ports.ts            # getPorts function
│   ├── release-port.ts         # releasePort function
│   └── index.ts                # Re-exports
└── cli.ts                      # CLI entry point

Entry points:
├── package.json exports:
│   ├── "."           → src/index.ts (everything)
│   ├── "./core"      → src/core/index.ts (PortResolver, PortManager)
│   ├── "./api"       → src/api/index.ts (getPort, getPorts, releasePort)
│   ├── "./utils"     → src/utils/index.ts (utilities only)
│   └── "./types"     → src/types.ts (types only)
```

**Benefits:**
1. **Tree-shaking**: Import only what you need
   ```typescript
   // Before (imports everything):
   import { getPort } from '@tuulbelt/port-resolver';

   // After (tree-shakable):
   import { getPort } from '@tuulbelt/port-resolver/api';
   ```

2. **Testing**: Unit test helpers in isolation
   ```typescript
   import { sanitizeTag } from '../src/utils/path-validation';
   ```

3. **Maintenance**: Smaller, focused files
4. **Build optimization**: Bundlers can eliminate unused code

### property-validator Modularization Example

```typescript
// property-validator structure (for reference):
src/
├── index.ts (149 lines - just re-exports)
├── core/
│   ├── validate.ts
│   └── compile.ts
├── validators/
│   ├── string.ts
│   ├── number.ts
│   ├── object.ts
│   └── ...
├── refinements/
│   ├── string-refinements.ts
│   └── number-refinements.ts
├── internal/
│   └── path.ts
└── types.ts

// Entry points in package.json:
{
  "exports": {
    ".": "./src/index.ts",
    "./v": "./src/v.ts",
    "./lite": "./src/lite.ts"
  }
}
```

---

## Part 2: Test Coverage Analysis

### Current Test Distribution

| Test File | Lines | Tests | Focus |
|-----------|-------|-------|-------|
| index.test.ts | 1542 | 79 | Core PortResolver APIs (v0.1.0 baseline) |
| new-apis.test.ts | 634 | 27 | Module-level APIs, PortManager |
| range-apis.test.ts | 389 | 19 | reserveRange, getPortInRange |
| edge-cases.test.ts | 481 | 34 | Edge cases, resilience |
| **Total** | **3046** | **159** | |

**Test Breakdown:**
- 79 baseline (v0.1.0)
- 27 module-level APIs
- 19 range APIs
- 34 edge cases + resilience

### Untested Code Paths

#### 1. Internal Helpers (0% direct coverage)

| Function | Location | Current Testing | Gap |
|----------|----------|-----------------|-----|
| `sanitizeTag()` | Line 105 | Integration only | No unit tests |
| `validatePath()` | Line 124 | Integration only | No unit tests |
| `getRegistryPath()` | Line 218 | Integration only | No unit tests |
| `getLockPath()` | Line 229 | Integration only | No unit tests |
| `ensureRegistryDir()` | Line 240 | Integration only | No unit tests |
| `readRegistry()` | Line 259 | Integration only | No unit tests |
| `writeRegistry()` | Line 291 | Integration only | No unit tests |
| `isProcessRunning()` | Line 318 | Integration only | No unit tests |
| `filterStaleEntries()` | Line 330 | Integration only | No unit tests |

**Recommendation:** Create `test/utils.test.ts` with unit tests for:
- `sanitizeTag()`: Test control char removal, max length, edge cases
- `validatePath()`: Test path traversal prevention, null bytes
- `isProcessRunning()`: Test with valid/invalid PIDs
- `filterStaleEntries()`: Test stale detection logic

**Estimated Test Count:** +25-30 tests

#### 2. CLI (0% coverage)

| Function | Location | Current Testing | Gap |
|----------|----------|-----------------|-----|
| `parseArgs()` | Line 1134 | None | No CLI tests |
| `printHelp()` | Line 1192 | None | No CLI tests |
| `printVersion()` | Line 1244 | None | No CLI tests |
| `main()` | Line 1244 | None | No CLI tests |

**Recommendation:** Create `test/cli.test.ts` with:
- Argument parsing tests (flags, values, errors)
- Help text generation test
- Version output test
- CLI command integration tests (get, release, list, status, clean, range)
- Error handling (invalid args, missing required args)

**Estimated Test Count:** +35-40 tests

#### 3. Error Paths (Partial coverage)

**Undertested error scenarios:**
1. **File system errors**:
   - Registry file unreadable (permissions)
   - Registry directory creation fails
   - Atomic write fails (renameSync)
   - Lock file issues

2. **Semaphore errors**:
   - Semaphore acquire timeout
   - Semaphore release failure
   - Lock file corruption

3. **Port allocation edge cases**:
   - All ports in range already allocated
   - Port becomes unavailable between check and bind
   - Registry size limit exceeded (maxRegistrySize)
   - Concurrent modifications during atomic operations

4. **Input validation**:
   - Privileged ports without opt-in
   - Invalid port ranges (min > max)
   - Tag with null bytes
   - Tag exceeding MAX_TAG_LENGTH

**Recommendation:** Create `test/error-paths.test.ts` with:
- File system error simulation
- Semaphore failure scenarios
- Port exhaustion scenarios
- Input validation edge cases

**Estimated Test Count:** +30-35 tests

#### 4. Configuration Edge Cases (Partial coverage)

**Undertested configuration scenarios:**
1. Custom registryDir paths
2. Privileged port opt-in (`allowPrivileged: true`)
3. Custom `maxPortsPerRequest` limits
4. Custom `maxRegistrySize` limits
5. Custom `staleTimeout` values
6. Verbose mode output

**Recommendation:** Expand existing tests or create `test/config.test.ts`

**Estimated Test Count:** +15-20 tests

#### 5. Race Conditions & Concurrency (Partial coverage)

**Current concurrency tests:**
- Concurrent PortManager instances (1 test)
- Concurrent getPorts calls (basic)

**Missing concurrency scenarios:**
1. Rapid allocation/release cycles
2. Multiple processes modifying registry simultaneously
3. Semaphore contention under load
4. Registry cleanup during active allocations

**Recommendation:** Expand `test/edge-cases.test.ts` with stress tests

**Estimated Test Count:** +10-15 tests

---

## Part 3: Property-Validator Comparison

### Why property-validator has 898 tests

**Structural Complexity:**
- **17 validator types** (string, number, boolean, object, array, union, etc.)
- **30+ refinements** (email, url, min, max, regex, custom, etc.)
- **Combinatorial explosion**: Each validator × refinements × edge cases
- **Type inference**: Generic types, nested objects, discriminated unions
- **Multiple APIs**: validate(), check(), compileCheck(), toJsonSchema()

**Example test expansion:**
```typescript
// String validator alone has ~60 tests:
- Basic validation (valid/invalid)
- Min length (boundary, empty, exact)
- Max length (boundary, overflow, exact)
- Regex pattern (match, no match, invalid regex)
- Email refinement (valid, invalid, edge cases)
- URL refinement (valid, invalid, protocols)
- UUID refinement (v4, invalid formats)
- Custom refinement (pass, fail, error handling)
- Combinations (min + max, email + min, etc.)
```

### Why port-resolver doesn't need 898 tests

**Functional Simplicity:**
- **Single domain**: Port allocation/release
- **3 main classes**: PortResolver, PortManager, module-level functions
- **No combinatorial explosion**: Ports are just numbers
- **Limited refinements**: Tag validation, range validation
- **Fewer edge cases**: Port availability is binary (yes/no)

**Realistic Test Target:**
- Current: 159 tests
- With modularization + helpers: ~200-220 tests
- With CLI + error paths: ~250-270 tests
- With comprehensive concurrency: ~280-300 tests

**Target: 250-300 tests (reasonable, not hallucinated)**

---

## Part 4: Recommended Actions

### Priority 1: Modularization (CRITICAL)

**Impact:** High - Enables tree-shaking, better testing, maintainability

**Steps:**
1. Create modular directory structure (utils/, registry/, core/, api/)
2. Split index.ts into focused modules
3. Add package.json exports for entry points
4. Update tests to import from specific modules
5. Verify tree-shaking works with bundler test

**Estimated Effort:** 4-6 hours
**Test Impact:** +0 tests (refactoring only), but enables easier unit testing

### Priority 2: Helper Unit Tests (HIGH)

**Impact:** Medium - Increases coverage, catches edge cases

**Steps:**
1. Create test/utils.test.ts
2. Add unit tests for:
   - `sanitizeTag()` - 8-10 tests
   - `validatePath()` - 8-10 tests
   - `isProcessRunning()` - 5-6 tests
   - `filterStaleEntries()` - 5-6 tests

**Estimated Effort:** 2-3 hours
**Test Impact:** +25-30 tests

### Priority 3: CLI Testing (MEDIUM)

**Impact:** Medium - Ensures CLI works correctly

**Steps:**
1. Create test/cli.test.ts
2. Add tests for:
   - Argument parsing - 10-12 tests
   - CLI commands (get, release, list, status, clean, range) - 15-18 tests
   - Error handling - 8-10 tests

**Estimated Effort:** 3-4 hours
**Test Impact:** +35-40 tests

### Priority 4: Error Path Testing (MEDIUM)

**Impact:** Medium - Improves robustness

**Steps:**
1. Create test/error-paths.test.ts
2. Add tests for:
   - File system errors - 10-12 tests
   - Semaphore errors - 6-8 tests
   - Port allocation edge cases - 8-10 tests
   - Input validation - 6-8 tests

**Estimated Effort:** 3-4 hours
**Test Impact:** +30-35 tests

### Priority 5: Configuration Testing (LOW)

**Impact:** Low - Nice to have

**Steps:**
1. Expand existing tests with custom configurations
2. Test all config options (allowPrivileged, maxPortsPerRequest, etc.)

**Estimated Effort:** 1-2 hours
**Test Impact:** +15-20 tests

---

## Part 5: Modularization Implementation Plan

### Step 1: Create Directory Structure

```bash
mkdir -p src/{utils,registry,core,api}
```

### Step 2: Extract Types

Create `src/types.ts`:
```typescript
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface PortConfig { /* ... */ }
export interface PortEntry { /* ... */ }
export interface PortRegistry { /* ... */ }
export interface PortAllocation { /* ... */ }
export interface RegistryStatus { /* ... */ }
```

### Step 3: Extract Utilities

Create `src/utils/path-validation.ts`:
```typescript
import type { Result } from '../types';

export function sanitizeTag(tag: string | undefined): string | undefined { /* ... */ }
export function validatePath(pathStr: string): Result<string> { /* ... */ }
```

Create `src/utils/port-availability.ts`:
```typescript
import type { Result } from '../types';

export function isPortAvailable(port: number, host?: string): Promise<boolean> { /* ... */ }
export function findAvailablePort(min: number, max: number): Promise<Result<number>> { /* ... */ }
```

Create `src/utils/process.ts`:
```typescript
import type { PortEntry } from '../types';

export function isProcessRunning(pid: number): boolean { /* ... */ }
export function filterStaleEntries(entries: PortEntry[], staleTimeout: number) { /* ... */ }
```

### Step 4: Extract Registry Operations

Create `src/registry/read.ts`, `src/registry/write.ts`, `src/registry/paths.ts`

### Step 5: Extract Core Classes

Create `src/core/port-resolver.ts` (PortResolver class)
Create `src/core/port-manager.ts` (PortManager class)

### Step 6: Extract API Functions

Create `src/api/get-port.ts`, `src/api/get-ports.ts`, `src/api/release-port.ts`

### Step 7: Update index.ts

```typescript
// Re-export everything for backward compatibility
export * from './types';
export * from './config';
export * from './utils';
export * from './registry';
export * from './core';
export * from './api';
```

### Step 8: Add Package.json Exports

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./core": "./src/core/index.ts",
    "./api": "./src/api/index.ts",
    "./utils": "./src/utils/index.ts",
    "./types": "./src/types.ts"
  }
}
```

---

## Part 6: Test Expansion Plan

### Phase 1: Helper Unit Tests (Priority 2)

**File:** `test/utils.test.ts`

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTag, validatePath } from '../src/utils/path-validation';
import { isProcessRunning, filterStaleEntries } from '../src/utils/process';

test('sanitizeTag', async (t) => {
  await t.test('removes control characters', () => { /* ... */ });
  await t.test('removes newlines', () => { /* ... */ });
  await t.test('handles undefined', () => { /* ... */ });
  await t.test('handles empty string', () => { /* ... */ });
  await t.test('enforces max length', () => { /* ... */ });
  await t.test('handles unicode', () => { /* ... */ });
  // +8-10 tests
});

test('validatePath', async (t) => {
  await t.test('accepts valid absolute path', () => { /* ... */ });
  await t.test('rejects path traversal (..)', () => { /* ... */ });
  await t.test('rejects null bytes', () => { /* ... */ });
  await t.test('handles symlinks', () => { /* ... */ });
  // +8-10 tests
});

test('isProcessRunning', async (t) => {
  await t.test('returns true for current process', () => { /* ... */ });
  await t.test('returns false for invalid PID', () => { /* ... */ });
  await t.test('returns false for PID 0', () => { /* ... */ });
  // +5-6 tests
});

test('filterStaleEntries', async (t) => {
  await t.test('separates active and stale entries', () => { /* ... */ });
  await t.test('handles empty entries', () => { /* ... */ });
  await t.test('respects staleTimeout', () => { /* ... */ });
  // +5-6 tests
});
```

**Total:** +25-30 tests

### Phase 2: CLI Tests (Priority 3)

**File:** `test/cli.test.ts`

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

test('CLI: parseArgs', async (t) => {
  await t.test('parses get command', () => { /* ... */ });
  await t.test('parses release command', () => { /* ... */ });
  await t.test('parses --tag flag', () => { /* ... */ });
  await t.test('parses --port flag', () => { /* ... */ });
  await t.test('parses --json flag', () => { /* ... */ });
  await t.test('rejects invalid command', () => { /* ... */ });
  // +10-12 tests
});

test('CLI: Integration', async (t) => {
  await t.test('portres get --tag test', () => {
    const output = execSync('npx tsx src/index.ts get --tag test').toString();
    // Verify JSON output
  });
  await t.test('portres release --port 12345', () => { /* ... */ });
  await t.test('portres list --json', () => { /* ... */ });
  await t.test('portres status --json', () => { /* ... */ });
  await t.test('portres clean', () => { /* ... */ });
  await t.test('portres range --start 50000 --count 5', () => { /* ... */ });
  // +15-18 tests
});

test('CLI: Error Handling', async (t) => {
  await t.test('shows help for invalid command', () => { /* ... */ });
  await t.test('shows error for missing required arg', () => { /* ... */ });
  await t.test('shows version with --version', () => { /* ... */ });
  // +8-10 tests
});
```

**Total:** +35-40 tests

### Phase 3: Error Paths (Priority 4)

**File:** `test/error-paths.test.ts`

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PortResolver } from '../src/core/port-resolver';

test('File System Errors', async (t) => {
  await t.test('handles registry read permission error', async () => { /* ... */ });
  await t.test('handles registry write permission error', async () => { /* ... */ });
  await t.test('handles directory creation failure', async () => { /* ... */ });
  await t.test('handles atomic write failure', async () => { /* ... */ });
  // +10-12 tests
});

test('Semaphore Errors', async (t) => {
  await t.test('handles semaphore acquire timeout', async () => { /* ... */ });
  await t.test('handles semaphore release failure', async () => { /* ... */ });
  // +6-8 tests
});

test('Port Allocation Edge Cases', async (t) => {
  await t.test('handles port exhaustion', async () => { /* ... */ });
  await t.test('handles registry size limit', async () => { /* ... */ });
  await t.test('handles concurrent modifications', async () => { /* ... */ });
  // +8-10 tests
});

test('Input Validation', async (t) => {
  await t.test('rejects privileged port without opt-in', async () => { /* ... */ });
  await t.test('rejects invalid port range (min > max)', async () => { /* ... */ });
  await t.test('rejects tag with null bytes', async () => { /* ... */ });
  // +6-8 tests
});
```

**Total:** +30-35 tests

---

## Summary

### Current State
- ✅ 159 tests passing
- ❌ Single 1463-line file
- ⚠️ Limited tree-shaking
- ⚠️ No CLI tests
- ⚠️ No helper unit tests

### Recommended Improvements

| Priority | Task | Effort | Test Impact | Modularization Impact |
|----------|------|--------|-------------|----------------------|
| **P1** | Modularization | 4-6h | 0 (refactor) | ✅✅✅ Critical |
| **P2** | Helper unit tests | 2-3h | +25-30 | ✅✅ Enables testing |
| **P3** | CLI testing | 3-4h | +35-40 | ✅ Better separation |
| **P4** | Error path testing | 3-4h | +30-35 | - |
| **P5** | Config testing | 1-2h | +15-20 | - |

### Final State (After All Improvements)
- **Tests:** 250-270 (realistic, not hallucinated)
- **Structure:** Modular (10-12 files)
- **Tree-shaking:** Effective
- **Coverage:** Comprehensive (helpers, CLI, errors)

### Comparison to property-validator

| Metric | property-validator | port-resolver (current) | port-resolver (improved) |
|--------|-------------------|------------------------|--------------------------|
| Tests | 898 | 159 | 250-270 |
| Files | 15+ | 1 | 10-12 |
| Modularization | ✅ Full | ❌ None | ✅ Full |
| Tree-shaking | ✅ Effective | ⚠️ Limited | ✅ Effective |
| Entry points | 3 | 1 | 4-5 |

**Conclusion:** port-resolver doesn't need 898 tests (different domain complexity), but 250-270 tests with full modularization is the right target for production quality.

---

**End of Analysis**
