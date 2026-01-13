/**
 * CI/CD Integration Patterns
 *
 * This example demonstrates how to use port-resolver in continuous integration
 * environments where multiple test jobs run in parallel.
 *
 * Features demonstrated:
 * - GitHub Actions integration
 * - GitLab CI integration
 * - CircleCI integration
 * - Jenkins integration
 * - Docker Compose integration
 *
 * Run this example:
 *   npx tsx examples/ci-integration.ts
 */

import { PortResolver, PortManager } from '../src/index.ts';
import { createServer, type Server } from 'node:net';

/**
 * Example 1: GitHub Actions matrix builds
 *
 * Use when running parallel jobs with matrix strategy
 */
async function githubActionsPattern() {
  console.log('Example 1: GitHub Actions parallel matrix builds\n');

  console.log('  Workflow file (.github/workflows/test.yml):');
  console.log('  ```yaml');
  console.log('  jobs:');
  console.log('    test:');
  console.log('      strategy:');
  console.log('        matrix:');
  console.log('          node-version: [18, 20, 22]');
  console.log('          test-suite: [unit, integration, e2e]');
  console.log('      steps:');
  console.log('        - run: npm test');
  console.log('  ```\n');

  // Simulate parallel test execution
  console.log('  Test execution (each job gets isolated ports):');

  const jobs = [
    { node: '18', suite: 'unit' },
    { node: '20', suite: 'integration' },
    { node: '22', suite: 'e2e' },
  ];

  const jobExecutions = jobs.map(async ({ node, suite }) => {
    const resolver = new PortResolver();
    const portResult = await resolver.get({ tag: `node${node}-${suite}` });

    if (portResult.ok) {
      // Simulate test run
      await new Promise((resolve) => setTimeout(resolve, 100));
      await resolver.releaseAll();
      return `    ✓ Node ${node} - ${suite} (port ${portResult.value.port})`;
    }
    return `    ✗ Node ${node} - ${suite} (failed)`;
  });

  const results = await Promise.all(jobExecutions);
  results.forEach((result) => console.log(result));

  console.log('\n  Benefits: No port conflicts across matrix dimensions');
  console.log();
}

/**
 * Example 2: GitLab CI parallel jobs
 *
 * Use with GitLab's parallel keyword
 */
async function gitlabCiPattern() {
  console.log('Example 2: GitLab CI parallel jobs\n');

  console.log('  .gitlab-ci.yml:');
  console.log('  ```yaml');
  console.log('  test:');
  console.log('    parallel: 5');
  console.log('    script:');
  console.log('      - npm test -- --shard=$CI_NODE_INDEX/$CI_NODE_TOTAL');
  console.log('  ```\n');

  console.log('  Test execution (5 parallel shards):');

  const shards = Array.from({ length: 5 }, (_, i) => i + 1);

  const shardExecutions = shards.map(async (shardIndex) => {
    const resolver = new PortResolver();
    const portsResult = await resolver.getMultiple(2, { tag: `shard-${shardIndex}` });

    if (portsResult.ok) {
      await resolver.releaseAll();
      return `    ✓ Shard ${shardIndex}/5 (ports ${portsResult.value.map((p) => p.port).join(', ')})`;
    }
    return `    ✗ Shard ${shardIndex}/5 (failed)`;
  });

  const results = await Promise.all(shardExecutions);
  results.forEach((result) => console.log(result));

  console.log('\n  Benefits: Automatic port isolation per shard');
  console.log();
}

/**
 * Example 3: Docker Compose test environment
 *
 * Use when tests run inside containers
 */
async function dockerComposePattern() {
  console.log('Example 3: Docker Compose test environment\n');

  console.log('  docker-compose.test.yml:');
  console.log('  ```yaml');
  console.log('  services:');
  console.log('    test-runner:');
  console.log('      build: .');
  console.log('      command: npm test');
  console.log('      volumes:');
  console.log('        - ~/.portres:/root/.portres  # Shared registry');
  console.log('  ```\n');

  // Container 1 allocates ports
  console.log('  Container 1 (test-runner):');
  const resolver1 = new PortResolver({ registryDir: '/tmp/shared-portres' });
  const port1 = await resolver1.get({ tag: 'container-1-api' });

  if (port1.ok) {
    console.log(`    Allocated: port ${port1.value.port}`);
  }

  // Container 2 sees the allocation
  console.log('  Container 2 (test-runner):');
  const resolver2 = new PortResolver({ registryDir: '/tmp/shared-portres' });
  const port2 = await resolver2.get({ tag: 'container-2-api' });

  if (port2.ok) {
    console.log(`    Allocated: port ${port2.value.port}`);
  }

  // Cleanup
  await resolver1.releaseAll();
  await resolver2.releaseAll();

  console.log('\n  Benefits: Shared registry across containers via volume mount');
  console.log();
}

