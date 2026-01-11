/**
 * Port availability checking utilities
 */

import { createServer, type Server } from 'node:net';
import type { Result, PortConfig } from '../types.js';

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
