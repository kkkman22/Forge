#!/usr/bin/env node
/**
 * Count files in a `git diff --stat` output.
 * @param {string} stat - The raw stat string.
 * @returns {number}
 */
export function parseFileCount(stat: string): number;
/**
 * Extract `{added, removed}` from the summary line of a `git diff --stat` output.
 * Tolerates singular forms (1 insertion(+)) and missing halves.
 * @param {string} stat
 * @returns {{added: number, removed: number}}
 */
export function parseAddedRemoved(stat: string): {
    added: number;
    removed: number;
};
/**
 * Render the `.diff-context.md` frontmatter block from structured input.
 * @param {Object} input
 * @param {string} input.base
 * @param {string} input.head
 * @param {number} input.fileCount
 * @param {number} input.totalAdded
 * @param {number} input.totalRemoved
 * @param {boolean} input.truncated
 * @param {string} input.source
 * @returns {string} Block including delimiters and trailing newline.
 */
export function formatFrontmatter(input: {
    base: string;
    head: string;
    fileCount: number;
    totalAdded: number;
    totalRemoved: number;
    truncated: boolean;
    source: string;
}): string;