/**
 * Example 4: Jest parallel workers
 *
 * Use with Jest's --maxWorkers flag
 */
async function jestParallelPattern() {
  console.log('Example 4: Jest parallel workers (--maxWorkers=4)\n');

  console.log('  package.json:');
  console.log('  ```json');
  console.log('  {');
  console.log('    "scripts": {');
  console.log('      "test": "jest --maxWorkers=4"');
  console.log('    }');
  console.log('  }');
  console.log('  ```\n');

  console.log('  Test file setup:');
  console.log('  ```typescript');
  console.log('  let testPort: number;');
  console.log('  const resolver = new PortResolver();');
  console.log('');
  console.log('  beforeAll(async () => {');
  console.log('    const result = await resolver.get();');
  console.log('    testPort = result.ok ? result.value.port : 0;');
  console.log('  });');
  console.log('');
  console.log('  afterAll(async () => {');
  console.log('    await resolver.releaseAll();');
  console.log('  });');
  console.log('  ```\n');

  // Simulate 4 workers
  const workers = Array.from({ length: 4 }, (_, i) => i + 1);

  console.log('  Worker execution:');
  const workerExecutions = workers.map(async (workerId) => {
    const resolver = new PortResolver();
    const portResult = await resolver.get({ tag: `jest-worker-${workerId}` });

    if (portResult.ok) {
      await resolver.releaseAll();
      return `    Worker ${workerId}: ✓ (port ${portResult.value.port})`;
    }
    return `    Worker ${workerId}: ✗`;
  });

  const results = await Promise.all(workerExecutions);
  results.forEach((result) => console.log(result));

  console.log('\n  Benefits: Each Jest worker gets isolated ports');
  console.log();
}

/**
 * Example 5: Mocha parallel mode
 *
 * Use with Mocha's --parallel flag
 */
async function mochaParallelPattern() {
  console.log('Example 5: Mocha parallel mode (--parallel --jobs 3)\n');

  console.log('  Test file pattern:');
  console.log('  ```typescript');
  console.log('  import { PortManager } from "port-resolver";');
  console.log('');
  console.log('  describe("API tests", () => {');
  console.log('    const manager = new PortManager();');
  console.log('');
  console.log('    before(async () => {');
  console.log('      await manager.allocate("api-server");');
  console.log('    });');
  console.log('');
  console.log('    after(async () => {');
  console.log('      await manager.releaseAll();');
  console.log('    });');
  console.log('');
  console.log('    it("test 1", () => { /* ... */ });');
  console.log('  });');
  console.log('  ```\n');

  // Simulate 3 parallel test files
  const testFiles = ['api.test.ts', 'db.test.ts', 'auth.test.ts'];

  console.log('  Parallel test execution:');
  const testExecutions = testFiles.map(async (testFile) => {
    const manager = new PortManager();
    await manager.allocate(testFile);
    await manager.releaseAll();
    return `    ✓ ${testFile}`;
  });

  const results = await Promise.all(testExecutions);
  results.forEach((result) => console.log(result));

  console.log('\n  Benefits: PortManager simplifies lifecycle management');
  console.log();
}

/**
 * Example 6: CircleCI parallel containers
 *
 * Use with CircleCI's parallelism feature
 */
