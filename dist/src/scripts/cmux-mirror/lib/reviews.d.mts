/**
 * Parse YAML frontmatter from a review progress file.
 * Returns the parsed frontmatter object, or {} on error (R15.7).
 */
export function parseReviewFrontmatter(filePath: any): any;
/**
 * Check if a review is complete: all layers done + completed_at is set.
 */
export function isReviewComplete(fm: any): boolean;
