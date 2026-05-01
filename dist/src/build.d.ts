/**
 * Build engine — core logic extracted from forge-build/SKILL.md.
 *
 * Implements:
 *   - checkBuildGate:       Verifies Spec is locked AND Plan is approved before build
 *   - trackFixAttempts:     Tracks consecutive fix failures and triggers escalation
 *   - shouldEscalateToDebug: Determines if 3 consecutive failures have been reached
 *
 * Gate check (Property 8):
 *   Build is allowed ONLY when spec.status === "locked" AND plan.status === "approved".
 *   Any other combination → blocked with a specific reason.
 *
 * Consecutive failure escalation (Property 10):
 *   When the same fix fails 3 consecutive times → system stops and escalates to /forge debug.
 *   Fewer than 3 consecutive failures → continues normally.
 */
export type SpecStatus = "draft" | "locked";
export type PlanStatus = "draft" | "approved";
export interface BuildGateResult {
    allowed: boolean;
    reasons: string[];
}
export type FixAttemptResult = "success" | "failure";
export interface FixAttemptSequence {
    attempts: FixAttemptResult[];
}
export interface EscalationResult {
    shouldEscalate: boolean;
    consecutiveFailures: number;
    /** Index in the sequence where escalation is first triggered (0-based), or -1 if no escalation. */
    escalationIndex: number;
}
/**
 * Check whether `/forge build` is allowed to proceed.
 *
 * Per SKILL.md §前置检查 and design Property 8:
 *   - Spec must be "locked"
 *   - Plan must be "approved"
 *   - Both conditions must be true simultaneously
 *
 * Returns { allowed, reasons } where reasons lists all unmet conditions.
 */
export declare function checkBuildGate(specStatus: SpecStatus, planStatus: PlanStatus): BuildGateResult;
/**
 * Analyze a sequence of fix attempts and determine if escalation is needed.
 *
 * Per SKILL.md §失败处理 and design Property 10:
 *   - 3 consecutive failures → stop and escalate to /forge debug
 *   - A success resets the consecutive failure counter
 *   - Less than 3 consecutive failures → continue
 *
 * Returns { shouldEscalate, consecutiveFailures, escalationIndex }.
 */
export declare function analyzeFixAttempts(sequence: FixAttemptSequence): EscalationResult;
/**
 * Convenience function: given a sequence, should we escalate to /forge debug?
 *
 * Returns true if 3 or more consecutive failures are found anywhere in the sequence.
 */
export declare function shouldEscalateToDebug(sequence: FixAttemptSequence): boolean;
import type { SubagentInvocation, SubagentResult } from "./loop-types.js";
/**
 * Build one SubagentInvocation per research topic.
 *
 * Each subagent investigates a single research topic independently.
 */
export declare function buildResearchSubagents(topics: string[]): SubagentInvocation[];
/**
 * Merge successful research subagent outputs into a single findings document.
 *
 * All findings from every successful subagent are preserved with no loss.
 * Failed subagents are noted in the document.
 */
export declare function mergeResearchFindings(results: SubagentResult[]): string;