async function circleCiPattern() {
  console.log('Example 6: CircleCI parallel containers\n');

  console.log('  .circleci/config.yml:');
  console.log('  ```yaml');
  console.log('  jobs:');
  console.log('    test:');
  console.log('      parallelism: 4');
  console.log('      steps:');
  console.log('        - run: npm test -- $(circleci tests glob "test/**/*.test.ts" | circleci tests split)');
  console.log('  ```\n');

  // Simulate 4 containers
  const containers = Array.from({ length: 4 }, (_, i) => i);

  console.log('  Container execution:');
  const containerExecutions = containers.map(async (containerIndex) => {
    const resolver = new PortResolver();
    const portsResult = await resolver.getMultiple(3, {
      tag: `circleci-container-${containerIndex}`,
    });

    if (portsResult.ok) {
      await resolver.releaseAll();
      return `    Container ${containerIndex}: ✓ (${portsResult.value.length} ports)`;
    }
    return `    Container ${containerIndex}: ✗`;
  });

  const results = await Promise.all(containerExecutions);
  results.forEach((result) => console.log(result));

  console.log('\n  Benefits: Isolated ports per CircleCI container');
  console.log();
}

/**
 * Example 7: Pre-test environment validation
 *
 * Use to verify port availability before running tests
 */
async function preTestValidation() {
  console.log('Example 7: Pre-test environment validation\n');

  const resolver = new PortResolver();

  console.log('  Validating test environment:');

  // Check if registry is accessible
  const status = await resolver.status();
  if (status.ok) {
    console.log(`    ✓ Registry accessible (${status.value.totalEntries} entries)`);

    // Clean stale entries
    const cleaned = await resolver.clean();
    if (cleaned.ok && cleaned.value > 0) {
      console.log(`    ✓ Cleaned ${cleaned.value} stale entries`);
    }

    // Check port availability
    const testPort = await resolver.get({ tag: 'pre-test-check' });
    if (testPort.ok) {
      console.log(`    ✓ Port allocation working (port ${testPort.value.port})`);
      await resolver.release(testPort.value.port);
    }

    console.log('    ✓ Environment ready for tests');
  }

  console.log();
  console.log('  Use in CI setup scripts or beforeAll hooks');
  console.log();
}

/**
 * Example 8: Post-test cleanup and reporting
 */
async function postTestCleanup() {
  console.log('Example 8: Post-test cleanup and reporting\n');

  const resolver = new PortResolver();

  // Simulate some test allocations
  await resolver.getMultiple(3, { tag: 'test-suite' });

  console.log('  Post-test cleanup:');

  // Get final status
  const statusBefore = await resolver.status();
  if (statusBefore.ok) {
    console.log(`    Allocated during tests: ${statusBefore.value.ownedByCurrentProcess} ports`);
  }

  // Release all ports from this process
  const released = await resolver.releaseAll();
  if (released.ok) {
    console.log(`    Released: ${released.value} ports`);
  }

  // Verify cleanup
  const statusAfter = await resolver.status();
  if (statusAfter.ok) {
    console.log(`    Remaining allocations: ${statusAfter.value.ownedByCurrentProcess}`);
  }

  console.log();
  console.log('  Use in CI teardown scripts or afterAll hooks');
  console.log();
}

// Main execution
async function main() {
  console.log('Port Resolver - CI/CD Integration Patterns\n');
  console.log('='.repeat(60) + '\n');

  await githubActionsPattern();
  await gitlabCiPattern();
  await dockerComposePattern();
  await jestParallelPattern();
  await mochaParallelPattern();
  await circleCiPattern();
  await preTestValidation();
  await postTestCleanup();

  console.log('CI/CD Best Practices:');
  console.log('  ✓ Use shared registry directory across parallel jobs');
  console.log('  ✓ Clean stale entries in pre-test setup');
  console.log('  ✓ Always call releaseAll() in afterAll/teardown hooks');
  console.log('  ✓ Use tags to identify which job/worker owns which port');
  console.log('  ✓ Validate port allocation in CI setup scripts');
  console.log();

  console.log('Platform-Specific Tips:');
  console.log('  GitHub Actions:  Use matrix strategy for parallel jobs');
  console.log('  GitLab CI:       Use parallel keyword with CI_NODE_INDEX');
  console.log('  CircleCI:        Use parallelism with test splitting');
  console.log('  Docker Compose:  Mount ~/.portres as shared volume');
  console.log('  Jest/Mocha:      Use PortResolver in beforeAll/afterAll');
  console.log();

  console.log('Registry Configuration for CI:');
  console.log('  Default location: ~/.portres/');
  console.log('  Custom location:  new PortResolver({ registryDir: "/custom/path" })');
  console.log('  Docker volume:    - ~/.portres:/root/.portres');
  console.log();

  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
