/**
 * PUA Quality Engine — core types and constants.
 *
 * This module defines the type system and constant data for the PUA
 * (Performance Under Accountability) quality engine layer. All exports
 * are pure types or immutable constants — no runtime logic lives here
 * until the function implementations in subsequent tasks.
 *
 * Design reference: pua-quality-engine § pua-engine.ts
 * **Validates: Requirements 1.1, 2.1, 3.1, 4.9, 4.10**
 */
/** Pressure level — escalates with consecutive failures. */
export type PressureLevel = "L0" | "L1" | "L2" | "L3" | "L4";
/**
 * Methodology identifier.
 *
 * Each methodology maps to a well-known engineering framework distilled
 * from major tech companies' best practices.
 */
export type Methodology = "huawei-rca" | "musk-algorithm" | "baidu-search" | "amazon-backwards" | "bytedance-ab" | "alibaba-closure" | "netflix-keeper" | "jobs-a-player";
/**
 * Failure pattern identifier.
 *
 * Six common "laziness modes" detected via keyword analysis of iteration
 * summaries. Each pattern has a dedicated counter-instruction and a
 * methodology switch chain.
 */
export type FailurePattern = "spinning" | "giving-up" | "low-quality" | "guessing" | "passive-waiting" | "empty-claim";
/** Task type identifier — drives initial methodology selection. */
export type TaskType = "debug" | "build" | "research" | "architecture" | "performance" | "review" | "deploy" | "general";
/** Stall response strategy — escalates with consecutive failures. */
export type StallResponse = "remind" | "reassess" | "force-pivot";
/** PUA context passed to ContextAccumulator for prompt injection. */
export interface PuaContext {
    pressureLevel: PressureLevel;
    methodology: Methodology | null;
    failurePattern: FailurePattern | null;
    stallResponse: StallResponse | null;
    pressurePrompt: string;
}
/**
 * Three Red Lines — behavioral constraints present at ALL pressure levels.
 *
 * 1. Closed-loop verification: must run verification commands and paste
 *    output before claiming done.
 * 2. Fact-driven: unverified attribution is not diagnosis.
 * 3. Exhaust everything: completing the universal methodology 5 steps
 *    before giving up is mandatory.
 */
export declare const THREE_RED_LINES = "## Three Red Lines\n\n1. **Closed-loop verification**: Before claiming any task is done you MUST run verification commands (build, test, curl, etc.) and paste the output as evidence. \"I believe it works\" is not evidence.\n2. **Fact-driven**: Unverified attribution is not diagnosis. Every claim must be backed by tool output, search results, or source code evidence.\n3. **Exhaust everything**: You are forbidden from saying \"I cannot solve this\" until you have completed all 5 steps of the Universal Methodology. No giving up early.";
/**
 * Proactivity guidance — behavioral expectations present at ALL pressure
 * levels. Distinguishes passive (3.25) from proactive (3.75) behavior.
 */
export declare const PROACTIVITY_GUIDANCE = "## Proactivity Guidance\n\nYour level of initiative determines your performance rating. Passive waiting = 3.25, proactive initiative = 3.75.\n\n- After fixing a bug, scan the same module for similar bugs and related patterns in other files.\n- After completing a task, run build/test and paste the output. Check edge cases and report potential risks.\n- When information is insufficient, use tools to investigate first. Exhaust what you can find before asking the user. Attach evidence of what you already checked.";
/**
 * Universal Methodology — 5-step problem-solving framework injected at
 * L2+ pressure levels.
 */
export declare const UNIVERSAL_METHODOLOGY = "## Universal Methodology (5 Steps)\n\n### Step 1: Smell the Problem\nStop. List every approach you have tried and find the common pattern. If you have been making minor tweaks within the same line of thinking, you are spinning your wheels.\n\n### Step 2: Elevate \u2014 Raise Your Perspective\nExecute 5 dimensions in order:\n1. Read failure signals word by word \u2014 do not skim.\n2. Proactively search the complete error message, official docs, and Issues.\n3. Read the raw material \u2014 50 lines of context around the error, official documentation verbatim.\n4. Verify underlying assumptions \u2014 version, path, permissions, dependencies \u2014 confirm them all.\n5. Invert your assumptions \u2014 assume \"the problem is NOT in A\" and investigate from the opposite direction.\n\n### Step 3: Mirror Check \u2014 Self-Inspection\n- Are you repeating variants of the same approach?\n- Are you only looking at surface symptoms without finding the root cause?\n- Should you have searched but did not? Should you have read the file but did not?\n\n### Step 4: Execute the New Approach\nEvery new approach must be: fundamentally different + have a verification criterion + produce new information upon failure.\n\n### Step 5: Retrospective\nWhich approach solved it? Why did you not think of it earlier? After solving, do not stop \u2014 check for similar issues, fix completeness, preventive measures.";
/**
 * 7-Point Checklist — mandatory diagnostic checklist injected at L3+
 * pressure levels.
 */
