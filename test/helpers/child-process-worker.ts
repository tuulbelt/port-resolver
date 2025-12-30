/**
 * Child process worker for cross-process integration tests
 *
 * This script is executed by child_process.fork() to simulate
 * concurrent port allocation across separate Node.js processes.
 */

import { PortResolver } from '../../src/index.ts';

const command = process.argv[2];
const registryDir = process.argv[3];
const count = parseInt(process.argv[4] || '1', 10);

async function main() {
  const resolver = new PortResolver({ registryDir });

  try {
    if (command === 'allocate') {
      // Allocate port(s)
      if (count === 1) {
        const result = await resolver.get({ tag: `worker-${process.pid}` });
        if (result.ok) {
          process.send?.({ success: true, port: result.value.port });
        } else {
          process.send?.({ success: false, error: result.error.message });
        }
      } else {
        const result = await resolver.getMultiple(count, { tag: `worker-${process.pid}` });
        if (result.ok) {
          const ports = result.value.map(a => a.port);
          process.send?.({ success: true, ports });
        } else {
          process.send?.({ success: false, error: result.error.message });
        }
      }
    } else if (command === 'list') {
      // List allocations
      const result = await resolver.list();
      if (result.ok) {
        process.send?.({ success: true, count: result.value.length });
      } else {
        process.send?.({ success: false, error: result.error.message });
      }
    } else if (command === 'releaseAll') {
      // Release all ports
      const result = await resolver.releaseAll();
      if (result.ok) {
        process.send?.({ success: true, count: result.value });
      } else {
        process.send?.({ success: false, error: result.error.message });
      }
    } else {
      process.send?.({ success: false, error: `Unknown command: ${command}` });
    }

    process.exit(0);
  } catch (err) {
    process.send?.({ success: false, error: (err as Error).message });
    process.exit(1);
  }
}

main();
