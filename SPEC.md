# Port Resolver Specification

## Overview

Concurrent test port allocation tool that prevents port conflicts in parallel tests using a file-based registry with semaphore-based atomic access.

## Problem

Parallel test suites need isolated network ports but face conflicts:
- **Race conditions:** Multiple tests allocate the same port simultaneously
- **Hard-coded ports:** Tests use fixed ports (8080, 3000) causing collisions
- **Random allocation:** `Math.floor(Math.random() * 10000) + 50000` still risks conflicts
- **Cross-process coordination:** No built-in way to share port allocation state

Existing solutions:
- **Manual assignment:** Error-prone, doesn't scale
- **Port scanners:** Slow, still have race conditions
- **In-memory registries:** Don't work across processes

## Design Goals

1. **Concurrent-safe** — Atomic allocation using file-based semaphore (semats)
2. **Zero external dependencies** — Uses Node stdlib + Tuulbelt tools only
3. **Cross-process** — Works for parallel test runs (Jest --maxWorkers, Mocha --parallel)
4. **Deterministic** — Given state, same allocation every time
5. **Type-safe** — Full TypeScript with strict mode
6. **Composable** — Works as library, CLI, and module-level API

## Architecture

### Registry File Format

**Location:** `~/.portres/registry.json` (configurable)

**Structure:**
```json
{
  "version": 1,
  "entries": [
    {
      "port": 50123,
      "pid": 12345,
      "timestamp": 1704899876543,
      "tag": "api-server"
    },
    {
      "port": 50124,
      "pid": 12346,
      "timestamp": 1704899877123
    }
  ]
}
```

**Fields:**
- `version` (number): Registry format version (currently 1)
- `entries` (array): List of port allocations
  - `port` (number): Allocated port (1-65535)
  - `pid` (number): Process ID that allocated the port
  - `timestamp` (number): Unix timestamp in milliseconds
  - `tag` (string, optional): User-provided label

### Concurrency Control

**Semaphore Integration:**
- Uses `@tuulbelt/file-based-semaphore-ts` for atomic registry access
- Lock file: `~/.portres/registry.lock`
- Timeout: 5 seconds
- Tag: `portres`

**Lock Acquisition:**
```typescript
const semaphore = new Semaphore(lockPath);
const result = await semaphore.acquire({ timeout: 5000, tag: 'portres' });
// ... perform registry operations ...
semaphore.release();
```

**Critical Sections:**
- Reading + writing registry
- Allocating ports
- Releasing ports
- Cleaning stale entries

## API Reference

### PortResolver Class

#### Constructor

```typescript
constructor(config?: Partial<PortConfig>)
```

**Config:**
```typescript
interface PortConfig {
  minPort: number;           // Default: 49152 (start of dynamic range)
  maxPort: number;           // Default: 65535
  registryDir: string;       // Default: ~/.portres/
  allowPrivileged: boolean;  // Default: false
  maxPortsPerRequest: number; // Default: 100
  maxRegistrySize: number;   // Default: 1000
  staleTimeout: number;      // Default: 3600000 (1 hour)
  verbose: boolean;          // Default: false
}
```

#### Methods

**1. Single Port Allocation**

```typescript
async get(options?: { tag?: string }): Promise<Result<PortAllocation>>
```

Algorithm:
1. Acquire lock
2. Read registry
3. Filter stale entries (timestamp > staleTimeout)
4. Get allocated ports Set
5. Find available port in range (check network availability)
6. Add entry to registry
7. Write registry
8. Release lock

**2. Batch Allocation**

```typescript
async getMultiple(count: number, options?: { tag?: string }): Promise<Result<PortAllocation[]>>
```

Algorithm:
1. Validate count (1 ≤ count ≤ maxPortsPerRequest)
2. Acquire lock
3. Read registry
4. Clean stale entries
5. Check registry size limit
6. For each port (1..count):
   - Find available port
   - Add to allocated set
   - Add entry to registry
   - Add to allocations array
7. On ANY failure:
   - Rollback: remove all entries for this PID from this batch
   - Return error
8. Write registry (atomic all-or-nothing)
9. Release lock

**Rollback Semantics:**
If the 3rd port allocation fails (e.g., no available ports), the first 2 ports are **not** allocated.

**3. Range Reservation**

```typescript
async reserveRange(options: { start: number; count: number; tag?: string }): Promise<Result<PortAllocation[]>>
```

Algorithm:
1. Validate start port and count
2. Validate range doesn't exceed 65535
3. Acquire lock
4. Read registry
5. Clean stale entries
6. Check all ports in range [start, start+count-1]:
   - Not in registry
   - Actually available on network
7. If ANY port unavailable: fail immediately (no partial allocation)
8. Allocate all ports in range
9. Write registry
10. Release lock