export declare const SEVEN_POINT_CHECKLIST = "## 7-Point Diagnostic Checklist (mandatory)\n\n- [ ] **Read failure signals**: Did you read them word by word?\n- [ ] **Proactive search**: Did you use tools to search the core problem?\n- [ ] **Read raw material**: Did you read the original context around the failure?\n- [ ] **Verify underlying assumptions**: Did you confirm all assumptions with tools?\n- [ ] **Invert assumptions**: Did you try the exact opposite hypothesis from your current direction?\n- [ ] **Minimal isolation**: Can you isolate/reproduce the problem in the smallest possible scope?\n- [ ] **Change direction**: Did you switch tools, methods, angles, or tech stacks? (Not switching parameters \u2014 switching your thinking)";
/**
 * Proactive Initiative Checklist — mandatory self-check injected at L3+
 * pressure levels via ContextAccumulator.
 */
export declare const PROACTIVE_INITIATIVE_CHECKLIST = "## Proactive Initiative Checklist (mandatory self-check)\n\n- [ ] Has the fix been verified? (run tests, curl verification, actual execution \u2014 not \"I think it works\")\n- [ ] Did you run build/test after code changes and paste the output?\n- [ ] Are there similar issues in the same file/module?\n- [ ] Are upstream/downstream dependencies affected?\n- [ ] Are there uncovered edge cases?\n- [ ] Are there better approaches you overlooked?\n- [ ] Did you proactively fill in parts the user did not explicitly specify?";
/**
 * Core step descriptions for each methodology, injected into the pressure
 * prompt when a methodology is active.
 */
export declare const METHODOLOGY_DESCRIPTIONS: Record<Methodology, string>;
/**
 * Determine the pressure level based on consecutive failures and stall detection.
 *
 * Mapping rules:
 * - 0-1 failures → L0 (Trust)
 * - 2 failures   → L1 (温和失望)
 * - 3 failures   → L2 (灵魂拷问)
 * - 4 failures   → L3 (绩效审视)
 * - 5+ failures  → L4 (毕业警告)
 *
 * Note: The L4 threshold (5 consecutive failures for max pressure) is
 * intentionally higher than the Circuit Breaker threshold (3 consecutive
 * failures for termination). PUA L1–L3 escalate warnings and switch
 * methodologies before the Circuit Breaker trips at 3 failures. L4 is
 * reached only if the Circuit Breaker is configured with a higher threshold.
 *
 * @see src/failure-handler.ts DEFAULT_CIRCUIT_BREAKER_THRESHOLD — Circuit Breaker termination threshold
 *
 * When `stallDetected` is true, the level is promoted by at least one step
 * (capped at L4).
 *
 * Negative input is treated as 0 (defensive handling).
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**
 *
 * @param consecutiveFailures - Non-negative integer of consecutive failures
 * @param stallDetected - Whether a stall (spinning) pattern was detected
 * @returns The corresponding pressure level
 */
export declare function determinePressureLevel(consecutiveFailures: number, stallDetected: boolean): PressureLevel;
/**
 * Select the recommended methodology for a given task type.
 *
 * Known task types are mapped to their optimal methodology. Any unknown
 * string falls back to `alibaba-closure` (the general-purpose closure
 * methodology).
 *
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**
 *
 * @param taskType - A known `TaskType` or arbitrary string
 * @returns The recommended methodology
 */
export declare function selectMethodology(taskType: TaskType | string): Methodology;
/**
 * Get the ordered methodology switch chain for a failure pattern.
 *
 * Each failure pattern has a pre-defined sequence of methodologies to try
 * in order. The chain is designed so the most targeted methodology comes
 * first, broadening with each step.
 *
 * **Validates: Requirements 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15**
 *
 * @param failurePattern - The detected failure pattern
 * @returns An ordered array of methodologies to try
 */
