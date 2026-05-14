/**
 * Handoff document system — preserves decisions, rationale, and context
 * across stage transitions in the Forge pipeline.
 *
 * Each completing stage produces
 * a handoff document before transitioning, so the next stage starts with
 * full context instead of re-discovering or re-debating settled decisions.
 *
 * Handoff documents live in `.forge/handoffs/<from>-to-<to>.md`.
 *
 * Design principles:
 *   - Handoffs are lightweight (10-20 lines of decisions, not full specs)
 *   - Handoffs accumulate (later stages can read all prior handoffs)
 *   - Handoffs survive task cancellation (not deleted by /forge abort)
 *   - Each handoff has a fixed structure: decided / rejected / risks / artifacts / remaining
 */
export interface HandoffEntry {
    /** What was decided in this stage. */
    decided: string[];
    /** Alternatives considered and why they were rejected. */
    rejected: string[];
    /** Identified risks for the next stage. */
    risks: string[];
    /** Key files created or modified. */
    artifacts: string[];
    /** Items left for the next stage to handle. */
    remaining: string[];
}
export interface HandoffDocument {
    /** Stage that produced this handoff. */
    fromStage: string;
    /** Stage that should consume this handoff. */
    toStage: string;
    /** ISO timestamp of when the handoff was created. */
    createdAt: string;
    /** The handoff content. */
    entry: HandoffEntry;
}
export declare const STAGE_TRANSITIONS: ReadonlyArray<[string, string]>;
/**
 * Validate a handoff entry has meaningful content.
 *
 * Rules:
 *   - `decided` must have at least one entry (a stage that decided nothing is suspicious)
 *   - `rejected` can be empty (not every stage rejects alternatives)
 *   - `risks` can be empty (not every stage identifies risks)
 *   - `artifacts` can be empty (some stages don't produce files)
 *   - `remaining` can be empty (last stage has nothing remaining)
 *   - No field can contain empty strings
 */
export declare function validateHandoffEntry(entry: HandoffEntry): {
    valid: boolean;
    errors: string[];
};
/**
 * Validate a stage transition is a known valid transition.
 */
export declare function isValidTransition(from: string, to: string): boolean;
/**
 * Generate the file path for a handoff document.
 */
export declare function handoffPath(from: string, to: string): string;
/**
 * Render a handoff document to markdown format.
 *
 * Output format:
 * ```
 * ---
 * from: "decide"
 * to: "spec"
 * created: "2025-01-15T14:30:00Z"
 * ---
 *
 * ## Handoff: decide → spec
 *
 * ### Decided
 * - ...
 *
 * ### Rejected
 * - ...
 *
 * ### Risks
 * - ...
 *
 * ### Artifacts
 * - ...
 *
 * ### Remaining
 * - ...
 * ```
 */
export declare function renderHandoff(doc: HandoffDocument): string;
/**
 * Parse a rendered handoff markdown back into a HandoffDocument.
 * Returns null if the content is not a valid handoff document.
 */
export declare function parseHandoff(content: string): HandoffDocument | null;
/**
 * Collect all prior handoffs for a given stage.
 *
 * For example, if the current stage is "build", this returns handoffs from:
 *   - decide-to-spec.md
 *   - spec-to-plan.md
 *   - plan-to-build.md
 *
 * This allows the build stage to see the full decision history.
 */
export declare function priorHandoffPaths(currentStage: string): string[];
