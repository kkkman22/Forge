/**
 * Unchanged → PBT derivation — derives regression-test tasks from Unchanged
 * clauses in a bugfix spec.
 * Also: §2.4 three-strike reroute — fail_signature + triggerThreeStrikeReroute.
 *
 * Validates: Requirement 15, Property 11
 */
import type { SpecBundle, TaskSeed } from "./spec-bundle.js";
/**
 * Derive regression-test tasks from the Unchanged Behavior section of a bugfix spec.
 * Each unchanged clause produces exactly one task (Property 11).
 */
export declare function derivePbtTasksFromUnchanged(bundle: SpecBundle): TaskSeed[];
export interface FixFailure {
    testName: string;
    firstLine: string;
}
export interface ThreeStrikeResult {
    reroute: boolean;
    failSignature: string;
    failures: FixFailure[];
}
/**
 * Compute a fail_signature from repeated test failures.
 * Signature = SHA1(sorted unique test_name + first_line pairs).
 */
export declare function computeFailSignature(failures: FixFailure[]): string;
/**
 * Trigger §2.4 three-strike reroute when same fail_signature appears 3+ times.
 * Returns the reroute decision and accumulated failures.
 */
export declare function triggerThreeStrikeReroute(history: FixFailure[], currentFailure: FixFailure): ThreeStrikeResult;
