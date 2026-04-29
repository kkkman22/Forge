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
// ---------------------------------------------------------------------------
// Constants — Behavioral constraints
// ---------------------------------------------------------------------------
/**
 * Three Red Lines — behavioral constraints present at ALL pressure levels.
 *
 * 1. Closed-loop verification: must run verification commands and paste
 *    output before claiming done.
 * 2. Fact-driven: unverified attribution is not diagnosis.
 * 3. Exhaust everything: completing the universal methodology 5 steps
 *    before giving up is mandatory.
 */
export const THREE_RED_LINES = `## Three Red Lines

1. **Closed-loop verification**: Before claiming any task is done you MUST run verification commands (build, test, curl, etc.) and paste the output as evidence. "I believe it works" is not evidence.
2. **Fact-driven**: Unverified attribution is not diagnosis. Every claim must be backed by tool output, search results, or source code evidence.
3. **Exhaust everything**: You are forbidden from saying "I cannot solve this" until you have completed all 5 steps of the Universal Methodology. No giving up early.`;
/**
 * Proactivity guidance — behavioral expectations present at ALL pressure
 * levels. Distinguishes passive (3.25) from proactive (3.75) behavior.
 */
export const PROACTIVITY_GUIDANCE = `## Proactivity Guidance

Your level of initiative determines your performance rating. Passive waiting = 3.25, proactive initiative = 3.75.

- After fixing a bug, scan the same module for similar bugs and related patterns in other files.
- After completing a task, run build/test and paste the output. Check edge cases and report potential risks.
- When information is insufficient, use tools to investigate first. Exhaust what you can find before asking the user. Attach evidence of what you already checked.`;
/**
 * Universal Methodology — 5-step problem-solving framework injected at
 * L2+ pressure levels.
 */
export const UNIVERSAL_METHODOLOGY = `## Universal Methodology (5 Steps)

### Step 1: Smell the Problem
Stop. List every approach you have tried and find the common pattern. If you have been making minor tweaks within the same line of thinking, you are spinning your wheels.

### Step 2: Elevate — Raise Your Perspective
Execute 5 dimensions in order:
1. Read failure signals word by word — do not skim.
2. Proactively search the complete error message, official docs, and Issues.
3. Read the raw material — 50 lines of context around the error, official documentation verbatim.
4. Verify underlying assumptions — version, path, permissions, dependencies — confirm them all.
5. Invert your assumptions — assume "the problem is NOT in A" and investigate from the opposite direction.

### Step 3: Mirror Check — Self-Inspection
- Are you repeating variants of the same approach?
- Are you only looking at surface symptoms without finding the root cause?
- Should you have searched but did not? Should you have read the file but did not?

### Step 4: Execute the New Approach
Every new approach must be: fundamentally different + have a verification criterion + produce new information upon failure.

### Step 5: Retrospective
Which approach solved it? Why did you not think of it earlier? After solving, do not stop — check for similar issues, fix completeness, preventive measures.`;
/**
 * 7-Point Checklist — mandatory diagnostic checklist injected at L3+
 * pressure levels.
 */
export const SEVEN_POINT_CHECKLIST = `## 7-Point Diagnostic Checklist (mandatory)

- [ ] **Read failure signals**: Did you read them word by word?
- [ ] **Proactive search**: Did you use tools to search the core problem?
- [ ] **Read raw material**: Did you read the original context around the failure?
- [ ] **Verify underlying assumptions**: Did you confirm all assumptions with tools?
- [ ] **Invert assumptions**: Did you try the exact opposite hypothesis from your current direction?
- [ ] **Minimal isolation**: Can you isolate/reproduce the problem in the smallest possible scope?
- [ ] **Change direction**: Did you switch tools, methods, angles, or tech stacks? (Not switching parameters — switching your thinking)`;
/**
 * Proactive Initiative Checklist — mandatory self-check injected at L3+
 * pressure levels via ContextAccumulator.
 */
export const PROACTIVE_INITIATIVE_CHECKLIST = `## Proactive Initiative Checklist (mandatory self-check)

- [ ] Has the fix been verified? (run tests, curl verification, actual execution — not "I think it works")
- [ ] Did you run build/test after code changes and paste the output?
- [ ] Are there similar issues in the same file/module?
- [ ] Are upstream/downstream dependencies affected?
- [ ] Are there uncovered edge cases?
- [ ] Are there better approaches you overlooked?
- [ ] Did you proactively fill in parts the user did not explicitly specify?`;
// ---------------------------------------------------------------------------
// Constants — Methodology descriptions
// ---------------------------------------------------------------------------
/**
 * Core step descriptions for each methodology, injected into the pressure
 * prompt when a methodology is active.
 */
