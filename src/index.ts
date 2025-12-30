#!/usr/bin/env -S npx tsx
/**
 * Test Port Resolver / portres
 *
 * Concurrent test port allocation - avoid port conflicts in parallel tests.
 * Uses file-based registry with semaphore integration for atomic access.
 *
 * Part of the Tuulbelt collection: https://github.com/tuulbelt
 */

import { createServer, type Server } from 'node:net';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, realpathSync } from 'node:fs';
import { join, resolve, normalize } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

// Tuulbelt tool composition - semats for atomic registry access (PRINCIPLES.md Exception 2)
import { Semaphore } from '@tuulbelt/file-based-semaphore-ts';

// ============================================================================
// Types
// ============================================================================

/** Result type for operations that can fail */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Port allocation configuration */
export interface PortConfig {
  /** Minimum port number (default: 49152 - start of dynamic/private range) */
  minPort: number;
  /** Maximum port number (default: 65535) */
  maxPort: number;
  /** Registry directory path (default: ~/.portres/) */
  registryDir: string;
  /** Allow privileged ports (< 1024) - requires explicit opt-in */
  allowPrivileged: boolean;
  /** Maximum ports per request (default: 100) */
  maxPortsPerRequest: number;
  /** Maximum registry entries (default: 1000) */
  maxRegistrySize: number;
  /** Stale entry timeout in ms (default: 1 hour) */
  staleTimeout: number;
  /** Verbose output */
  verbose: boolean;
}

/** Default configuration */
export const DEFAULT_CONFIG: PortConfig = {
  minPort: 49152,
  maxPort: 65535,
  registryDir: join(homedir(), '.portres'),
  allowPrivileged: false,
  maxPortsPerRequest: 100,
  maxRegistrySize: 1000,
  staleTimeout: 60 * 60 * 1000, // 1 hour
  verbose: false,
};

/** Port allocation entry */
export interface PortEntry {
  port: number;
  pid: number;
  timestamp: number;
  tag?: string;
}

/** Port registry */
export interface PortRegistry {
  version: number;
  entries: PortEntry[];
}

/** Port allocation result */
export interface PortAllocation {
  port: number;
  tag?: string;
}

/** Registry status */
export interface RegistryStatus {
  totalEntries: number;
  activeEntries: number;
  staleEntries: number;
  ownedByCurrentProcess: number;
  portRange: { min: number; max: number };
}

// ============================================================================
// Path Validation
// ============================================================================

const DANGEROUS_PATH_PATTERNS = ['..', '\x00'];

/** Characters to remove from tags (control chars, newlines) */
const TAG_CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/** Maximum tag length */
const MAX_TAG_LENGTH = 256;

/**
 * Sanitize a tag string for safe storage
 */
function sanitizeTag(tag: string | undefined): string | undefined {
  if (tag === undefined || tag === '') {
    return undefined;
  }

  // Remove control characters (prevents registry file injection)
  let sanitized = tag.replace(TAG_CONTROL_CHARS, '');

  // Truncate to max length
  if (sanitized.length > MAX_TAG_LENGTH) {
    sanitized = sanitized.slice(0, MAX_TAG_LENGTH);
  }

  return sanitized || undefined;
}

/**
 * Validate a path for security issues
 */
function validatePath(pathStr: string): Result<string> {
  // Check for dangerous patterns before normalization
  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (pathStr.includes(pattern)) {
      return { ok: false, error: new Error(`Invalid path: contains dangerous pattern "${pattern}"`) };
    }
  }

  const normalized = normalize(resolve(pathStr));

  // Check again after normalization
  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (normalized.includes(pattern)) {
      return { ok: false, error: new Error(`Invalid path after normalization`) };
    }
  }

  return { ok: true, value: normalized };
}

// ============================================================================
// Port Availability Check
// ============================================================================

/**
 * Check if a port is available by attempting to bind to it
 */
export function isPortAvailable(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server: Server = createServer();

    server.once('error', () => {
      resolvePromise(false);
    });

    server.once('listening', () => {
      server.close(() => {
        resolvePromise(true);
      });
    });

    server.listen(port, host);
  });
}

