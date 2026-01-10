# Port Resolver Enhancement Plan

**Branch:** `claude/enhance-port-resolver-RwdBJ`
**Status:** In Progress
**Started:** 2026-01-10
**Based On:** [TOOL_MATURITY_ANALYSIS.md](../../docs/TOOL_MATURITY_ANALYSIS.md)

---

## Overview

This document tracks the enhancement of port-resolver from v0.1.0 (foundation tool) to v0.2.0 (competitive advantage tool). Port-resolver has **STRONG competitive position** - no other tool handles concurrent test port allocation safely.

**Differentiator:** Concurrent-safe via file-based-semaphore-ts integration

---

## Enhancement Phases

### Phase 1: Core API Expansion (Multi-Tier APIs)
**Priority:** 🔴 HIGH
**Target:** Match propval's multi-API design pattern

- [ ] **1.1 Batch Allocation API** (CRITICAL)
  - [ ] Library: `getPorts(count, options)` - allocate N ports atomically
  - [ ] Library: Return all ports or fail entirely (transactional)
  - [ ] CLI: `portres batch --count 3 --tags "http,grpc,metrics"`
  - [ ] Tests: Concurrent batch allocation safety
  - [ ] Tests: Transaction rollback on partial failure

- [ ] **1.2 Port Manager API** (HIGH)
  - [ ] Library: `new PortManager({ baseDir })` - lifecycle management
  - [ ] Library: `manager.allocate(tag)` - single allocation
  - [ ] Library: `manager.releaseAll()` - cleanup all ports
  - [ ] CLI: `portres manager create --base-dir /tmp/ports`
  - [ ] CLI: `portres manager allocate --tag test-1`
  - [ ] CLI: `portres manager cleanup`
  - [ ] Tests: Manager lifecycle tests
  - [ ] Tests: Auto-cleanup on process exit

- [ ] **1.3 Port Range API** (MEDIUM)
  - [ ] Library: `reserveRange({ start, count })` - reserve contiguous range
  - [ ] Library: `getPortInRange({ min, max })` - constrained allocation
  - [ ] CLI: `portres range --start 8000 --count 10`
  - [ ] CLI: `portres get --min 8000 --max 9000`
  - [ ] Tests: Range conflict detection
  - [ ] Tests: Range boundary validation

- [ ] **1.4 Result Type Pattern** (HIGH)
  - [ ] Library: Add `type PortResult<T> = { ok: true; value: T } | { ok: false; error: Error }`
  - [ ] Library: Refactor all APIs to return Result type
  - [ ] Library: Non-throwing by default (composable)
  - [ ] Tests: Error handling via Result type

---

### Phase 2: Documentation (SPEC.md + Examples)
**Priority:** 🔴 HIGH
**Target:** Match propval's documentation standard

- [ ] **2.1 SPEC.md Enhancement** (HIGH)
  - [ ] Review existing SPEC.md
  - [ ] Add batch allocation algorithm
  - [ ] Add port range allocation strategy
  - [ ] Add transaction rollback behavior
  - [ ] Add multi-port locking strategy

- [ ] **2.2 Advanced Examples** (HIGH)
  - [ ] `examples/parallel-tests.ts` - Jest/Vitest parallel test suite
  - [ ] `examples/batch-allocation.ts` - Multi-service testing
  - [ ] `examples/port-manager.ts` - Lifecycle management
  - [ ] `examples/ci-integration.ts` - GitHub Actions setup

- [ ] **2.3 CI Integration Guide** (MEDIUM)
  - [ ] GitHub Actions parallel job setup
  - [ ] Matrix testing with port isolation
  - [ ] Docker container port allocation
  - [ ] Best practices for CI environments

- [ ] **2.4 README Expansion** (MEDIUM)
  - [ ] Update API reference (14+ sections like propval)
  - [ ] Add batch allocation examples
  - [ ] Add troubleshooting section
  - [ ] Add performance considerations

---

### Phase 3: CLI Enhancement (Shell Experience)
**Priority:** 🟡 MEDIUM
**Target:** Exhaustive CLI potential (per maturity analysis philosophy)

- [ ] **3.1 Machine-Readable Output** (HIGH)
  - [ ] CLI: `--format json` support
  - [ ] CLI: `--format csv` support
  - [ ] CLI: `--quiet` mode (port number only)
  - [ ] Tests: Output format validation

- [ ] **3.2 Health Check API** (MEDIUM)
  - [ ] Library: `isPortFree(port)` - verify port availability
  - [ ] Library: `healthCheck(port)` - TCP connection test
  - [ ] CLI: `portres check --port 8080`
  - [ ] Tests: Port availability detection

- [ ] **3.3 Release Tracking** (MEDIUM)
  - [ ] Library: Track which tests hold which ports
  - [ ] CLI: `portres list` - show allocated ports
  - [ ] CLI: `portres list --verbose` - show tags, timestamps
  - [ ] CLI: `portres release --port 8080` - manual release
  - [ ] Tests: Tracking persistence across runs