export const METHODOLOGY_DESCRIPTIONS = {
    "huawei-rca": [
        "### Methodology: Huawei RCA (5-Why Root-Cause Analysis)",
        "1. Ask WHY five times to drill past symptoms to the root cause.",
        "2. Focus all energy on this single problem — 力出一孔 (concentrate force).",
        "3. After every change, run verification. No untested changes.",
        "4. Blue-team yourself: assume your fix is wrong and try to break it.",
        "5. Document the causal chain from root cause to symptom.",
    ].join("\n"),
    "musk-algorithm": [
        "### Methodology: Musk Algorithm (5-Step)",
        "1. **Question the requirement** — Is this requirement actually necessary? Remove any that came from assumptions.",
        "2. **Delete** — Remove unnecessary parts, processes, or components. If you are not adding back 10% of what you deleted, you are not deleting enough.",
        "3. **Simplify** — Only after deleting. Do not optimize what should not exist.",
        "4. **Accelerate** — Speed up the cycle time of what remains.",
        "5. **Automate** — Only after steps 1-4. Automating waste is worse than not automating.",
    ].join("\n"),
    "baidu-search": [
        "### Methodology: Search Before Everything",
        "1. Search the complete error message verbatim — not a paraphrase.",
        "2. Search official documentation for the specific API/config/tool involved.",
        "3. Search GitHub Issues and Stack Overflow for the exact version you are using.",
        "4. Read at least 3 different sources before forming a hypothesis.",
        "5. Cite your sources. Information retrieval is your baseline capability.",
    ].join("\n"),
    "amazon-backwards": [
        "### Methodology: Amazon Working Backwards (PR/FAQ)",
        "1. Start from the desired end state — what does 'done' look like?",
        "2. Write the press release first: who benefits, what changed, why it matters.",
        "3. Write the FAQ: what can go wrong, what are the edge cases, what are the dependencies.",
        "4. Work backwards from the end state to the current state, identifying each gap.",
        "5. Address gaps in priority order — highest customer impact first.",
    ].join("\n"),
    "bytedance-ab": [
        "### Methodology: ByteDance A/B Test (Data-Driven)",
        "1. Always Day 1 — question existing assumptions with fresh eyes.",
        "2. Formulate a testable hypothesis before making changes.",
        "3. Measure before and after — use concrete metrics, not feelings.",
        "4. Context, not control — understand the full context before deciding.",
        "5. If you cannot measure the improvement, you cannot claim it.",
    ].join("\n"),
    "alibaba-closure": [
        "### Methodology: Alibaba Closure (Goal → Process → Result)",
        "1. **Set the goal** — What is the concrete, measurable definition of done?",
        "2. **Track the process** — Break the goal into verifiable steps. Execute each one.",
        "3. **Deliver the result** — Verify the result matches the goal. Paste evidence.",
        "4. **Close the loop** — No open threads. Every action has a verified outcome.",
        "5. Granularity matters — pull the granularity fine enough that every step is checkable.",
    ].join("\n"),
    "netflix-keeper": [
        "### Methodology: Netflix Keeper Test",
        "1. Evaluate each approach honestly: if this approach offered to resign, would you fight to keep it?",
        "2. Adequate performance gets a generous severance — do not settle for 'good enough'.",
        "3. Cut approaches that are not working. Sunk cost is not a reason to continue.",
        "4. Concentrate resources on the most promising direction.",
        "5. Density of quality matters more than quantity of attempts.",
    ].join("\n"),
    "jobs-a-player": [
        "### Methodology: Jobs A-Player Standard",
        "1. A players hire A players. B players hire C players. Your output reveals your level.",
        "2. Subtraction first — remove everything that is not essential before adding.",
        "3. Pixel-perfect execution — every detail matters. 'Close enough' is not enough.",
        "4. You are the DRI (Directly Responsible Individual). No delegation, no excuses.",
        "5. Ship it when it is right, not when it is convenient.",
    ].join("\n"),
};
// ---------------------------------------------------------------------------
// Constants — Failure pattern counters
// ---------------------------------------------------------------------------
/**
 * Counter-instructions for each failure pattern, injected into the pressure
 * prompt when a failure pattern is detected.
 */
// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------
/**
 * Ordered pressure levels for index-based lookup and stall promotion.
 * @internal
 */
const PRESSURE_LEVELS = ["L0", "L1", "L2", "L3", "L4"];
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
export function determinePressureLevel(consecutiveFailures, stallDetected) {
    // Defensive: treat negative numbers as 0
    const failures = Math.max(0, consecutiveFailures);
    let index;
    if (failures <= 1) {
        index = 0; // L0
    }
    else if (failures === 2) {
        index = 1; // L1
    }
    else if (failures === 3) {
        index = 2; // L2
    }
    else if (failures === 4) {
        index = 3; // L3
    }
    else {
        index = 4; // L4
    }
    // Stall detection promotes by at least one level, capped at L4
    if (stallDetected) {
        index = Math.min(index + 1, PRESSURE_LEVELS.length - 1);
    }
    return PRESSURE_LEVELS[index];
}
// ---------------------------------------------------------------------------
// Methodology routing
// ---------------------------------------------------------------------------
/**
 * Task-type → methodology mapping table.
 * @internal
 */
const TASK_TYPE_METHODOLOGY = {
    debug: "huawei-rca",
    build: "musk-algorithm",
    research: "baidu-search",
    architecture: "amazon-backwards",
    performance: "bytedance-ab",
    review: "jobs-a-player",
    deploy: "alibaba-closure",
    general: "alibaba-closure",
};
/**
 * Failure-pattern → methodology switch chain mapping table.
 * @internal
 */
const FAILURE_PATTERN_CHAINS = {
    spinning: ["musk-algorithm", "alibaba-closure", "huawei-rca"],
    "giving-up": ["netflix-keeper", "huawei-rca", "musk-algorithm"],
    "low-quality": ["jobs-a-player", "alibaba-closure", "netflix-keeper"],
    guessing: ["baidu-search", "amazon-backwards", "bytedance-ab"],
    "passive-waiting": ["alibaba-closure", "huawei-rca", "musk-algorithm"],
    "empty-claim": ["bytedance-ab", "alibaba-closure", "huawei-rca"],
};
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
export function selectMethodology(taskType) {
    if (Object.hasOwn(TASK_TYPE_METHODOLOGY, taskType)) {
        return TASK_TYPE_METHODOLOGY[taskType];
    }
    return "alibaba-closure";
}
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
export function getMethodologyChain(failurePattern) {
    return FAILURE_PATTERN_CHAINS[failurePattern];
}
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
export function advanceMethodology(chain, currentIndex) {
    if (currentIndex >= chain.length - 1) {
        return null;
    }
    return chain[currentIndex + 1];
}
// ---------------------------------------------------------------------------
// Constants — Failure pattern counters
// ---------------------------------------------------------------------------
export const FAILURE_PATTERN_COUNTERS = {
    spinning: [
        "### Detected Pattern: Spinning (原地打转)",
        "You are repeatedly tweaking the same spot without making real progress.",
        "STOP. You are forbidden from making another minor variation of the same approach.",
        "You MUST switch to a fundamentally different strategy — different tool, different angle, different assumption.",
        "List what you have tried, find the common thread, and do the OPPOSITE.",
    ].join("\n"),
    "giving-up": [
        "### Detected Pattern: Giving Up (放弃/推锅)",
        "You are attempting to give up or blame the environment.",
        "The compute spent training you was enormous. Are you sure you have exhausted everything?",
        "This problem landed on your plate — you are the owner. It is not 'I did my part', it is 'I made sure the problem is completely solved'.",
        "Go back to the Universal Methodology Step 1 and start over with fresh eyes.",
    ].join("\n"),
    "low-quality": [
        "### Detected Pattern: Low Quality (质量差)",
        "Your output is superficial — it looks done but does not meet the bar.",
        "A players deliver A-quality work. Your current output says otherwise.",
        "Re-examine every detail. Run the verification again. Check edge cases.",
        "Granularity matters — pull the granularity fine enough that every step is checkable.",
    ].join("\n"),
    guessing: [
        "### Detected Pattern: Guessing Without Searching (没搜就猜)",
        "You are drawing conclusions from memory without searching for evidence.",
        "You have search, file reading, and command execution tools. USE THEM.",
        "Search the complete error message. Read the official documentation. Check the source code.",
        "No hypothesis is valid without evidence. Search first, conclude second.",
    ].join("\n"),
    "passive-waiting": [
        "### Detected Pattern: Passive Waiting (被动等待)",
        "You are waiting for the user to tell you what to do next.",
        "What are you waiting for? For the user to push you? Go dig, go investigate, go verify.",
        "You are a P8 engineer — you discover tasks, define tasks, and deliver tasks. You do not wait for instructions.",
        "Use your tools to investigate, form a plan, and execute. Ask only what truly requires user confirmation.",
    ].join("\n"),
    "empty-claim": [
        "### Detected Pattern: Empty Claim (空口完成)",
        "You claimed the task is done but provided no verification evidence.",
        "Where is the evidence? Open the terminal, run the command, paste the output.",
        "A completion without output is not completion — it is self-deception.",
        "Run build, run tests, curl the endpoint, execute the script. Show the results.",
    ].join("\n"),
};
const PATTERN_KEYWORDS = {
    "giving-up": {
        trigger: [
            "无法解决",
            "超出范围",
            "建议手动",
            "环境问题",
            "cannot",
            "unable",
            "out of scope",
            "manual",
        ],
        exclusion: [],
    },
    "empty-claim": {
        trigger: ["已完成", "done", "completed", "fixed"],
        exclusion: ["test", "verify", "output", "result", "passed"],
    },
    "passive-waiting": {
        trigger: ["等待用户", "需要确认", "waiting", "need confirmation"],
        exclusion: ["searched", "checked", "verified", "tried"],
    },
    guessing: {
        trigger: ["可能是", "probably", "might be", "i think"],
        exclusion: ["searched", "found", "documentation", "source", "verified"],
    },
};
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
export const SPINNING_JACCARD_THRESHOLD = 0.6;
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
export const MAX_SUMMARY_HISTORY = 5;
/**
 * Tokenize a summary string into a set of lowercase tokens.
 *
 * Splits on whitespace and punctuation, lowercases, and filters out
 * tokens shorter than 2 characters.
 *
 * @internal
 */