/**
 * Find an available port in the given range
 */
export async function findAvailablePort(
  config: PortConfig,
  exclude: Set<number> = new Set()
): Promise<Result<number>> {
  const { minPort, maxPort, allowPrivileged } = config;

  // Validate port range
  const effectiveMin = allowPrivileged ? Math.max(1, minPort) : Math.max(1024, minPort);
  const effectiveMax = Math.min(65535, maxPort);

  if (effectiveMin > effectiveMax) {
    return { ok: false, error: new Error(`Invalid port range: ${effectiveMin}-${effectiveMax}`) };
  }

  // Try random ports first (faster for sparse ranges)
  const rangeSize = effectiveMax - effectiveMin + 1;
  const maxAttempts = Math.min(rangeSize, 100);

  for (let i = 0; i < maxAttempts; i++) {
    const port = effectiveMin + Math.floor(Math.random() * rangeSize);
    if (!exclude.has(port) && await isPortAvailable(port)) {
      return { ok: true, value: port };
    }
  }

  // Fall back to sequential scan
  for (let port = effectiveMin; port <= effectiveMax; port++) {
    if (!exclude.has(port) && await isPortAvailable(port)) {
      return { ok: true, value: port };
    }
  }

  return { ok: false, error: new Error('No available ports in range') };
}

// ============================================================================
// Registry Management
// ============================================================================

const REGISTRY_VERSION = 1;
const REGISTRY_FILE = 'registry.json';
const LOCK_FILE = 'registry.lock';

/**
 * Get the registry file path
 */
function getRegistryPath(config: PortConfig): Result<string> {
  const pathResult = validatePath(config.registryDir);
  if (!pathResult.ok) {
    return pathResult;
  }
  return { ok: true, value: join(pathResult.value, REGISTRY_FILE) };
}

/**
 * Get the lock file path
 */
function getLockPath(config: PortConfig): Result<string> {
  const pathResult = validatePath(config.registryDir);
  if (!pathResult.ok) {
    return pathResult;
  }
  return { ok: true, value: join(pathResult.value, LOCK_FILE) };
}

/**
 * Ensure registry directory exists with secure permissions
 */
function ensureRegistryDir(config: PortConfig): Result<void> {
  const pathResult = validatePath(config.registryDir);
  if (!pathResult.ok) {
    return { ok: false, error: pathResult.error };
  }

  try {
    if (!existsSync(pathResult.value)) {
      mkdirSync(pathResult.value, { recursive: true, mode: 0o700 });
    }
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: err as Error };
  }
}

/**
 * Read the registry file
 */
function readRegistry(config: PortConfig): Result<PortRegistry> {
  const pathResult = getRegistryPath(config);
  if (!pathResult.ok) {
    return { ok: false, error: pathResult.error };
  }

  const registryPath = pathResult.value;

  if (!existsSync(registryPath)) {
    return { ok: true, value: { version: REGISTRY_VERSION, entries: [] } };
  }

  try {
    const content = readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(content) as PortRegistry;

    // Validate registry structure - recover gracefully from invalid structure
    if (typeof registry.version !== 'number' || !Array.isArray(registry.entries)) {
      // Treat invalid structure as empty registry (graceful recovery)
      return { ok: true, value: { version: REGISTRY_VERSION, entries: [] } };
    }

    return { ok: true, value: registry };
  } catch {
    // If corrupted JSON, return empty registry (graceful recovery)
    return { ok: true, value: { version: REGISTRY_VERSION, entries: [] } };
  }
}

/**
 * Write the registry file with secure permissions
 */
function writeRegistry(config: PortConfig, registry: PortRegistry): Result<void> {
  const dirResult = ensureRegistryDir(config);
  if (!dirResult.ok) {
    return { ok: false, error: dirResult.error };
  }

  const pathResult = getRegistryPath(config);
  if (!pathResult.ok) {
    return { ok: false, error: pathResult.error };
  }

  try {
    const tempPath = `${pathResult.value}.${randomBytes(8).toString('hex')}.tmp`;
    writeFileSync(tempPath, JSON.stringify(registry, null, 2), { mode: 0o600 });

    // Atomic rename
    renameSync(tempPath, pathResult.value);

    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: err as Error };
  }
}

