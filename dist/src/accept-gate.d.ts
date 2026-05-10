/**
 * Forced Acceptance gate — determines whether ship should be blocked
 * based on pack-driven context-level acceptance requirements.
 *
 * @public
 */
import type { EnabledPacks } from "./pack/types.js";
/** Input to the acceptance gate check. */
export interface AcceptGateInput {
    /** Current spec being shipped. */
    spec: {
        filePath: string;
        frontmatter: Record<string, unknown>;
        body: string;
    };
    /** Project-level enabled packs. */
    enabledPacks: EnabledPacks;
    /** Path to acceptance artifact, or null if not run. */
    acceptanceArtifactPath: string | null;
    /** Content of the acceptance artifact (when path is non-null). */
    artifactContent?: string;
}
/** Decision from the acceptance gate. */
export interface AcceptGateDecision {
    /** Whether ship should be blocked. */
    block: boolean;
    /** Reason for blocking (when block=true). */
    reason?: string;
    /** Non-blocking warning. */
    warning?: string;
}
/**
 * Determine whether ship should be blocked by forced acceptance requirements.
 *
 * Logic:
 * 1. Read spec context from frontmatter; null → no-block
 * 2. Union forced_acceptance_contexts from all enabled packs
 * 3. If context not in forced list → no-block
 * 4. If spec has no ## Scenarios → no-block + warning
 * 5. No artifact → block ("acceptance 未运行")
 * 6. Artifact with fail > 0 → block
 * 7. Otherwise → no-block
 *
 * @example
 * ```ts
 * const decision = shouldBlockShip({ spec, enabledPacks, acceptanceArtifactPath: null });
 * if (decision.block) {
 *   console.error(decision.reason);
 * }
 * ```
 * @public
 */
export declare function shouldBlockShip(input: AcceptGateInput): AcceptGateDecision;
