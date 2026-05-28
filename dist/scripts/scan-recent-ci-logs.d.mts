#!/usr/bin/env node
/**
 * @param {string[]} argv
 * @returns {{ repo: string, count: number, branch: string|null, writeHealth: boolean, help: boolean }}
 */
export function parseArgs(argv: string[]): {
    repo: string;
    count: number;
    branch: string | null;
    writeHealth: boolean;
    help: boolean;
};
/**
 * @param {number} runId
 * @param {string} log
 * @returns {Array<{ run_id: number, pattern: string, log_line: string }>}
 */
export function matchPatterns(runId: number, log: string): Array<{
    run_id: number;
    pattern: string;
    log_line: string;
}>;
/**
 * @param {Array<{ databaseId: number, status: string, conclusion: string, headBranch: string, createdAt: string, event: string }>} runs
 * @param {Array<{ run_id: number, pattern: string, log_line: string }>} allMatches
 * @returns {{ scanned_runs: number, failed_runs: number, matched_patterns: Array, pattern_counts: Record<string, number> }}
 */
export function buildSummary(runs: Array<{
    databaseId: number;
    status: string;
    conclusion: string;
    headBranch: string;
    createdAt: string;
    event: string;
}>, allMatches: Array<{
    run_id: number;
    pattern: string;
    log_line: string;
}>): {
    scanned_runs: number;
    failed_runs: number;
    matched_patterns: any[];
    pattern_counts: Record<string, number>;
};
/** @type {string[]} */
export const CRITICAL_PATTERNS: string[];