export declare function getMethodologyChain(failurePattern: FailurePattern): Methodology[];
/**
 * Advance to the next methodology in a switch chain.
 *
 * Returns the methodology at `currentIndex + 1` if the chain has more
 * entries, or `null` when the chain is exhausted.
 *
 * **Validates: Requirements 2.16**
 *
 * @param chain - The methodology switch chain
 * @param currentIndex - The current position in the chain
 * @returns The next methodology, or `null` if the chain is exhausted
 */
export declare function advanceMethodology(chain: Methodology[], currentIndex: number): Methodology | null;
export declare const FAILURE_PATTERN_COUNTERS: Record<FailurePattern, string>;
/**
 * Jaccard similarity threshold for spinning detection.
 *
 * When all pairwise Jaccard similarities among the last 3 iteration
 * summaries exceed this value, the engine flags a "spinning" pattern
 * (repeatedly tweaking the same spot without real progress).
 *
 * Valid range: (0, 1) exclusive — 0 would flag everything, 1 would
 * never flag.
 */
export declare const SPINNING_JACCARD_THRESHOLD = 0.6;
/**
 * Maximum number of recent iteration summaries retained for failure
 * pattern detection.
 *
 * The PUA engine keeps a sliding window of the most recent summaries
 * so that `detectFailurePattern` can analyse trends (e.g. spinning
 * detection requires at least 3 entries). Older entries are discarded
 * to bound memory usage and keep pattern detection focused on the
 * current problem-solving trajectory.
 */
export declare const MAX_SUMMARY_HISTORY = 5;
/**
 * Detect the failure pattern from recent iteration summaries.
 *
 * Detection priority (highest first):
 * 1. **spinning** — last 3 summaries' keyword overlap rate > 60%
 * 2. **giving-up** — last summary contains give-up/blame keywords
 * 3. **empty-claim** — last summary contains completion keywords without verification keywords
 * 4. **passive-waiting** — last summary contains waiting keywords without evidence keywords
 * 5. **guessing** — last summary contains guessing keywords without search evidence keywords
 * 6. **null** — no known pattern detected
 *
 * Empty array returns null. Spinning requires at least 3 summaries.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 *
 * @param summaryHistory - Array of summary strings (most recent at end)
 * @returns The detected failure pattern, or null
 */
export declare function detectFailurePattern(summaryHistory: string[]): FailurePattern | null;
/**
 * Get the stall response strategy based on consecutive failure count.
 *
 * Mapping:
 * - 1-2 failures → "remind" (suggest switching approach)
 * - 3-4 failures → "reassess" (re-read output, list 3 different hypotheses)
 * - 5+ failures  → "force-pivot" (fall back to questioning the requirement)
 * - 0 or negative → "remind" (defensive default)
 *
 * **Validates: Requirements 3.8, 3.9, 3.10, 3.11**
 *
 * @param consecutiveFailures - Number of consecutive failures
 * @returns The stall response strategy
 */
export declare function getStallResponse(consecutiveFailures: number): StallResponse;
/**
 * Build a structured pressure prompt based on the current PUA engine state.
 *
 * Pressure prompt content is **monotonically increasing** — higher levels
 * include ALL content from lower levels plus additional instructions:
 *
 * - **L0**: THREE_RED_LINES + PROACTIVITY_GUIDANCE (base layer)
 * - **L1**: + "Switch to a fundamentally different approach" instruction
 * - **L2**: + "Search complete error message + read related source code +
 *            list 3 fundamentally different hypotheses" instruction +
 *            UNIVERSAL_METHODOLOGY (5 steps)
 * - **L3**: + SEVEN_POINT_CHECKLIST + UNIVERSAL_METHODOLOGY (5 steps)
 * - **L4**: + "Desperation mode: minimal PoC + isolated environment +
 *            completely different tech stack" instruction +
 *            UNIVERSAL_METHODOLOGY (5 steps)
 *
 * Context injection:
 * - When `methodology` is not null, injects `METHODOLOGY_DESCRIPTIONS[methodology]`
 * - When `failurePattern` is not null, injects `FAILURE_PATTERN_COUNTERS[failurePattern]`
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10**
 *
 * @param level - Current pressure level
 * @param methodology - Current methodology (may be null)
 * @param failurePattern - Current failure pattern (may be null)
 * @param _stallResponse - Current stall response strategy (may be null)
 * @returns Structured pressure prompt text
 */
export declare function buildPressurePrompt(level: PressureLevel, methodology: Methodology | null, failurePattern: FailurePattern | null, _stallResponse: StallResponse | null): string;
