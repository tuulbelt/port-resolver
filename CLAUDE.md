# Test Port Resolver / portres

**Tool-specific Claude Code context for development**

## What This Tool Does

Concurrent test port allocation to avoid port conflicts in parallel tests. Provides a centralized port registry with atomic access via file-based semaphores.

## Key Architecture

- **Registry**: File-based JSON registry (`~/.portres/registry.json`)
- **Locking**: Uses `@tuulbelt/file-based-semaphore-ts` for atomic registry access
- **Port allocation**: Random selection with fallback to sequential scan
- **Stale cleanup**: Automatic removal of dead process entries
- **Security**: Path validation, tag sanitization, port range restrictions

## Development Workflow

```bash
npm install  # Install dev dependencies
npm test     # Run all tests (56 tests)
npm run build  # TypeScript compilation
npm link     # Enable global 'portres' command
```

## Critical Implementation Details

### Required Dependency (PRINCIPLES.md Exception 2)

This tool REQUIRES `@tuulbelt/file-based-semaphore-ts` as a library dependency:
- **Why**: Ensures atomic registry access across concurrent processes
- **Git URL**: `git+https://github.com/tuulbelt/file-based-semaphore-ts.git`
- **Zero external deps maintained**: Both tools use only Node.js standard library

### Port Allocation Strategy

1. **Random port selection first** (faster for sparse ranges)
2. **Sequential scan fallback** (exhaustive search)
3. **Collision avoidance** (checks both registry and actual port availability)

### Security Patterns

```typescript
// Path traversal prevention
const DANGEROUS_PATH_PATTERNS = ['..', '\x00'];

// Tag sanitization (prevents registry injection)
const TAG_CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

// Port range validation
if (!allowPrivileged && port < 1024) { /* reject */ }
```

## Testing

- **56 tests across 7 suites**
- Categories: Basic API, CLI, Error Handling, Security, Registry Management, Edge Cases, Stress Tests
- **Performance tests**: 50 sequential allocations, 20-port batches, rapid cycles
- **Security tests**: Path traversal, tag injection, privileged ports

## Common Issues

### Registry Corruption
- **Cause**: Concurrent writes without semaphore
- **Solution**: Always use `acquireLock()` before registry read/write

### Port Conflicts
- **Cause**: Registry out of sync with actual port usage
- **Solution**: Both registry check AND `isPortAvailable()` check

### Stale Entries
- **Cause**: Processes crash without cleanup
- **Solution**: Automatic cleanup based on PID check + timestamp

## Related Tools

- [file-based-semaphore-ts](https://github.com/tuulbelt/file-based-semaphore-ts) - REQUIRED dependency
- [test-flakiness-detector](https://github.com/tuulbelt/test-flakiness-detector) - Dogfoods this tool

## Files to Know

- `src/index.ts` - Main implementation (950 lines)
- `test/index.test.ts` - Comprehensive test suite
- `docs/demo.gif` - CLI demo recording
- `.github/workflows/test.yml` - CI with Node 18, 20, 22 matrix

## Quality Standards

- Zero external runtime dependencies (Tuulbelt tools allowed)
- Result pattern for all fallible operations
- Path validation for all file operations
- Tag sanitization for all user input
- Secure file permissions (0600/0700)

## See Also

- [PRINCIPLES.md](https://github.com/tuulbelt/tuulbelt/blob/main/PRINCIPLES.md) - Exception 2: Library composition
- [Meta repo](https://github.com/tuulbelt/tuulbelt) - All Tuulbelt tools
