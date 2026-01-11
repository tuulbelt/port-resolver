#!/usr/bin/env npx tsx
/**
 * Tree-Shaking Demonstration (v0.3.0)
 *
 * Shows how modular imports reduce bundle size in real-world scenarios.
 *
 * This example demonstrates:
 * - Selective imports for minimal bundles
 * - When to use which entry point
 * - Bundle size impact in different use cases
 *
 * Run: npx tsx examples/tree-shaking.ts
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

console.log('🌳 Port Resolver v0.3.0 - Tree-Shaking Guide\n');

// ============================================================================
// Use Case 1: Simple Frontend App
// ============================================================================

console.log('📱 Use Case 1: Simple Frontend App (Webpack/Vite)');
console.log('   Goal: Allocate a single port for dev server\n');

console.log('   ❌ Without tree-shaking:');
console.log('      import { getPort } from "@tuulbelt/port-resolver";');
console.log('      Bundle: ~28 KB\n');

console.log('   ✅ With tree-shaking:');
console.log('      import { getPort } from "@tuulbelt/port-resolver/api";');
console.log('      Bundle: ~10 KB (saves 18 KB, -65%)\n');

// Demonstrate
const testDir1 = mkdtempSync(join(tmpdir(), 'portres-tree-1-'));
import { getPort } from '../src/api/index.js';

const port1 = await getPort({ config: { registryDir: testDir1 } });
if (port1.ok) {
  console.log(`   ✓ Allocated port ${port1.value.port} with 65% smaller bundle\n`);
}

rmSync(testDir1, { recursive: true, force: true });

// ============================================================================
// Use Case 2: Type-Safe Library
// ============================================================================

console.log('📚 Use Case 2: Type-Safe Library (TypeScript definitions only)');
console.log('   Goal: Type definitions for port configuration\n');

console.log('   ❌ Without tree-shaking:');
console.log('      import { PortConfig } from "@tuulbelt/port-resolver";');
console.log('      Bundle: ~28 KB (unnecessary runtime code)\n');

console.log('   ✅ With tree-shaking:');
console.log('      import type { PortConfig } from "@tuulbelt/port-resolver/types";');
console.log('      Bundle: 0 KB (compile-time only, saves 28 KB, -100%)\n');

import type { PortConfig } from '../src/types.js';

const config: PortConfig = {
  registryDir: '/tmp/test',
  minPort: 3000,
  maxPort: 4000,
};

console.log(`   ✓ Type-safe config with zero runtime overhead\n`);

// ============================================================================
// Use Case 3: Advanced Test Framework
// ============================================================================

console.log('🧪 Use Case 3: Advanced Test Framework (PortManager + APIs)');
console.log('   Goal: Lifecycle management for parallel tests\n');

console.log('   ❌ Without tree-shaking:');
console.log('      import { PortManager, getPort } from "@tuulbelt/port-resolver";');
console.log('      Bundle: ~28 KB (includes unused utilities)\n');

console.log('   ✅ With tree-shaking (Core + API):');
console.log('      import { PortManager } from "@tuulbelt/port-resolver/core";');
console.log('      import { getPort } from "@tuulbelt/port-resolver/api";');
console.log('      Bundle: ~20 KB (saves 8 KB, -30%)\n');

const testDir3 = mkdtempSync(join(tmpdir(), 'portres-tree-3-'));
import { PortManager } from '../src/core/index.js';

const manager = new PortManager({ registryDir: testDir3 });
const port3 = await manager.allocate('test-service');

if (port3.ok) {
  console.log(`   ✓ Allocated port ${port3.value.port} with PortManager\n`);
}

await manager.releaseAll();
rmSync(testDir3, { recursive: true, force: true });

// ============================================================================
// Use Case 4: Utility Function Consumer
// ============================================================================

console.log('🔧 Use Case 4: Utility Function (Port availability check)');
console.log('   Goal: Check if a port is available\n');

console.log('   ❌ Without tree-shaking:');
console.log('      import { isPortAvailable } from "@tuulbelt/port-resolver";');
console.log('      Bundle: ~28 KB (includes entire allocation engine)\n');

console.log('   ✅ With tree-shaking:');
console.log('      import { isPortAvailable } from "@tuulbelt/port-resolver/utils";');
console.log('      Bundle: ~5 KB (saves 23 KB, -80%)\n');

import { isPortAvailable } from '../src/utils/index.js';

const available = await isPortAvailable(9999);
console.log(`   ✓ Port 9999 available: ${available}\n`);

// ============================================================================
// Decision Tree
// ============================================================================

console.log('═'.repeat(70));
console.log('\n📋 Decision Tree: Which Entry Point to Use?\n');

console.log('┌─ Need types only for TypeScript?');
console.log('│  ✓ Use: @tuulbelt/port-resolver/types (0 KB)');
console.log('│');
console.log('┌─ Need simple port allocation (getPort, getPorts)?');
console.log('│  ✓ Use: @tuulbelt/port-resolver/api (~10 KB)');
console.log('│');
console.log('┌─ Need PortResolver or PortManager classes?');
console.log('│  ✓ Use: @tuulbelt/port-resolver/core (~17 KB)');
console.log('│');
console.log('┌─ Need utility functions (isPortAvailable, validatePath)?');
console.log('│  ✓ Use: @tuulbelt/port-resolver/utils (~5 KB)');
console.log('│');
console.log('┌─ Need everything (prototyping, Node.js backend)?');
console.log('│  ✓ Use: @tuulbelt/port-resolver (default, ~28 KB)');
console.log('│');
console.log('└─ Building a CLI tool?');
console.log('   ✓ Use: @tuulbelt/port-resolver/cli (N/A)');

console.log('\n💡 Pro Tips:\n');
console.log('   • Frontend apps: Use specific entry points for smaller bundles');
console.log('   • Node.js services: Full API is fine (bundle size doesn\'t matter)');
console.log('   • Libraries: Use type-only imports when possible');
console.log('   • Test frameworks: Combine core + api for optimal balance\n');

console.log('═'.repeat(70));
console.log('\n✓ Tree-shaking guide complete!\n');