**Example:**
```typescript
await resolver.reserveRange({ start: 50000, count: 5 });
// Allocates: 50000, 50001, 50002, 50003, 50004 (contiguous)
```

**4. Get Port In Range**

```typescript
async getPortInRange(options: { min: number; max: number; tag?: string }): Promise<Result<PortAllocation>>
```

Algorithm:
1. Validate min ≤ max
2. Acquire lock
3. Read registry
4. Clean stale entries
5. Create custom config with minPort=min, maxPort=max
6. Find available port using findAvailablePort(customConfig)
7. Add entry to registry
8. Write registry
9. Release lock

**5. Release Port**

```typescript
async release(port: number): Promise<Result<void>>
```

Algorithm:
1. Validate port number
2. Acquire lock
3. Read registry
4. Find entry with matching port and current PID
5. If not found: error (port not registered or owned by different process)
6. Remove entry from registry
7. Write registry
8. Release lock

**6. Release All**

```typescript
async releaseAll(): Promise<Result<number>>
```

Algorithm:
1. Acquire lock
2. Read registry
3. Filter entries where PID = current process
4. Remove all matching entries
5. Write registry
6. Release lock
7. Return count of released ports

**7. List Allocations**

```typescript
async list(): Promise<Result<PortEntry[]>>
```

Read-only operation (still acquires lock for consistency).

**8. Clean Stale Entries**

```typescript
async clean(): Promise<Result<number>>
```

Algorithm:
1. Acquire lock
2. Read registry
3. Filter entries: keep if (Date.now() - timestamp) < staleTimeout
4. Write registry with active entries only
5. Release lock
6. Return count of cleaned entries

**9. Registry Status**

```typescript
async status(): Promise<Result<RegistryStatus>>
```

Returns:
```typescript
interface RegistryStatus {
  totalEntries: number;
  activeEntries: number;
  staleEntries: number;
  ownedByCurrentProcess: number;
  portRange: { min: number; max: number };
}
```

**10. Clear Registry**

```typescript
async clear(): Promise<Result<void>>
```

Wipes entire registry (use with caution).

### Module-Level Convenience APIs

**1. getPort()**

```typescript
export async function getPort(options?: { tag?: string; config?: Partial<PortConfig> }): Promise<Result<PortAllocation>>
```

Convenience wrapper around `new PortResolver(config).get()`.

**2. getPorts()**

```typescript
export async function getPorts(
  count: number,
  options?: { tags?: string[]; tag?: string; config?: Partial<PortConfig> }
): Promise<Result<PortAllocation[]>>
```

Batch allocation with two modes:

**Mode 1: Single tag for all ports (atomic)**
```typescript
const result = await getPorts(3, { tag: 'cluster' });
// All 3 ports get tag 'cluster'
```

**Mode 2: Individual tags per port (with rollback)**
```typescript
const result = await getPorts(3, { tags: ['http', 'grpc', 'metrics'] });
// Port 1 gets 'http', Port 2 gets 'grpc', Port 3 gets 'metrics'
// If ANY allocation fails, ALL previous allocations are rolled back
```

Rollback algorithm:
1. For each tag in tags array:
   - Allocate port with that tag
   - If allocation fails:
     - Release all previously allocated ports (in reverse order)
     - Return error
2. Return all allocations

### PortManager Class

Lifecycle management for port allocations:

```typescript
export class PortManager {
  async allocate(tag?: string): Promise<Result<PortAllocation>>
  async allocateMultiple(count: number, tag?: string): Promise<Result<PortAllocation[]>>
  async release(tagOrPort: string | number): Promise<Result<void>>
  async releaseAll(): Promise<Result<number>>
  getAllocations(): PortAllocation[]
  get(tag: string): PortAllocation | undefined
}
```

**Tracking:**
- In-memory Map<string, PortAllocation>
- Key: tag or `port-${port}`
- Enables release by tag instead of port number

**Example:**
```typescript
const manager = new PortManager();
await manager.allocate('api');
await manager.allocate('db');
const alloc = manager.get('api');  // { port: 50123, tag: 'api' }
await manager.releaseAll();  // Releases both api and db
```

## CLI Interface

### Commands

```bash
portres get [-n <count>] [-t <tag>] [--json]
portres reserve-range -p <start> -n <count> [-t <tag>]
portres get-in-range --min-port <min> --max-port <max> [-t <tag>]
portres release <port>
portres release-all
portres list [--json]
portres clean
portres status [--json]
portres clear
```

### Examples

