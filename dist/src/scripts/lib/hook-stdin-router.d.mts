#!/usr/bin/env node
/**
 * Classify hook caller based on stdin JSON.
 * Never throws — all errors go to fail-safe (callerKind "unknown").
 *
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=500]
 * @param {number} [opts.maxBytes=65536]
 * @param {string} [opts._testStdin] - Test override: raw JSON string to parse instead of reading stdin
 * @returns {Promise<RouterDecision>}
 */
export function classifyHookCaller(opts?: {
    timeoutMs?: number | undefined;
    maxBytes?: number | undefined;
    _testStdin?: string | undefined;
}): Promise<RouterDecision>;
/**
 * Convenience: returns true when caller is NOT main agent (subagent or unknown).
 * Use at hook script entry for early short-circuit:
 *   if (await shouldSkipForSubagent()) process.exit(0);
 *
 * @param {Object} [opts]
 * @returns {Promise<boolean>}
 */
export function shouldSkipForSubagent(opts?: Object): Promise<boolean>;
export type CallerKind = "main" | "subagent" | "unknown";
export type RouterDecision = {
    shouldInject: boolean;
    callerKind: CallerKind;
    agentType?: string;
};
