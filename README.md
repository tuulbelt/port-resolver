# Test Port Resolver / `portres`

[![Tests](https://github.com/tuulbelt/tuulbelt/actions/workflows/test-all-tools.yml/badge.svg)](https://github.com/tuulbelt/tuulbelt/actions/workflows/test-all-tools.yml)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![Uses semats](https://img.shields.io/badge/uses-semats-blue)
![Tests](https://img.shields.io/badge/tests-56%20passing-success)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Concurrent test port allocation — avoid port conflicts in parallel tests.

> **Library Composition**: This tool uses [file-based-semaphore-ts](../file-based-semaphore-ts/) for atomic registry access, following [PRINCIPLES.md Exception 2](../PRINCIPLES.md). Since all Tuulbelt tools have zero external dependencies, composing them preserves the zero-dep guarantee.

## Problem

Running tests in parallel often causes "port already in use" errors:

```
Error: listen EADDRINUSE: address already in use :::3000
```

This happens because:
- Multiple test files try to use the same hardcoded ports
- Tests don't know which ports other tests are using
- Random port selection can still collide under high parallelism

**portres** solves this by providing a centralized port registry:
- Each test requests a port from the registry
- The registry ensures ports are unique across all processes
- Ports are automatically released when processes exit

## Features

- **Zero external dependencies** — Uses only Node.js standard library + Tuulbelt tools
- **File-based registry** — Survives process restarts
- **Stale entry cleanup** — Automatically removes dead process entries
- **Semaphore-protected registry** — Atomic access via [semats](../file-based-semaphore-ts/)
- **Result pattern** — Clear error handling without exceptions
- **CLI and library API** — Use from shell or TypeScript

## Installation

Clone the repository:

```bash
git clone https://github.com/tuulbelt/tuulbelt.git
cd tuulbelt/test-port-resolver
npm install  # Installs dev dependencies + links sibling semats
```

**Zero external dependencies** — uses only Node.js standard library and [file-based-semaphore-ts](../file-based-semaphore-ts/) (a Tuulbelt tool with zero external deps).

**CLI names** — both short and long forms work:
- Short (recommended): `portres`
- Long: `test-port-resolver`

**Recommended setup** — install globally for easy access:

```bash
npm link  # Enable the 'portres' command globally
portres --help
```

For local development without global install:

```bash
npx tsx src/index.ts --help
```

## Usage

### As a Library

```typescript
import { PortResolver } from './src/index.ts';

const resolver = new PortResolver();

// Get a single port
const result = await resolver.get({ tag: 'my-test-server' });
if (result.ok) {
  console.log(`Using port: ${result.value.port}`);

  // Start your server on result.value.port

  // Release when done
  await resolver.release(result.value.port);
}

// Get multiple ports at once
const ports = await resolver.getMultiple(3);
if (ports.ok) {
  console.log(`Got ports: ${ports.value.map(p => p.port).join(', ')}`);
}

// Release all ports at end of test suite
await resolver.releaseAll();
```

### As a CLI

Using short name (recommended after `npm link`):

```bash
# Get one available port
portres get
# 51234

# Get 3 ports at once
portres get -n 3
# 51234
# 51235
# 51236

# Get port with tag (for identification)
portres get -t my-server --json
# {"port":51234,"tag":"my-server"}

# Release a port
portres release 51234

# Release all ports for current process
portres release-all

# List all allocations
portres list
# Port     PID     Tag             Timestamp
# 51234    12345   my-server       2025-12-29T01:00:00.000Z

# Show registry status
portres status
# Registry Status:
#   Total entries: 1
#   Active entries: 1
#   Stale entries: 0
#   Owned by this process: 1
#   Port range: 49152-65535

# Clean stale entries (dead processes)
portres clean

# Clear entire registry
portres clear
```

## API

### `PortResolver`

Main class for port allocation.

```typescript
const resolver = new PortResolver({
  minPort: 49152,           // Minimum port (default: 49152)
  maxPort: 65535,           // Maximum port (default: 65535)
  registryDir: '~/.portres', // Registry directory
  allowPrivileged: false,   // Allow ports < 1024
  maxPortsPerRequest: 100,  // Max ports per getMultiple()
  maxRegistrySize: 1000,    // Max total entries
  staleTimeout: 3600000,    // Stale entry timeout (1 hour)
});
```

### Methods

| Method | Description |
|--------|-------------|
| `get(options?)` | Get a single available port |
| `getMultiple(count, options?)` | Get multiple ports at once |
| `release(port)` | Release a specific port |
| `releaseAll()` | Release all ports owned by this process |
| `list()` | List all port allocations |
| `clean()` | Remove stale entries |
| `status()` | Get registry status |
| `clear()` | Clear entire registry |

### `isPortAvailable(port, host?)`

Check if a port is available by attempting to bind to it.

```typescript
const available = await isPortAvailable(3000);
if (available) {
  // Port 3000 is free to use
}
```

## Examples

See the `examples/` directory for runnable examples:

```bash
npx tsx examples/basic.ts     # Basic usage
npx tsx examples/advanced.ts  # Advanced patterns
```

## Testing

```bash
npm test              # Run all tests (56 tests)
npm test -- --watch   # Watch mode
```

## Library Composition

**portres** uses [file-based-semaphore-ts](../file-based-semaphore-ts/) (`semats`) as a library dependency for atomic registry access. This follows [PRINCIPLES.md Exception 2](../PRINCIPLES.md) — Tuulbelt tools can compose other Tuulbelt tools since they all have zero external dependencies.

The semaphore ensures that concurrent port allocations from multiple processes never corrupt the registry file, even under high parallelism.

## Error Handling

All methods return Result types:

```typescript
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };
```

Exit codes:
- `0` — Success
- `1` — Error (invalid input, no ports available, etc.)

## Security

- **Port range validation** — Prevents allocation outside configured range
- **Privileged port protection** — Ports < 1024 require explicit `--allow-privileged`
- **Path traversal prevention** — Registry paths are validated
- **Tag sanitization** — Control characters removed from tags
- **Registry size limits** — Prevents resource exhaustion
- **Secure file permissions** — Registry files created with mode 0600/0700

## Dogfooding

This tool integrates with Tuulbelt's dogfooding strategy:

```bash
# Validate test reliability (local development)
./scripts/dogfood-flaky.sh 10

# Validate output determinism
./scripts/dogfood-diff.sh
```

See [DOGFOODING_STRATEGY.md](./DOGFOODING_STRATEGY.md) for the full composition strategy.

## Demo

![Demo](docs/demo.gif)

**[▶ View interactive recording on asciinema.org](#)**

<div>
  <span style="display: inline-block; vertical-align: middle; margin-right: 8px;"><strong>Try it online:</strong></span>
  <a href="https://stackblitz.com/github/tuulbelt/tuulbelt/tree/main/test-port-resolver" style="display: inline-block; vertical-align: middle;">
    <img src="https://developer.stackblitz.com/img/open_in_stackblitz.svg" alt="Open in StackBlitz" style="vertical-align: middle;">
  </a>
</div>

> Demos are automatically generated and embedded via GitHub Actions when demo scripts are updated.

## License

MIT — see [LICENSE](LICENSE)

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

## Related Tools

Part of the [Tuulbelt](https://github.com/tuulbelt/tuulbelt) collection:
- [File-Based Semaphore (TS)](../file-based-semaphore-ts/) — Cross-platform process locking
- [Test Flakiness Detector](../test-flakiness-detector/) — Detect unreliable tests
- [CLI Progress Reporting](../cli-progress-reporting/) — Concurrent-safe progress updates
- More tools at [tuulbelt.github.io](https://tuulbelt.github.io/tuulbelt/)