```bash
# Get one port
portres get
# Output: 50123

# Get 3 ports with JSON output
portres get -n 3 --json
# Output: [{"port":50123},{"port":50124},{"port":50125}]

# Reserve contiguous range
portres reserve-range -p 50000 -n 5 -t cluster
# Allocates: 50000, 50001, 50002, 50003, 50004

# Get port in specific range
portres get-in-range --min-port 50000 --max-port 50100
# Output: 50042 (any available port in range)

# Release specific port
portres release 50123

# List all allocations
portres list
# Output:
# Port    PID     Tag     Timestamp
# 50123   12345   api     2024-01-10T12:34:56.789Z
# 50124   12346   db      2024-01-10T12:35:01.234Z

# Clean stale entries
portres clean
# Output: Cleaned 5 stale entries

# Show registry status
portres status
# Output:
# Registry Status:
#   Total entries: 10
#   Active entries: 8
#   Stale entries: 2
#   Owned by this process: 3
#   Port range: 49152-65535
```

## Performance

### Time Complexity

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| get() | O(n) | n = registry size, due to findAvailablePort scan |
| getMultiple(k) | O(k × n) | Allocates k ports, each scans registry |
| reserveRange(k) | O(k) | Validates k ports (no registry scan) |
| release() | O(n) | Linear search for port entry |
| releaseAll() | O(n) | Filter by PID |
| list() | O(n) | Read all entries |
| clean() | O(n) | Filter by timestamp |

### Space Complexity

- Registry size: O(m) where m = number of allocations
- Lock overhead: O(1) (semaphore uses single lock file)
- Max registry size: 1000 entries (configurable)

### Concurrency

- Lock acquisition: 5-second timeout
- Lock granularity: Entire registry (no fine-grained locks)
- Expected contention: Low (tests typically allocate then run, not continuous allocation)

## Security

### Path Traversal Prevention

```typescript
const DANGEROUS_PATH_PATTERNS = ['..', '\x00'];

function validatePath(path: string): Result<string> {
  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (path.includes(pattern)) {
      return { ok: false, error: new Error(`Invalid path: contains dangerous pattern "${pattern}"`) };
    }
  }
  const normalized = normalize(resolve(path));
  return { ok: true, value: normalized };
}
```

### Tag Sanitization

```typescript
const TAG_CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
const MAX_TAG_LENGTH = 256;

function sanitizeTag(tag?: string): string | undefined {
  if (!tag) return undefined;
  const sanitized = tag.replace(TAG_CONTROL_CHARS, '').slice(0, MAX_TAG_LENGTH);
  return sanitized || undefined;
}
```

Prevents:
- Newline injection in registry
- Control character exploits
- Denial of service via huge tags

### Privileged Port Protection

Ports < 1024 require explicit `allowPrivileged: true` flag to prevent accidental usage (requires root on Unix systems).

### Registry Size Limits

- Max entries: 1000 (prevents unbounded growth)
- Max ports per request: 100 (prevents memory exhaustion)

### File Permissions

Registry directory created with `mode: 0o700` (user-only access).

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty registry | Returns any available port in range |
| Registry full (1000 entries) | Returns error: "Registry size limit exceeded" |
| No available ports | Returns error: "No available ports in range" |
| Port in use (network) | Skips to next port |
| Port allocated by different process | Cannot release (error) |
| Stale entries (>1 hour old) | Automatically cleaned before allocation |
| Corrupted registry JSON | Treats as empty registry (graceful recovery) |
| Lock timeout (>5 seconds) | Returns error: "Failed to acquire lock" |
| Range exhaustion (e.g., 50000-50002 all taken) | get-in-range fails immediately |
| Partial range available (e.g., 50001 taken but 50000, 50002 free) | reserve-range fails (requires all ports free) |

## Future Extensions

### v0.3.0 (Potential)

- **TTL per allocation:** Custom timeout per entry instead of global staleTimeout
- **Watch mode:** Subscribe to allocation events
- **Health check API:** `GET /health` endpoint for service monitoring
- **Persistence cleanup:** Automatic cleanup on process exit (signal handlers)

### Non-Goals

- **In-memory registry:** Would lose cross-process coordination
- **Network-based coordination:** Adds complexity and dependencies
- **Port recycling:** OS handles this, we just track logical ownership

## Changelog

### v0.2.0 (In Progress)

- Added `getPort()` and `getPorts()` convenience functions
- Added `PortManager` class for lifecycle management
- Added `reserveRange()` for contiguous port allocation
- Added `getPortInRange()` for bounded port allocation
- Added CLI commands: `reserve-range`, `get-in-range`
- Expanded test suite: 125 tests (79 baseline + 27 new APIs + 19 range)

### v0.1.0

- Initial release
- Core PortResolver class with get/release/list/clean/status/clear
- File-based registry with semaphore integration
- CLI interface with 7 commands
- 79 tests including concurrent, cross-process, security, stress