/**
 * Check if a process is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Filter out stale entries from the registry
 */
function filterStaleEntries(entries: PortEntry[], staleTimeout: number): { active: PortEntry[]; stale: PortEntry[] } {
  const now = Date.now();
  const active: PortEntry[] = [];
  const stale: PortEntry[] = [];

  for (const entry of entries) {
    const isStale = !isProcessRunning(entry.pid) || (now - entry.timestamp > staleTimeout);
    if (isStale) {
      stale.push(entry);
    } else {
      active.push(entry);
    }
  }

  return { active, stale };
}

// ============================================================================
// Port Resolver Class
// ============================================================================

export class PortResolver {
  private config: PortConfig;

  constructor(config: Partial<PortConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Validate configuration
    if (this.config.minPort < 1 || this.config.minPort > 65535) {
      throw new Error('minPort must be between 1 and 65535');
    }
    if (this.config.maxPort < 1 || this.config.maxPort > 65535) {
      throw new Error('maxPort must be between 1 and 65535');
    }
    if (this.config.minPort > this.config.maxPort) {
      throw new Error('minPort must be less than or equal to maxPort');
    }
    if (!this.config.allowPrivileged && this.config.minPort < 1024) {
      this.config.minPort = 1024;
    }
  }

  /**
   * Acquire a lock on the registry using semats.
   * This ensures atomic access to the port registry across processes.
   */
  private async acquireLock(): Promise<{ release: () => void }> {
    const lockPathResult = getLockPath(this.config);
    if (!lockPathResult.ok) {
      throw new Error(`Failed to get lock path: ${lockPathResult.error.message}`);
    }

    const dirResult = ensureRegistryDir(this.config);
    if (!dirResult.ok) {
      throw new Error(`Failed to ensure registry directory: ${dirResult.error.message}`);
    }

    const semaphore = new Semaphore(lockPathResult.value);
    const result = await semaphore.acquire({ timeout: 5000, tag: 'portres' });

    if (!result.ok) {
      throw new Error(`Failed to acquire lock: ${result.error.message}`);
    }

    return { release: () => semaphore.release() };
  }

  /**
   * Get a single available port
   */
  async get(options: { tag?: string } = {}): Promise<Result<PortAllocation>> {
    const result = await this.getMultiple(1, options);
    if (!result.ok) {
      return result;
    }
    const first = result.value[0];
    if (!first) {
      return { ok: false, error: new Error('No ports allocated') };
    }
    return { ok: true, value: first };
  }

  /**
   * Get multiple available ports
   */
  async getMultiple(count: number, options: { tag?: string } = {}): Promise<Result<PortAllocation[]>> {
    // Validate count
    if (count < 1) {
      return { ok: false, error: new Error('Count must be at least 1') };
    }
    if (count > this.config.maxPortsPerRequest) {
      return { ok: false, error: new Error(`Count exceeds maximum (${this.config.maxPortsPerRequest})`) };
    }

    const lock = await this.acquireLock();

    try {
      // Read registry
      const registryResult = readRegistry(this.config);
      if (!registryResult.ok) {
        return { ok: false, error: registryResult.error };
      }

      const registry = registryResult.value;

      // Clean stale entries
      const { active } = filterStaleEntries(registry.entries, this.config.staleTimeout);
      registry.entries = active;

      // Check registry size limit
      if (registry.entries.length + count > this.config.maxRegistrySize) {
        return { ok: false, error: new Error('Registry size limit exceeded') };
      }

      // Get already allocated ports
      const allocatedPorts = new Set(registry.entries.map(e => e.port));

      // Find available ports
      const allocations: PortAllocation[] = [];
      const pid = process.pid;
      const timestamp = Date.now();

      for (let i = 0; i < count; i++) {
        const portResult = await findAvailablePort(this.config, allocatedPorts);
        if (!portResult.ok) {
          // Rollback allocations
          for (const alloc of allocations) {
            const idx = registry.entries.findIndex(e => e.port === alloc.port && e.pid === pid);
            if (idx !== -1) {
              registry.entries.splice(idx, 1);
            }
          }
          return { ok: false, error: portResult.error };
        }

        const port = portResult.value;
        allocatedPorts.add(port);

        // Sanitize tag to prevent registry injection
        const safeTag = sanitizeTag(options.tag);
        const entry: PortEntry = { port, pid, timestamp, tag: safeTag };
        registry.entries.push(entry);
        allocations.push({ port, tag: safeTag });
      }

      // Write registry
      const writeResult = writeRegistry(this.config, registry);
      if (!writeResult.ok) {
        return { ok: false, error: writeResult.error };
      }

      return { ok: true, value: allocations };
    } finally {
      lock.release();
    }
  }