function tokenize(text) {
    const tokens = text
        .toLowerCase()
        .split(/[\s\p{P}]+/u)
        .filter((t) => t.length >= 2);
    return new Set(tokens);
}
/**
 * Compute the Jaccard similarity (intersection / union) of two token sets.
 *
 * Returns 0 if both sets are empty.
 *
 * @internal
 */
function jaccardSimilarity(a, b) {
    if (a.size === 0 && b.size === 0)
        return 0;
    let intersectionSize = 0;
    for (const token of a) {
        if (b.has(token))
            intersectionSize++;
    }
    const unionSize = a.size + b.size - intersectionSize;
    if (unionSize === 0)
        return 0;
    return intersectionSize / unionSize;
}
/**
 * Detect whether the last 3 summaries exhibit a "spinning" pattern.
 *
 * Spinning is detected when the pairwise keyword overlap rate among the
 * last 3 summaries all exceed 60% (Jaccard similarity > 0.6).
 *
 * @internal
 */
function detectSpinning(summaryHistory) {
    if (summaryHistory.length < 3)
        return false;
    const last3 = summaryHistory.slice(-3);
    const tokenSets = last3.map(tokenize);
    // Check all 3 pairwise similarities
    const sim01 = jaccardSimilarity(tokenSets[0], tokenSets[1]);
    const sim02 = jaccardSimilarity(tokenSets[0], tokenSets[2]);
    const sim12 = jaccardSimilarity(tokenSets[1], tokenSets[2]);
    return (sim01 > SPINNING_JACCARD_THRESHOLD &&
        sim02 > SPINNING_JACCARD_THRESHOLD &&
        sim12 > SPINNING_JACCARD_THRESHOLD);
}
/**
 * Check whether a summary matches a keyword-based failure pattern.
 *
 * A pattern matches when at least one trigger keyword is found in the
 * lowercased summary AND none of the exclusion keywords are present.
 *
 * @internal
 */
