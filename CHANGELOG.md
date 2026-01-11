# Changelog

All notable changes to port-resolver will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-10

### Added

**Core API Expansion (Multi-Tier APIs):**
- Module-level batch allocation API: `getPorts({ count, tags, config })` for atomic multi-port allocation
- Module-level convenience API: `getPort({ tag, config })` as simple wrapper
- Module-level release API: `releasePort({ tag, port, config })` with idempotent behavior
- PortManager class for lifecycle management:
  - `new PortManager(config)` - centralized port management
  - `manager.allocate(tag)` - single port allocation
  - `manager.allocateMultiple(count, tag)` - batch allocation
  - `manager.release(tagOrPort)` - release by tag or port number
  - `manager.releaseAll()` - cleanup all managed ports
  - `manager.getAllocations()` - retrieve tracked allocations
  - `manager.get(tag)` - lookup allocation by tag
- Port range APIs:
  - `reserveRange({ start, count, tag })` - reserve contiguous port ranges
  - `getPortInRange({ min, max, tag })` - constrained allocation within bounds
- CLI commands for range operations:
  - `portres reserve-range --port <start> --count <n>`
  - `portres get-in-range --min-port <min> --max-port <max>`
  - `portres list` - list all current allocations
  - `portres release --tag <tag> | --port <port>` - release specific allocation
- Comprehensive testing: 153 tests (up from 56), including:
  - 27 new-APIs tests for batch allocation and PortManager
  - 19 range-API tests for port range functionality
  - 18 edge case tests for resilience and error handling
  - 6 releasePort() tests for idempotent release behavior

**Documentation:**
- Enhanced SPEC.md (528 lines) with complete algorithm documentation
- Advanced examples:
  - `examples/parallel-tests.ts` - Parallel test execution patterns
  - `examples/batch-allocation.ts` - Module-level API demonstrations
  - `examples/port-manager.ts` - Lifecycle management examples
  - `examples/ci-integration.ts` - CI/CD integration patterns
- Comprehensive CI_INTEGRATION.md guide (17K, 500+ lines)
- Updated README with all v0.2.0 APIs and examples
- AUDIT_FINDINGS.md documenting implementation verification

**CLI Enhancement:**
- Machine-readable output: `--json` flag for all commands
- Health check functionality: improved `isPortAvailable()` implementation
- Range management commands (reserve-range, get-in-range)

**Benchmarking Infrastructure:**
- Complete benchmark suite using tatami-ng (Criterion-equivalent for Node.js)
- 7 benchmark groups covering all v0.2.0 APIs:
  - PortResolver creation
  - Single port allocation
  - Batch allocation
  - Port range allocation
  - PortManager lifecycle
  - Port release
  - Concurrent stress testing
- Competitor benchmarks (get-port, detect-port)
- Comprehensive benchmarks/README.md with performance analysis
- Documented I/O-bound performance characteristics

**Quality & Testing:**
- Tree-shaking support: `sideEffects: false` in package.json
- Enhanced error handling with idempotent release behavior
- Registry corruption recovery tests
- Large batch allocation performance tests
- Stress testing for rapid allocate/release cycles
- Zero runtime dependencies verified (uses only file-based-semaphore-ts)

### Changed
- Updated test count badge: 56 → 153 passing tests
- Enhanced Result type pattern across all new APIs
- Improved error messages for range validation

### Fixed
- releasePort() now handles "Invalid port number" errors idempotently
- Range validation error messages now accurately reflect constraints

### Performance
- I/O-bound operations: ~10-30% overhead compared to get-port/detect-port
- Competitive performance while providing unique safety guarantees
- Atomic batch allocation with all-or-nothing semantics

### Documentation
- All 5 enhancement phases complete (Core APIs, Documentation, CLI, Testing, Benchmarking)
- Complete algorithm documentation for:
  - Batch allocation with rollback
  - Port range allocation strategy
  - Transaction rollback behavior
  - Multi-port locking strategy

---

## [0.1.0] - 2026-01-08

### Added
- Initial release with core functionality
- PortResolver class with basic port allocation
- File-based registry for cross-process coordination
- Semaphore-protected atomic operations via file-based-semaphore-ts
- Result pattern for error handling
- CLI tool with basic commands (get, release)
- Comprehensive test suite (56 tests)
- Basic documentation and examples

### Implementation Notes
- Zero runtime dependencies (except Tuulbelt tools)
- Uses Node.js built-in modules only
- TypeScript with strict type checking
- Library composition: uses file-based-semaphore-ts for atomic registry access

---

[0.2.0]: https://github.com/tuulbelt/port-resolver/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tuulbelt/port-resolver/releases/tag/v0.1.0
