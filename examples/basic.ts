/**
 * Basic usage example for Test Port Resolver / portres
 *
 * Run this example:
 *   npx tsx examples/basic.ts
 */

import { PortResolver } from '../src/index.ts';

async function main() {
  // Create a resolver with default settings
  const resolver = new PortResolver();

  console.log('=== Test Port Resolver - Basic Examples ===\n');

  // Example 1: Get a single port
  console.log('Example 1: Get a single port');
  const port1 = await resolver.get();
  if (port1.ok) {
    console.log(`  Allocated port: ${port1.value.port}`);
  }
  console.log();

  // Example 2: Get a port with a tag
  console.log('Example 2: Get a port with a tag');
  const port2 = await resolver.get({ tag: 'my-test-server' });
  if (port2.ok) {
    console.log(`  Allocated port: ${port2.value.port}`);
    console.log(`  Tag: ${port2.value.tag}`);
  }
  console.log();

  // Example 3: Get multiple ports at once
  console.log('Example 3: Get multiple ports');
  const ports = await resolver.getMultiple(3);
  if (ports.ok) {
    console.log(`  Allocated ${ports.value.length} ports:`);
    for (const p of ports.value) {
      console.log(`    - ${p.port}`);
    }
  }
  console.log();

  // Example 4: List all allocations
  console.log('Example 4: List all port allocations');
  const list = await resolver.list();
  if (list.ok) {
    console.log(`  Total allocations: ${list.value.length}`);
  }
  console.log();

  // Example 5: Get registry status
  console.log('Example 5: Registry status');
  const status = await resolver.status();
  if (status.ok) {
    console.log(`  Total entries: ${status.value.totalEntries}`);
    console.log(`  Active entries: ${status.value.activeEntries}`);
    console.log(`  Owned by this process: ${status.value.ownedByCurrentProcess}`);
    console.log(`  Port range: ${status.value.portRange.min}-${status.value.portRange.max}`);
  }
  console.log();

  // Example 6: Release all ports
  console.log('Example 6: Release all ports');
  const released = await resolver.releaseAll();
  if (released.ok) {
    console.log(`  Released ${released.value} ports`);
  }
  console.log();

  console.log('=== Done ===');
}

main().catch(console.error);