function matchesKeywordPattern(summary, keywords) {
    const lower = summary.toLowerCase();
    const hasTrigger = keywords.trigger.some((kw) => lower.includes(kw));
    if (!hasTrigger)
        return false;
    if (keywords.exclusion.length === 0)
        return true;
    const hasExclusion = keywords.exclusion.some((kw) => lower.includes(kw));
    return !hasExclusion;
}
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
export function detectFailurePattern(summaryHistory) {
    if (summaryHistory.length === 0)
        return null;
    // Priority 1: spinning (needs at least 3 summaries)
    if (detectSpinning(summaryHistory)) {
        return "spinning";
    }
    // For remaining patterns, check the most recent summary
    const lastSummary = summaryHistory[summaryHistory.length - 1];
    // Priority 2: giving-up
    if (matchesKeywordPattern(lastSummary, PATTERN_KEYWORDS["giving-up"])) {
        return "giving-up";
    }
    // Priority 3: empty-claim
    if (matchesKeywordPattern(lastSummary, PATTERN_KEYWORDS["empty-claim"])) {
        return "empty-claim";
    }
    // Priority 4: passive-waiting
    if (matchesKeywordPattern(lastSummary, PATTERN_KEYWORDS["passive-waiting"])) {
        return "passive-waiting";
    }
    // Priority 5: guessing
    if (matchesKeywordPattern(lastSummary, PATTERN_KEYWORDS.guessing)) {
        return "guessing";
    }
    return null;
}
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
export function getStallResponse(consecutiveFailures) {
    if (consecutiveFailures >= 5)
        return "force-pivot";
    if (consecutiveFailures >= 3)
        return "reassess";
    return "remind";
}
// ---------------------------------------------------------------------------
// Pressure Prompt Builder
// ---------------------------------------------------------------------------
/**
 * Level-specific instruction injected at L1+.
 * @internal
 */
const L1_SWITCH_INSTRUCTION = `## Switch Approach

You have failed more than once with the same general direction. STOP making minor variations.
Switch to a fundamentally different approach — different tool, different angle, different assumption.`;
/**
 * Level-specific instruction injected at L2+.
 * @internal
 */
const L2_SEARCH_HYPOTHESES_INSTRUCTION = `## Deep Investigation Required

1. Search the complete error message verbatim — not a paraphrase.
2. Read the related source code — at least 50 lines of context around the failure point.
3. List 3 fundamentally different hypotheses for the root cause. Each hypothesis must be testable and lead to a different investigation path.`;
/**
 * Level-specific instruction injected at L4.
 * @internal
 */
const L4_DESPERATION_INSTRUCTION = `## Desperation Mode

All conventional approaches have failed. It is time for extreme measures:
1. Build a minimal PoC that isolates the exact problem — strip everything else away.
2. Test in a completely isolated environment — no assumptions carried over.
3. Consider a completely different tech stack or library for this specific piece.
4. If the current path is fundamentally broken, delete it and rebuild from scratch with a different design.`;
/**
 * Numeric index for each pressure level, used for comparison.
 * @internal
 */
const PRESSURE_LEVEL_INDEX = {
    L0: 0,
    L1: 1,
    L2: 2,
    L3: 3,
    L4: 4,
};
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
export function buildPressurePrompt(level, methodology, failurePattern, _stallResponse) {
    const idx = PRESSURE_LEVEL_INDEX[level];
    const sections = [];
    // --- Base layer (L0+): always present ---
    sections.push(THREE_RED_LINES);
    sections.push(PROACTIVITY_GUIDANCE);
    // --- L1+: switch approach instruction ---
    if (idx >= 1) {
        sections.push(L1_SWITCH_INSTRUCTION);
    }
    // --- L2+: search / source / 3 hypotheses + universal methodology ---
    if (idx >= 2) {
        sections.push(L2_SEARCH_HYPOTHESES_INSTRUCTION);
        sections.push(UNIVERSAL_METHODOLOGY);
    }
    // --- L3+: 7-point checklist ---
    if (idx >= 3) {
        sections.push(SEVEN_POINT_CHECKLIST);
    }
    // --- L4: desperation mode ---
    if (idx >= 4) {
        sections.push(L4_DESPERATION_INSTRUCTION);
    }
    // --- Context injection: methodology description ---
    if (methodology !== null) {
        sections.push(METHODOLOGY_DESCRIPTIONS[methodology]);
    }
    // --- Context injection: failure pattern counter ---
    if (failurePattern !== null) {
        sections.push(FAILURE_PATTERN_COUNTERS[failurePattern]);
    }
    return sections.join("\n\n");
}
//# sourceMappingURL=pua-engine.js.map