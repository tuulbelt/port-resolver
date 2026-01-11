/**
 * Configuration defaults and constants
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import type { PortConfig } from './types.js';

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

/** Dangerous path patterns to reject */
export const DANGEROUS_PATH_PATTERNS = ['..', '\x00'];

/** Characters to remove from tags (control chars, newlines) */
export const TAG_CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/** Maximum tag length */
export const MAX_TAG_LENGTH = 256;

/** Registry version */
export const REGISTRY_VERSION = 1;