  /**
   * Release a port
   */
  async release(port: number): Promise<Result<void>> {
    // Validate port
    if (port < 1 || port > 65535) {
      return { ok: false, error: new Error('Invalid port number') };
    }

    const lock = await this.acquireLock();

    try {
      const registryResult = readRegistry(this.config);
      if (!registryResult.ok) {
        return { ok: false, error: registryResult.error };
      }

      const registry = registryResult.value;
      const pid = process.pid;

      // Find and remove the entry
      const idx = registry.entries.findIndex(e => e.port === port && e.pid === pid);
      if (idx === -1) {
        // Check if port is owned by another process
        const otherEntry = registry.entries.find(e => e.port === port);
        if (otherEntry) {
          return { ok: false, error: new Error(`Port ${port} is owned by another process (PID: ${otherEntry.pid})`) };
        }
        return { ok: false, error: new Error(`Port ${port} is not registered`) };
      }

      registry.entries.splice(idx, 1);

      const writeResult = writeRegistry(this.config, registry);
      if (!writeResult.ok) {
        return { ok: false, error: writeResult.error };
      }

      return { ok: true, value: undefined };
    } finally {
      lock.release();
    }
  }

  /**
   * Release all ports owned by the current process
   */
  async releaseAll(): Promise<Result<number>> {
    const lock = await this.acquireLock();

    try {
      const registryResult = readRegistry(this.config);
      if (!registryResult.ok) {
        return { ok: false, error: registryResult.error };
      }

      const registry = registryResult.value;
      const pid = process.pid;

      const before = registry.entries.length;
      registry.entries = registry.entries.filter(e => e.pid !== pid);
      const released = before - registry.entries.length;

      const writeResult = writeRegistry(this.config, registry);
      if (!writeResult.ok) {
        return { ok: false, error: writeResult.error };
      }

      return { ok: true, value: released };
    } finally {
      lock.release();
    }
  }

  /**
   * List all port allocations
   */
  async list(): Promise<Result<PortEntry[]>> {
    const lock = await this.acquireLock();

    try {
      const registryResult = readRegistry(this.config);
      if (!registryResult.ok) {
        return { ok: false, error: registryResult.error };
      }

      return { ok: true, value: registryResult.value.entries };
    } finally {
      lock.release();
    }
  }

  /**
   * Clean stale entries from the registry
   */
  async clean(): Promise<Result<number>> {
    const lock = await this.acquireLock();

    try {
      const registryResult = readRegistry(this.config);
      if (!registryResult.ok) {
        return { ok: false, error: registryResult.error };
      }

      const registry = registryResult.value;
      const { active, stale } = filterStaleEntries(registry.entries, this.config.staleTimeout);

      registry.entries = active;

      const writeResult = writeRegistry(this.config, registry);
      if (!writeResult.ok) {
        return { ok: false, error: writeResult.error };
      }

      return { ok: true, value: stale.length };
    } finally {
      lock.release();
    }
  }

  /**
   * Get registry status
   */
  async status(): Promise<Result<RegistryStatus>> {
    const lock = await this.acquireLock();

    try {
      const registryResult = readRegistry(this.config);
      if (!registryResult.ok) {
        return { ok: false, error: registryResult.error };
      }

      const registry = registryResult.value;
      const { active, stale } = filterStaleEntries(registry.entries, this.config.staleTimeout);
      const pid = process.pid;

      const status: RegistryStatus = {
        totalEntries: registry.entries.length,
        activeEntries: active.length,
        staleEntries: stale.length,
        ownedByCurrentProcess: registry.entries.filter(e => e.pid === pid).length,
        portRange: { min: this.config.minPort, max: this.config.maxPort },
      };

      return { ok: true, value: status };
    } finally {
      lock.release();
    }
  }