- [ ] **3.4 Interactive Mode** (LOW - CLI-specific)
  - [ ] CLI: `portres interactive` - TUI for port management
  - [ ] Display: Real-time port allocation view
  - [ ] Display: Port release confirmation prompts

---

### Phase 4: Testing & Quality
**Priority:** 🔴 HIGH
**Target:** Maintain 100% test pass rate, expand coverage

- [ ] **4.1 Unit Tests** (CRITICAL)
  - [ ] Batch allocation tests (+15 tests)
  - [ ] Port manager tests (+10 tests)
  - [ ] Port range tests (+8 tests)
  - [ ] Result type tests (+5 tests)
  - [ ] Target: 95+ tests (from 56)

- [ ] **4.2 Integration Tests** (HIGH)
  - [ ] Multi-process concurrent allocation
  - [ ] Crash recovery (stale port cleanup)
  - [ ] Cross-platform (Windows/Linux/macOS)
  - [ ] Network FS scenarios (NFS edge cases)

- [ ] **4.3 CLI Tests** (MEDIUM)
  - [ ] All new CLI commands
  - [ ] Output format validation
  - [ ] Error message clarity
  - [ ] Exit code correctness

- [ ] **4.4 Dogfooding** (MEDIUM)
  - [ ] Verify test-flakiness-detector integration
  - [ ] Run `npm run dogfood` successfully
  - [ ] Document any dogfooding insights

---

### Phase 5: Benchmarking (Optional but Recommended)
**Priority:** 🟡 MEDIUM
**Verdict:** ⚠️ OPTIONAL per maturity analysis, but useful for CI optimization

- [ ] **5.1 Benchmark Infrastructure** (if pursued)
  - [ ] `benchmarks/` directory setup (already exists!)
  - [ ] `benchmarks/package.json` with tatami-ng
  - [ ] `benchmarks/index.bench.ts` - core operations
  - [ ] `benchmarks/README.md` - results documentation

- [ ] **5.2 Benchmark Scenarios** (if pursued)
  - [ ] Single port allocation speed
  - [ ] Batch allocation (N=10) speed
  - [ ] Concurrent allocation (10 parallel processes)
  - [ ] Lock acquisition overhead measurement

- [ ] **5.3 Competitive Comparison** (if pursued)
  - [ ] vs get-port (baseline)
  - [ ] vs detect-port (alternative)
  - [ ] Document concurrent-safety advantage

---

## Version Milestones

| Version | Deliverables | Status |
|---------|--------------|--------|
| **v0.1.0** | Foundation (current) | ✅ Released |
| **v0.2.0** | Multi-API + Enhanced SPEC + Examples | 🔄 In Progress |
| **v0.3.0** | Benchmark CI (if applicable) | ⏳ Future |
| **v1.0.0** | Stable API | ⏳ Future |

---

## Success Criteria for v0.2.0

- [ ] **API Completeness:** All Phase 1 APIs implemented
- [ ] **Documentation:** Enhanced SPEC.md + 4 advanced examples complete
- [ ] **Tests:** 95+ tests passing (from 56)
- [ ] **CLI:** Machine-readable output + all new commands
- [ ] **Quality:** `/quality-check` passes
- [ ] **Dogfooding:** Integration validated
- [ ] **Release:** Tag v0.2.0, create PR

---

## Implementation Strategy

**Order of Work:** (Vertical - complete each feature fully)

1. **Batch Allocation** (highest impact)
   - Library API → CLI → Tests → Examples → Docs

2. **Port Manager** (lifecycle management)
   - Library API → CLI → Tests → Examples → Docs

3. **Port Ranges** (constrained allocation)
   - Library API → CLI → Tests → Examples → Docs

4. **Result Type** (horizontal refactor)
   - Apply to all existing + new APIs

5. **Documentation** (consolidate all)
   - Enhanced SPEC.md → Examples → README expansion

6. **CLI Enhancement** (polish)
   - Output formats → Health checks → Release tracking

---

## Session Continuity

**For next session:**
1. Review this document (ENHANCEMENT_PLAN.md)
2. Check current phase status
3. Continue from last incomplete task
4. Update task checkboxes as work completes
5. Commit this file with each session's progress

**Never commit to main!** All work goes to:
- Meta: `claude/enhance-port-resolver-RwdBJ`
- Submodule: `claude/enhance-port-resolver-RwdBJ`

---

## References

- [TOOL_MATURITY_ANALYSIS.md](../../docs/TOOL_MATURITY_ANALYSIS.md#7-port-resolver-portres)
- [Property Validator](../property-validator/README.md) - Gold standard
- [QUALITY_CHECKLIST.md](../../docs/QUALITY_CHECKLIST.md)
- [Current README](./README.md)
- [Current SPEC.md](./SPEC.md) - Already exists!

---

**Last Updated:** 2026-01-10
**Next Session:** Start with Phase 1.1 (Batch Allocation API)
