# CI Integration Guide

Comprehensive guide for integrating Test Port Resolver (`portres`) into continuous integration pipelines.

## Table of Contents

1. [Overview](#overview)
2. [General Best Practices](#general-best-practices)
3. [GitHub Actions](#github-actions)
4. [GitLab CI](#gitlab-ci)
5. [CircleCI](#circleci)
6. [Jenkins](#jenkins)
7. [Docker-Based CI](#docker-based-ci)
8. [Test Framework Integration](#test-framework-integration)
9. [Troubleshooting](#troubleshooting)

---

## Overview

### Why Use Port Resolver in CI?

**Problem:** Parallel test jobs in CI often fail due to port conflicts when multiple jobs try to bind to the same ports (e.g., 8080, 3000).

**Solution:** Port Resolver provides:
- Cross-process port coordination via file-based registry
- Atomic allocation with semaphore-based locking
- Automatic cleanup of stale entries
- Tag-based allocation tracking

### Prerequisites

```bash
npm install @tuulbelt/test-port-resolver
# or
npm install git+https://github.com/tuulbelt/port-resolver.git
```

### Quick Start

```typescript
import { PortResolver } from '@tuulbelt/test-port-resolver';

const resolver = new PortResolver();

// In test setup
const port = await resolver.get({ tag: 'test-server' });

// In test teardown
await resolver.releaseAll();
```

---

## General Best Practices

### 1. Shared Registry Directory

All parallel jobs must share the same registry directory:

**Default location:** `~/.portres/`

**Custom location:**
```typescript
const resolver = new PortResolver({
  registryDir: process.env.PORT_REGISTRY_DIR || '~/.portres/',
});
```

### 2. Pre-Test Cleanup

Clean stale entries before running tests:

```typescript
// In CI setup script or test suite setup
beforeAll(async () => {
  const resolver = new PortResolver();
  await resolver.clean(); // Remove stale entries
});
```

### 3. Post-Test Cleanup

Always release ports in teardown:

```typescript
afterAll(async () => {
  const resolver = new PortResolver();
  await resolver.releaseAll(); // Release this process's ports
});
```

### 4. Use Tags for Debugging

Tag allocations with job/worker info:

```typescript
const port = await resolver.get({
  tag: `${process.env.CI_JOB_ID}-${testName}`,
});
```

### 5. Port Range Configuration

Configure appropriate port ranges for your environment:

```typescript
const resolver = new PortResolver({
  minPort: 50000, // High ports avoid conflicts with system services
  maxPort: 60000,
});
```

---

## GitHub Actions

### Matrix Strategy

**Workflow file:** `.github/workflows/test.yml`

```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
        test-suite: [unit, integration, e2e]

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - run: npm ci

      - name: Run tests
        run: npm test
        env:
          TEST_SUITE: ${{ matrix.test-suite }}
          NODE_VERSION: ${{ matrix.node-version }}
```

**Test setup:**

```typescript
// test/setup.ts
import { PortResolver } from '@tuulbelt/test-port-resolver';

const resolver = new PortResolver();

beforeAll(async () => {
  // Clean stale entries
  await resolver.clean();
});

beforeEach(async () => {
  const tag = `gh-${process.env.NODE_VERSION}-${process.env.TEST_SUITE}`;
  const result = await resolver.get({ tag });

  if (result.ok) {
    global.testPort = result.value.port;
  }
});

afterAll(async () => {
  await resolver.releaseAll();
});
```

### Parallel Jobs (Manual Parallelism)

```yaml
jobs:
  test-shard-1:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- --shard=1/3

  test-shard-2:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- --shard=2/3

  test-shard-3:
    runs-on: ubuntu-latest
    steps:
      - run: npm test -- --shard=3/3
```

Each shard gets isolated ports automatically via shared registry.

---

## GitLab CI

### Parallel Jobs

**`.gitlab-ci.yml`:**

```yaml
test:
  parallel: 5
  script:
    - npm ci
    - npm test -- --shard=$CI_NODE_INDEX/$CI_NODE_TOTAL
  artifacts:
    when: always
    reports:
      junit: test-results.xml
```

**Test setup:**

```typescript
// test/setup.ts
import { PortResolver } from '@tuulbelt/test-port-resolver';

const resolver = new PortResolver();
const shardId = process.env.CI_NODE_INDEX || '1';
const shardTotal = process.env.CI_NODE_TOTAL || '1';

beforeAll(async () => {
  await resolver.clean();
});

beforeEach(async () => {
  const result = await resolver.get({
    tag: `gitlab-shard-${shardId}-${shardTotal}`,
  });

  if (result.ok) {
    global.testPort = result.value.port;
  }
});

afterAll(async () => {
  await resolver.releaseAll();
});
```

### Multiple Test Suites

```yaml
stages:
  - test

unit-tests:
  stage: test
  parallel: 3
  script:
    - npm test -- --testPathPattern=unit

integration-tests:
  stage: test
  parallel: 2
  script:
    - npm test -- --testPathPattern=integration

e2e-tests:
  stage: test
  script:
    - npm test -- --testPathPattern=e2e
```

Each suite and shard combination gets isolated ports.

---

## CircleCI

### Parallelism Configuration

**`.circleci/config.yml`:**

```yaml
version: 2.1

jobs:
  test:
    docker:
      - image: cimg/node:20.11

    parallelism: 4

    steps:
      - checkout

      - run:
          name: Install dependencies
          command: npm ci

      - run:
          name: Run tests
          command: |
            npm test -- $(circleci tests glob "test/**/*.test.ts" | circleci tests split)
```

**Test setup:**

```typescript
// test/setup.ts
import { PortResolver } from '@tuulbelt/test-port-resolver';

const resolver = new PortResolver();
const containerIndex = process.env.CIRCLE_NODE_INDEX || '0';

beforeAll(async () => {
  await resolver.clean();
});

beforeEach(async () => {
  const result = await resolver.get({
    tag: `circleci-${containerIndex}-${Date.now()}`,
  });

  if (result.ok) {
    global.testPort = result.value.port;
  }
});

afterAll(async () => {
  await resolver.releaseAll();
});
```

---

## Jenkins

### Parallel Pipeline Stages

**`Jenkinsfile`:**

```groovy
pipeline {
  agent any

  stages {
    stage('Test') {
      parallel {
        stage('Unit Tests') {
          steps {
            sh 'npm test -- --testPathPattern=unit'
          }
        }

        stage('Integration Tests') {
          steps {
            sh 'npm test -- --testPathPattern=integration'
          }
        }

        stage('E2E Tests') {
          steps {
            sh 'npm test -- --testPathPattern=e2e'
          }
        }
      }
    }
  }

  post {
    always {
      // Cleanup stale port allocations
      sh 'npx portres clean'
    }
  }
}
```

### Declarative Pipeline with Matrix

```groovy
pipeline {
  agent any

  stages {
    stage('Test') {
      matrix {
        axes {
          axis {
            name 'NODE_VERSION'
            values '18', '20', '22'
          }
          axis {
            name 'TEST_SUITE'
            values 'unit', 'integration', 'e2e'
          }
        }

        stages {
          stage('Run Tests') {
            steps {
              sh """
                export NODE_VERSION=${NODE_VERSION}
                export TEST_SUITE=${TEST_SUITE}
                npm test
              """
            }
          }
        }
      }
    }
  }
}
```

---

## Docker-Based CI

### Docker Compose

**`docker-compose.test.yml`:**

```yaml
version: '3.8'

services:
  test-runner-1:
    build: .
    command: npm test -- --shard=1/3
    volumes:
      - port-registry:/root/.portres
    environment:
      - SHARD_INDEX=1

  test-runner-2:
    build: .
    command: npm test -- --shard=2/3
    volumes:
      - port-registry:/root/.portres
    environment:
      - SHARD_INDEX=2

  test-runner-3:
    build: .
    command: npm test -- --shard=3/3
    volumes:
      - port-registry:/root/.portres
    environment:
      - SHARD_INDEX=3

volumes:
  port-registry:
```

**Key point:** Share the registry via named volume (`port-registry`).

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Create registry directory
RUN mkdir -p /root/.portres

CMD ["npm", "test"]
```

### Test Setup

```typescript
// test/setup.ts
import { PortResolver } from '@tuulbelt/test-port-resolver';

const resolver = new PortResolver({
  registryDir: '/root/.portres', // Shared volume mount point
});

const shardIndex = process.env.SHARD_INDEX || '1';

beforeAll(async () => {
  await resolver.clean();
});

beforeEach(async () => {
  const result = await resolver.get({
    tag: `docker-shard-${shardIndex}`,
  });

  if (result.ok) {
    global.testPort = result.value.port;
  }
});

afterAll(async () => {
  await resolver.releaseAll();
});
```

---

## Test Framework Integration

### Jest (Parallel Workers)

**`package.json`:**

```json
{
  "scripts": {
    "test": "jest --maxWorkers=4"
  }
}
```

**`jest.config.js`:**

```javascript
module.exports = {
  globalSetup: './test/global-setup.js',
  globalTeardown: './test/global-teardown.js',
};
```

**`test/global-setup.js`:**

```javascript
const { PortResolver } = require('@tuulbelt/test-port-resolver');

module.exports = async () => {
  const resolver = new PortResolver();

  // Clean stale entries before all tests
  await resolver.clean();
};
```

**`test/global-teardown.js`:**

```javascript
const { PortResolver } = require('@tuulbelt/test-port-resolver');

module.exports = async () => {
  const resolver = new PortResolver();

  // Release all ports allocated by this process
  await resolver.releaseAll();
};
```

**Test file:**

```typescript
import { PortResolver } from '@tuulbelt/test-port-resolver';

describe('API Tests', () => {
  const resolver = new PortResolver();
  let apiPort: number;

  beforeAll(async () => {
    const result = await resolver.get({ tag: 'api-server' });
    if (result.ok) {
      apiPort = result.value.port;
    }
  });

  afterAll(async () => {
    await resolver.releaseAll();
  });

  test('should start server on allocated port', async () => {
    // Use apiPort in test
  });
});
```

### Mocha (Parallel Mode)

**`package.json`:**

```json
{
  "scripts": {
    "test": "mocha --parallel --jobs 3"
  }
}
```

**`test/hooks.ts`:**

```typescript
import { PortManager } from '@tuulbelt/test-port-resolver';

const manager = new PortManager();

before(async function() {
  // Clean stale entries
  const resolver = manager['resolver']; // Access internal resolver
  await resolver.clean();
});

beforeEach(async function() {
  const testName = this.currentTest?.fullTitle() || 'unknown';
  await manager.allocate(testName);
});

after(async function() {
  await manager.releaseAll();
});

export { manager };
```

**Test file:**

```typescript
import { manager } from './hooks';

describe('API Tests', () => {
  it('should handle concurrent requests', async () => {
    const allocation = manager.get('API Tests should handle concurrent requests');
    const port = allocation?.port;

    // Use port in test
  });
});
```

### Vitest (Multi-Threading)

**`vitest.config.ts`:**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    globalTeardown: './test/global-teardown.ts',
    threads: true,
    maxThreads: 4,
  },
});
```

**`test/global-setup.ts`:**

```typescript
import { PortResolver } from '@tuulbelt/test-port-resolver';

export async function setup() {
  const resolver = new PortResolver();
  await resolver.clean();
}
```

**`test/global-teardown.ts`:**

```typescript
import { PortResolver } from '@tuulbelt/test-port-resolver';

export async function teardown() {
  const resolver = new PortResolver();
  await resolver.releaseAll();
}
```

---

## Troubleshooting

### Issue: "No available ports in range"

**Cause:** Port range exhausted or too narrow.

**Solution:**
```typescript
const resolver = new PortResolver({
  minPort: 50000,
  maxPort: 60000, // Increase range
});
```

### Issue: "Lock timeout exceeded"

**Cause:** High concurrency, semaphore timeout too short.

**Solution:**
```typescript
// Increase timeout (not recommended, investigate deadlock instead)
const resolver = new PortResolver({
  lockTimeout: 10000, // 10 seconds
});
```

Or investigate deadlock:
```bash
# Check registry status
npx portres status

# List all allocations
npx portres list

# Clean stale entries
npx portres clean
```

### Issue: Registry file not shared across jobs

**Cause:** Different registry directories.

**Solution (CI environment variable):**
```yaml
# In CI workflow
env:
  PORT_REGISTRY_DIR: /tmp/shared-portres
```

```typescript
const resolver = new PortResolver({
  registryDir: process.env.PORT_REGISTRY_DIR || '~/.portres/',
});
```

### Issue: Stale entries accumulate

**Cause:** Tests crash without cleanup.

**Solution:** Add pre-test cleanup:
```typescript
beforeAll(async () => {
  const resolver = new PortResolver();
  await resolver.clean(); // Remove entries older than staleTimeout
});
```

### Issue: Permission denied on registry directory

**Cause:** CI user doesn't have write access.

**Solution:**
```bash
# In CI setup
mkdir -p ~/.portres
chmod 700 ~/.portres
```

Or use custom directory:
```typescript
const resolver = new PortResolver({
  registryDir: '/tmp/portres', // World-writable location
});
```

---

## Performance Tips

### 1. Use Batch Allocation

**Instead of:**
```typescript
const port1 = await resolver.get();
const port2 = await resolver.get();
const port3 = await resolver.get();
```

**Do:**
```typescript
const ports = await resolver.getMultiple(3);
```

**Benefit:** Single lock acquisition instead of three.

### 2. Use Port Ranges Strategically

**Reserve contiguous ranges when needed:**
```typescript
// For microservices cluster
const cluster = await resolver.reserveRange({ start: 50000, count: 5 });
```

**Use bounded allocation for compliance:**
```typescript
// For firewall-restricted environments
const port = await resolver.getPortInRange({ min: 8000, max: 9000 });
```

### 3. Pre-allocate in Setup, Release in Teardown

**Pattern:**
```typescript
let testPorts: number[];

beforeAll(async () => {
  const result = await resolver.getMultiple(10); // Pre-allocate
  testPorts = result.ok ? result.value.map(p => p.port) : [];
});

afterAll(async () => {
  await resolver.releaseAll(); // Cleanup once
});
```

---

## Example: Complete GitHub Actions Setup

**`.github/workflows/test.yml`:**

```yaml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
        shard: [1, 2, 3]

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - run: npm ci

      - name: Setup port registry
        run: |
          mkdir -p ~/.portres
          chmod 700 ~/.portres

      - name: Run tests
        run: npm test -- --shard=${{ matrix.shard }}/3
        env:
          NODE_VERSION: ${{ matrix.node-version }}
          SHARD: ${{ matrix.shard }}

      - name: Cleanup (always run)
        if: always()
        run: npx portres clean
```

**`test/setup.ts`:**

```typescript
import { PortResolver } from '@tuulbelt/test-port-resolver';

const resolver = new PortResolver();
const nodeVersion = process.env.NODE_VERSION || 'unknown';
const shard = process.env.SHARD || '1';

beforeAll(async () => {
  await resolver.clean();
});

beforeEach(async () => {
  const result = await resolver.get({
    tag: `node${nodeVersion}-shard${shard}`,
  });

  if (result.ok) {
    global.testPort = result.value.port;
  } else {
    throw new Error(`Failed to allocate port: ${result.error.message}`);
  }
});

afterAll(async () => {
  await resolver.releaseAll();
});
```

---

## Summary

**Key Takeaways:**
- ✅ Port Resolver eliminates port conflicts in parallel CI jobs
- ✅ Shared registry enables cross-process coordination
- ✅ Works with all major CI platforms (GitHub Actions, GitLab, CircleCI, Jenkins)
- ✅ Integrates with all major test frameworks (Jest, Mocha, Vitest)
- ✅ Always clean stale entries in setup, release all in teardown
- ✅ Use tags for debugging and traceability
- ✅ Pre-allocate in batches for better performance

**Next Steps:**
- See `examples/ci-integration.ts` for runnable code
- See `SPEC.md` for complete API documentation
- See `README.md` for quick start guide

---

**Last Updated:** 2026-01-10
**Version:** v0.2.0
