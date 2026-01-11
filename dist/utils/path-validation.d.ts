/**
 * Path and tag validation utilities
 */
import type { Result } from '../types.js';
/**
 * Sanitize a tag string for safe storage
 */
export declare function sanitizeTag(tag: string | undefined): string | undefined;
/**
 * Validate a path for security issues
 */
export declare function validatePath(pathStr: string): Result<string>;
//# sourceMappingURL=path-validation.d.ts.map