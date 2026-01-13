/**
 * Path and tag validation utilities
 */
import { resolve, normalize } from 'node:path';
import { DANGEROUS_PATH_PATTERNS, TAG_CONTROL_CHARS, MAX_TAG_LENGTH } from '../config.js';
/**
 * Sanitize a tag string for safe storage
 */
export function sanitizeTag(tag) {
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
export function validatePath(pathStr) {
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
//# sourceMappingURL=path-validation.js.map