#!/usr/bin/env -S npx tsx
/**
 * Port Resolver CLI
 */
import { readFileSync } from 'node:fs';
import { PortResolver } from './core/port-resolver.js';
import { DEFAULT_CONFIG } from './config.js';
import { readRegistry } from './registry/index.js';
import { getPort, getPorts, releasePort } from './api/index.js';
// ============================================================================
// CLI Argument Parsing
// ============================================================================
function parseArgs(args) {
    const result = { command: '' };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        if (arg === '--help' || arg === '-h') {
            result.help = true;
        }
        else if (arg === '--version' || arg === '-V') {
            result.version = true;
        }
        else if (arg === '--json' || arg === '-j') {
            result.json = true;
        }
        else if (arg === '--verbose' || arg === '-v') {
            result.verbose = true;
        }
        else if (arg === '--allow-privileged') {
            result.allowPrivileged = true;
        }
        else if ((arg === '--port' || arg === '-p') && next) {
            result.port = parseInt(next, 10);
            i++;
        }
        else if ((arg === '--count' || arg === '-n') && next) {
            result.count = parseInt(next, 10);
            i++;
        }
        else if ((arg === '--tag' || arg === '-t') && next) {
            result.tag = next;
            i++;
        }
        else if (arg === '--min-port' && next) {
            result.minPort = parseInt(next, 10);
            i++;
        }
        else if (arg === '--max-port' && next) {
            result.maxPort = parseInt(next, 10);
            i++;
        }
        else if ((arg === '--registry-dir' || arg === '-d') && next) {
            result.registryDir = next;
            i++;
        }
        else if (!arg?.startsWith('-') && !result.command) {
            result.command = arg ?? '';
        }
        else if (!arg?.startsWith('-') && result.command && !result.port) {
            // Second positional argument is the port number (for release command)
            const portNum = parseInt(arg ?? '', 10);
            if (!isNaN(portNum)) {
                result.port = portNum;
            }
        }
    }
    return result;
}
function printHelp() {
    console.log(`
Test Port Resolver - Concurrent test port allocation

USAGE
  portres <command> [options]

COMMANDS
  get                 Get a single available port
  get-multiple        Get multiple ports atomically
  release             Release a port allocation
  release-all         Release all ports owned by current process
  status              Show registry status
  list                List all allocated ports
  clean               Clean stale entries from registry
  clear               Clear entire registry (all ports)

OPTIONS
  -t, --tag <tag>              Tag for port allocation
  -n, --count <number>         Number of ports to allocate
  -p, --port <number>          Port number to release
  -d, --registry-dir <path>    Registry directory (default: ~/.portres)
  --min-port <number>          Minimum port number
  --max-port <number>          Maximum port number
  --allow-privileged           Allow privileged ports (<1024)
  -j, --json                   Output in JSON format
  -v, --verbose                Enable verbose logging
  -h, --help                   Show this help message
  -V, --version                Show version number

EXAMPLES
  # Get a single port
  portres get --tag api-server

  # Get multiple ports
  portres get-multiple --count 3 --tag test-suite

  # Release by tag
  portres release --tag api-server

  # Release by port number
  portres release --port 54321

  # Show registry status
  portres status

  # List all allocations
  portres list

  # Clean stale entries
  portres clean

For more information, visit https://github.com/tuulbelt/port-resolver
`);
}
function printVersion() {
    // Read version from package.json
    try {
        const packageJsonPath = new URL('../package.json', import.meta.url).pathname;
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        console.log(`Port Resolver v${packageJson.version}`);
    }
    catch {
        console.log('Port Resolver (version unknown)');
    }
}
// ============================================================================
// CLI Commands
// ============================================================================
async function cmdGet(args) {
    const config = {};
    if (args.minPort !== undefined)
        config.minPort = args.minPort;
    if (args.maxPort !== undefined)
        config.maxPort = args.maxPort;
    if (args.registryDir)
        config.registryDir = args.registryDir;
    if (args.allowPrivileged)
        config.allowPrivileged = true;
    if (args.verbose)
        config.verbose = true;
    // Support -n flag for backward compatibility (get -n 3 → multiple ports)
    if (args.count !== undefined && args.count > 1) {
        const multiResult = await getPorts(args.count, { tag: args.tag, config });
        if (multiResult.ok) {
            if (args.json) {
                console.log(JSON.stringify(multiResult.value, null, 2));
            }
            else {
                for (const alloc of multiResult.value) {
                    console.log(alloc.port);
                }
                if (args.verbose) {
                    console.error(`Allocated ${multiResult.value.length} ports${args.tag ? ` with tag: ${args.tag}` : ''}`);
                }
            }
            process.exit(0);
        }
        else {
            if (args.json) {
                console.error(JSON.stringify({ error: multiResult.error.message }, null, 2));
            }
            else {
                console.error(`Error: ${multiResult.error.message}`);
            }
            process.exit(1);
        }
    }
    // Single port allocation
    const result = await getPort({ tag: args.tag, config });
    if (result.ok) {
        if (args.json) {
            console.log(JSON.stringify(result.value, null, 2));
        }
        else {
            console.log(result.value.port);
            if (result.value.tag && args.verbose) {
                console.error(`Tag: ${result.value.tag}`);
            }
        }
        process.exit(0);
    }
    else {
        if (args.json) {
            console.error(JSON.stringify({ error: result.error.message }, null, 2));
        }
        else {
            console.error(`Error: ${result.error.message}`);
        }
        process.exit(1);
    }
}
async function cmdGetMultiple(args) {
    if (args.count === undefined || args.count < 1) {
        console.error('Error: --count is required and must be at least 1');
        process.exit(1);
    }
    const config = {};
    if (args.minPort !== undefined)
        config.minPort = args.minPort;
    if (args.maxPort !== undefined)
        config.maxPort = args.maxPort;
    if (args.registryDir)
        config.registryDir = args.registryDir;
    if (args.allowPrivileged)
        config.allowPrivileged = true;
    if (args.verbose)
        config.verbose = true;
    const result = await getPorts(args.count, { tag: args.tag, config });
    if (result.ok) {
        if (args.json) {
            console.log(JSON.stringify(result.value, null, 2));
        }
        else {
            for (const alloc of result.value) {
                console.log(alloc.port);
            }
            if (args.verbose) {
                console.error(`Allocated ${result.value.length} ports${args.tag ? ` with tag: ${args.tag}` : ''}`);
            }
        }
        process.exit(0);
    }
    else {
        if (args.json) {
            console.error(JSON.stringify({ error: result.error.message }, null, 2));
        }
        else {
            console.error(`Error: ${result.error.message}`);
        }
        process.exit(1);
    }
}
async function cmdRelease(args) {
    const config = {};
    if (args.registryDir)
        config.registryDir = args.registryDir;
    if (args.verbose)
        config.verbose = true;
    const result = await releasePort({ tag: args.tag, port: args.port, config });
    if (result.ok) {
        if (args.json) {
            console.log(JSON.stringify({ success: true }, null, 2));
        }
        else if (args.verbose) {
            console.log(`Released ${args.tag ? `tag: ${args.tag}` : `port: ${args.port}`}`);
        }
        process.exit(0);
    }
    else {
        if (args.json) {
            console.error(JSON.stringify({ error: result.error.message }, null, 2));
        }
        else {
            console.error(`Error: ${result.error.message}`);
        }
        process.exit(1);
    }
}
async function cmdStatus(args) {
    const config = { ...DEFAULT_CONFIG };
    if (args.registryDir)
        config.registryDir = args.registryDir;
    const resolver = new PortResolver(config);
    const result = await resolver.status();
    if (result.ok) {
        if (args.json) {
            console.log(JSON.stringify(result.value, null, 2));
        }
        else {
            const status = result.value;
            console.log('Registry Status:');
            console.log(`  Total entries: ${status.totalEntries}`);
            console.log(`  Active entries: ${status.activeEntries}`);
            console.log(`  Stale entries: ${status.staleEntries}`);
            console.log(`  Owned by current process: ${status.ownedByCurrentProcess}`);
            console.log(`  Port range: ${status.portRange.min}-${status.portRange.max}`);
        }
        process.exit(0);
    }
    else {
        if (args.json) {
            console.error(JSON.stringify({ error: result.error.message }, null, 2));
        }
        else {
            console.error(`Error: ${result.error.message}`);
        }
        process.exit(1);
    }
}
async function cmdList(args) {
    const config = { ...DEFAULT_CONFIG };
    if (args.registryDir)
        config.registryDir = args.registryDir;
    const registryResult = readRegistry(config);
    if (registryResult.ok) {
        const registry = registryResult.value;
        if (args.json) {
            console.log(JSON.stringify(registry.entries, null, 2));
        }
        else {
            if (registry.entries.length === 0) {
                console.log('No port allocations');
            }
            else {
                console.log('Allocated Ports:');
                for (const entry of registry.entries) {
                    const tag = entry.tag ? ` (tag: ${entry.tag})` : '';
                    console.log(`  Port ${entry.port} - PID ${entry.pid}${tag}`);
                }
            }
        }
        process.exit(0);
    }
    else {
        if (args.json) {
            console.error(JSON.stringify({ error: registryResult.error.message }, null, 2));
        }
        else {
            console.error(`Error: ${registryResult.error.message}`);
        }
        process.exit(1);
    }
}
async function cmdClean(args) {
    const config = { ...DEFAULT_CONFIG };
    if (args.registryDir)
        config.registryDir = args.registryDir;
    if (args.verbose)
        config.verbose = true;
    const resolver = new PortResolver(config);
    const result = await resolver.clean();
    if (result.ok) {
        if (args.json) {
            console.log(JSON.stringify({ cleaned: result.value }, null, 2));
        }
        else {
            console.log(`Removed ${result.value} stale ${result.value === 1 ? 'entry' : 'entries'}`);
        }
        process.exit(0);
    }
    else {
        if (args.json) {
            console.error(JSON.stringify({ error: result.error.message }, null, 2));
        }
        else {
            console.error(`Error: ${result.error.message}`);
        }
        process.exit(1);
    }
}
async function cmdReleaseAll(args) {
    const config = { ...DEFAULT_CONFIG };
    if (args.registryDir)
        config.registryDir = args.registryDir;
    if (args.verbose)
        config.verbose = true;
    const resolver = new PortResolver(config);
    const result = await resolver.releaseAll();
    if (result.ok) {
        if (args.json) {
            console.log(JSON.stringify({ released: result.value }, null, 2));
        }
        else {
            console.log(`Released ${result.value} ${result.value === 1 ? 'port' : 'ports'}`);
        }
        process.exit(0);
    }
    else {
        if (args.json) {
            console.error(JSON.stringify({ error: result.error.message }, null, 2));
        }
        else {
            console.error(`Error: ${result.error.message}`);
        }
        process.exit(1);
    }
}
async function cmdClear(args) {
    const config = { ...DEFAULT_CONFIG };
    if (args.registryDir)
        config.registryDir = args.registryDir;
    if (args.verbose)
        config.verbose = true;
    const resolver = new PortResolver(config);
    const result = await resolver.clear();
    if (result.ok) {
        if (args.json) {
            console.log(JSON.stringify({ success: true }, null, 2));
        }
        else {
            console.log('Registry cleared');
        }
        process.exit(0);
    }
    else {
        if (args.json) {
            console.error(JSON.stringify({ error: result.error.message }, null, 2));
        }
        else {
            console.error(`Error: ${result.error.message}`);
        }
        process.exit(1);
    }
}
// ============================================================================
// CLI Entry Point
// ============================================================================
async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        process.exit(0);
    }
    if (args.version) {
        printVersion();
        process.exit(0);
    }
    switch (args.command) {
        case 'get':
            await cmdGet(args);
            break;
        case 'get-multiple':
            await cmdGetMultiple(args);
            break;
        case 'release':
            await cmdRelease(args);
            break;
        case 'release-all':
            await cmdReleaseAll(args);
            break;
        case 'status':
            await cmdStatus(args);
            break;
        case 'list':
            await cmdList(args);
            break;
        case 'clean':
            await cmdClean(args);
            break;
        case 'clear':
            await cmdClear(args);
            break;
        default:
            console.error(`Unknown command: ${args.command}`);
            console.error('Run "portres --help" for usage information');
            process.exit(1);
    }
}
// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error('Unexpected error:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=cli.js.map