  /**
   * Clear the entire registry
   */
  async clear(): Promise<Result<void>> {
    const lock = await this.acquireLock();

    try {
      const registry: PortRegistry = { version: REGISTRY_VERSION, entries: [] };

      const writeResult = writeRegistry(this.config, registry);
      if (!writeResult.ok) {
        return { ok: false, error: writeResult.error };
      }

      return { ok: true, value: undefined };
    } finally {
      lock.release();
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(args: string[]): {
  command: string;
  port?: number;
  count?: number;
  tag?: string;
  json?: boolean;
  verbose?: boolean;
  minPort?: number;
  maxPort?: number;
  registryDir?: string;
  allowPrivileged?: boolean;
  help?: boolean;
  version?: boolean;
} {
  const result: ReturnType<typeof parseArgs> = { command: '' };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--version' || arg === '-V') {
      result.version = true;
    } else if (arg === '--json' || arg === '-j') {
      result.json = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--allow-privileged') {
      result.allowPrivileged = true;
    } else if ((arg === '--port' || arg === '-p') && next) {
      result.port = parseInt(next, 10);
      i++;
    } else if ((arg === '--count' || arg === '-n') && next) {
      result.count = parseInt(next, 10);
      i++;
    } else if ((arg === '--tag' || arg === '-t') && next) {
      result.tag = next;
      i++;
    } else if (arg === '--min-port' && next) {
      result.minPort = parseInt(next, 10);
      i++;
    } else if (arg === '--max-port' && next) {
      result.maxPort = parseInt(next, 10);
      i++;
    } else if ((arg === '--registry-dir' || arg === '-d') && next) {
      result.registryDir = next;
      i++;
    } else if (!arg?.startsWith('-') && !result.command) {
      result.command = arg ?? '';
    } else if (!arg?.startsWith('-') && result.command === 'release' && !result.port) {
      result.port = parseInt(arg ?? '', 10);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Test Port Resolver / portres v0.1.0

Concurrent test port allocation - avoid port conflicts in parallel tests.

USAGE:
  portres <command> [options]

COMMANDS:
  get           Get an available port
  release <port> Release a previously allocated port
  release-all   Release all ports owned by current process
  list          List all port allocations
  clean         Remove stale entries from registry
  status        Show registry status
  clear         Clear the entire registry

OPTIONS:
  -n, --count <n>       Number of ports to allocate (default: 1)
  -t, --tag <tag>       Tag for the allocation
  -p, --port <port>     Port number (for release)
  -j, --json            Output in JSON format
  -v, --verbose         Verbose output
  --min-port <port>     Minimum port number (default: 49152)
  --max-port <port>     Maximum port number (default: 65535)
  -d, --registry-dir <dir>  Registry directory (default: ~/.portres/)
  --allow-privileged    Allow ports < 1024 (requires root)
  -h, --help            Show this help
  -V, --version         Show version

EXAMPLES:
  portres get                    # Get one available port
  portres get -n 3               # Get 3 available ports
  portres get -t mytest          # Get port with tag
  portres release 50000          # Release port 50000
  portres release-all            # Release all ports for this process
  portres list                   # List all allocations
  portres list --json            # List in JSON format
  portres clean                  # Remove stale entries
  portres status                 # Show registry status
`);
}

function printVersion(): void {
  console.log('portres 0.1.0');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    printVersion();
    process.exit(0);
  }

  const config: Partial<PortConfig> = {
    verbose: args.verbose,
  };

  if (args.minPort !== undefined) config.minPort = args.minPort;
  if (args.maxPort !== undefined) config.maxPort = args.maxPort;
  if (args.registryDir !== undefined) config.registryDir = args.registryDir;
  if (args.allowPrivileged !== undefined) config.allowPrivileged = args.allowPrivileged;

  const resolver = new PortResolver(config);

  try {
    switch (args.command) {
      case 'get': {
        const count = args.count ?? 1;
        if (count === 1) {
          const result = await resolver.get({ tag: args.tag });
          if (!result.ok) {
            console.error(`Error: ${result.error.message}`);
            process.exit(1);
          }
          if (args.json) {
            console.log(JSON.stringify(result.value, null, 2));
          } else {
            console.log(result.value.port);
          }
        } else {
          const result = await resolver.getMultiple(count, { tag: args.tag });
          if (!result.ok) {
            console.error(`Error: ${result.error.message}`);
            process.exit(1);
          }
          if (args.json) {
            console.log(JSON.stringify(result.value, null, 2));
          } else {
            console.log(result.value.map(a => a.port).join('\n'));
          }
        }
        break;
      }

      case 'release': {
        if (args.port === undefined || isNaN(args.port)) {
          console.error('Error: Port number required');
          process.exit(1);
        }
        const result = await resolver.release(args.port);
        if (!result.ok) {
          console.error(`Error: ${result.error.message}`);
          process.exit(1);
        }
        if (args.json) {
          console.log(JSON.stringify({ released: args.port }));
        } else if (args.verbose) {
          console.log(`Released port ${args.port}`);
        }
        break;
      }

      case 'release-all': {
        const result = await resolver.releaseAll();
        if (!result.ok) {
          console.error(`Error: ${result.error.message}`);
          process.exit(1);
        }
        if (args.json) {
          console.log(JSON.stringify({ releasedCount: result.value }));
        } else {
          console.log(`Released ${result.value} port(s)`);
        }
        break;
      }

      case 'list': {
        const result = await resolver.list();
        if (!result.ok) {
          console.error(`Error: ${result.error.message}`);
          process.exit(1);
        }
        if (args.json) {
          console.log(JSON.stringify(result.value, null, 2));
        } else if (result.value.length === 0) {
          console.log('No port allocations');
        } else {
          console.log('Port\tPID\tTag\tTimestamp');
          for (const entry of result.value) {
            console.log(`${entry.port}\t${entry.pid}\t${entry.tag ?? '-'}\t${new Date(entry.timestamp).toISOString()}`);
          }
        }
        break;
      }

      case 'clean': {
        const result = await resolver.clean();
        if (!result.ok) {
          console.error(`Error: ${result.error.message}`);
          process.exit(1);
        }
        if (args.json) {
          console.log(JSON.stringify({ cleaned: result.value }));
        } else {
          console.log(`Cleaned ${result.value} stale entries`);
        }
        break;
      }

      case 'status': {
        const result = await resolver.status();
        if (!result.ok) {
          console.error(`Error: ${result.error.message}`);
          process.exit(1);
        }
        if (args.json) {
          console.log(JSON.stringify(result.value, null, 2));
        } else {
          const s = result.value;
          console.log(`Registry Status:`);
          console.log(`  Total entries: ${s.totalEntries}`);
          console.log(`  Active entries: ${s.activeEntries}`);
          console.log(`  Stale entries: ${s.staleEntries}`);
          console.log(`  Owned by this process: ${s.ownedByCurrentProcess}`);
          console.log(`  Port range: ${s.portRange.min}-${s.portRange.max}`);
        }
        break;
      }

      case 'clear': {
        const result = await resolver.clear();
        if (!result.ok) {
          console.error(`Error: ${result.error.message}`);
          process.exit(1);
        }
        if (args.json) {
          console.log(JSON.stringify({ cleared: true }));
        } else {
          console.log('Registry cleared');
        }
        break;
      }

      default:
        if (args.command) {
          console.error(`Unknown command: ${args.command}`);
        } else {
          console.error('No command specified');
        }
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
const argv1 = globalThis.process?.argv?.[1];
if (argv1) {
  try {
    const realPath = realpathSync(argv1);
    if (import.meta.url === `file://${realPath}`) {
      main();
    }
  } catch {
    // Fallback for non-existent paths
    if (import.meta.url === `file://${argv1}`) {
      main();
    }
  }
}
