/**
 * Error Recovery Strategy — pure-function module for `/forge resume`.
 *
 * All core logic (git log parsing, commit matching, state reconciliation,
 * interruption classification, report serialization) is implemented as pure
 * functions that receive data and return results. I/O operations (git command
 * execution, file reads/writes) are the caller's responsibility.
 *
 * Design reference: .kiro/specs/error-recovery-strategy/design.md
 * **Validates: Requirements 1.1–11.4**
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Phase sequences for each tier. */
export const PHASE_SEQUENCES = {
    lightweight: ["build", "review"],
    standard: ["plan", "build", "review", "test", "ship"],
    full: ["decide", "spec", "plan", "build", "review", "test", "ship", "learn"],
};
/** Test file path patterns. */
export const TEST_FILE_PATTERNS = [
    /\.test\.[tj]sx?$/,
    /\.spec\.[tj]sx?$/,
    /^test\//,
    /\/__tests__\//,
];
// ---------------------------------------------------------------------------
// Git_State_Scanner
// ---------------------------------------------------------------------------
/** Separates entries in `git log --format` output. */
const GIT_LOG_ENTRY_SEPARATOR = "\x00";
/**
 * Parse `git log --format` output into structured commit entries.
 *
 * Expected format: `<hash>\x00<message>\x00<timestamp>` per commit,
 * separated by newlines between entries.
 *
 * Returns an empty array for empty or unparseable input.
 */
export function parseGitLog(rawOutput) {
    if (!rawOutput?.trim())
        return [];
    const entries = [];
    const lines = rawOutput.trim().split("\n");
    for (const line of lines) {
        const parts = line.split(GIT_LOG_ENTRY_SEPARATOR);
        if (parts.length >= 3) {
            const [hash, message, timestamp] = parts;
            if (hash && timestamp) {
                entries.push({ hash, message, timestamp });
            }
        }
    }
    return entries;
}
/**
 * Extract commit-message patterns from a Plan_Document's markdown content.
 *
 * Looks for task entries with commit message prefixes. Each task heading
 * (`## Task N: Title`) is parsed for its ID and title, and any commit
 * message convention (e.g. `feat(topic): ...`) is captured as the prefix.
 */
export function extractCommitPatterns(planContent) {
    const patterns = [];
    const taskRegex = /^##\s+Task\s+(\d+):\s+(.+)$/gm;
    let match;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
    while ((match = taskRegex.exec(planContent)) !== null) {
        const taskId = match[1];
        const taskTitle = match[2].trim();
        const taskBlock = planContent.slice(match.index);
        // Look for commit message prefix in the task block (until next task heading)
        const nextTask = taskBlock.slice(taskBlock.indexOf("\n")).search(/^##\s+Task\s+\d+:/m);
        const blockContent = nextTask > 0 ? taskBlock.slice(0, taskBlock.indexOf("\n") + nextTask) : taskBlock;
        // Match patterns like: `feat(topic):`, `fix(topic):`, or any `word(...):` format
        // Also match `commit: <prefix>` or `prefix: <prefix>` patterns
        const prefixMatch = blockContent.match(/(?:commit|prefix)[:\s]+[`"]?(\S+)/i) ??
            blockContent.match(/([a-z]+\([^)]*\):)/i);
        const prefix = prefixMatch ? prefixMatch[1] : "";
        // Extract keywords from title (lowercased, filtered)
        const keywords = taskTitle
            .toLowerCase()
            .split(/[\s\-_]+/)
            .filter((w) => w.length > 2 && !["the", "and", "for", "with", "from"].includes(w));
        if (prefix || keywords.length > 0) {
            patterns.push({ taskId, taskTitle, prefix, keywords });
        }
    }
    return patterns;
}
/**
 * Filter commits to only those after the given ISO 8601 timestamp.
 */
export function filterCommitsSince(commits, sinceTimestamp) {
    const since = new Date(sinceTimestamp).getTime();
    if (Number.isNaN(since))
        return commits;
    return commits.filter((c) => new Date(c.timestamp).getTime() > since);
}
/**
 * Match commits to tasks using prefix + keyword matching.
 *
 * A commit matches a task when:
 * - The commit message contains the task's prefix (if non-empty)
 * - The commit message contains at least one of the task's keywords
 *
 * Confidence is "exact" when prefix and all keywords match, "fuzzy" otherwise.
 */
export function matchCommitsToTasks(commits, patterns) {
    const results = [];
    for (const commit of commits) {
        const msg = commit.message.toLowerCase();
        for (const pattern of patterns) {
            const prefixMatch = pattern.prefix ? msg.includes(pattern.prefix.toLowerCase()) : true;
            if (!prefixMatch)
                continue;
            const matchedKeywords = pattern.keywords.filter((kw) => msg.includes(kw));
            if (matchedKeywords.length === 0)
                continue;
            const confidence = matchedKeywords.length === pattern.keywords.length ? "exact" : "fuzzy";
            results.push({
                commit,
                taskId: pattern.taskId,
                taskTitle: pattern.taskTitle,
                confidence,
            });
            break;
        }
    }
    return results;
}
// ---------------------------------------------------------------------------
// Uncommitted_Change_Detector
// ---------------------------------------------------------------------------
/**
 * Parse `git status --porcelain` output into FileChange entries.
 *
 * Porcelain format: `XY filename` where XY are status codes.
 * Returns an empty array for empty input.
 */
export function parseGitStatus(rawOutput) {
    if (!rawOutput?.trim())
        return [];
    const changes = [];
    for (const line of rawOutput.trim().split("\n")) {
        if (line.length < 4)
            continue;
        const statusCode = line.slice(0, 2);
        const filePath = line.slice(3);
        let status;
        if (statusCode.includes("??")) {
            status = "untracked";
        }
        else if (statusCode.includes("D") || statusCode.includes("D ")) {
            status = "deleted";
        }
        else if (statusCode.includes("A") || statusCode.startsWith("A")) {
            status = "added";
        }
        else {
            status = "modified";
        }
        changes.push({ filePath, status });
    }
    return changes;
}
/**
 * Filter changes to only those whose paths overlap with the task's expected paths.
 */
export function matchChangesToTask(changes, taskFilePaths) {
    const taskPathSet = new Set(taskFilePaths);
    return changes.filter((c) => {
        if (taskPathSet.has(c.filePath))
            return true;
        // Check if the change path starts with any task path (directory match)
        for (const tp of taskFilePaths) {
            if (c.filePath.startsWith(`${tp}/`) || tp.startsWith(`${c.filePath}/`)) {
                return true;
            }
        }
        return false;
    });
}
// ---------------------------------------------------------------------------
// Progress_Reconciler
// ---------------------------------------------------------------------------
/**
 * Find tasks that have matching commits but are not marked as completed.
 */
export function findProgressInconsistencies(matches, progressEntries) {
    const progressMap = new Map(progressEntries.map((e) => [e.taskId, e]));
    return matches
        .filter((m) => {
        const entry = progressMap.get(m.taskId);
        return entry && !entry.completed;
    })
        .map((m) => ({
        taskId: m.taskId,
        taskTitle: m.taskTitle,
        commitHash: m.commit.hash,
        commitMessage: m.commit.message,
        commitTimestamp: m.commit.timestamp,
        type: "committed-but-not-marked",
    }));
}
/**
 * Detect dependency gaps: a committed task whose preceding task is neither
 * completed nor has a matching commit.
 */
export function findDependencyGaps(inconsistencies, progressEntries, taskOrder) {
    const progressMap = new Map(progressEntries.map((e) => [e.taskId, e]));
    const inconsistentIds = new Set(inconsistencies.map((i) => i.taskId));
    const gaps = [];
    for (const inconsistency of inconsistencies) {
        const idx = taskOrder.indexOf(inconsistency.taskId);
        if (idx <= 0)
            continue;
        const prevTaskId = taskOrder[idx - 1];
        const prevProgress = progressMap.get(prevTaskId);
        const prevHasCommit = inconsistentIds.has(prevTaskId);
        if (!prevProgress?.completed && !prevHasCommit) {
            gaps.push({
                taskId: inconsistency.taskId,
                taskTitle: inconsistency.taskTitle,
                missingDependencyTaskId: prevTaskId,
                missingDependencyTitle: prevProgress?.taskTitle ?? prevTaskId,
            });
        }
    }
    return gaps;
}
/**
 * Build reconciliation patches ordered by Plan task order.
 */
export function buildReconciliationPatch(inconsistencies, taskOrder) {
    const byTask = new Map(inconsistencies.map((i) => [i.taskId, i]));
    return taskOrder
        .filter((id) => byTask.has(id))
        .map((id) => {
        // biome-ignore lint/style/noNonNullAssertion: filtered above ensures existence
        const inc = byTask.get(id);
        return {
            taskId: id,
            markCompleted: true,
            completionTime: inc.commitTimestamp,
            sourceCommitHash: inc.commitHash,
        };
    });
}
// ---------------------------------------------------------------------------
// Phase_Reconciler
// ---------------------------------------------------------------------------
/**
 * Get the ordered phase array for a given tier.
 */
export function getPhaseSequence(tier) {
    return PHASE_SEQUENCES[tier];
}
/**
 * Get the next phase after the current one in the tier's sequence.
 * Returns null if the current phase is the last.
 */
export function getNextPhase(currentPhase, tier) {
    const seq = PHASE_SEQUENCES[tier];
    const idx = seq.indexOf(currentPhase);
    if (idx < 0 || idx === seq.length - 1)
        return null;
    return seq[idx + 1];
}
/**
 * Detect phase inconsistency.
 *
 * Returns "behind" when all tasks are completed but phase hasn't advanced,
 * "ahead" when tasks are incomplete but phase is beyond expected position,
 * or null when consistent.
 */
export function findPhaseInconsistencies(allTasksCompleted, currentPhase, tier) {
    const seq = PHASE_SEQUENCES[tier];
    const phaseIdx = seq.indexOf(currentPhase);
    if (phaseIdx < 0)
        return null;
    if (allTasksCompleted) {
        const next = phaseIdx + 1;
        if (next < seq.length) {
            return {
                currentPhase,
                expectedPhase: seq[next],
                direction: "behind",
                evidence: `All tasks completed but phase is still "${currentPhase}", expected "${seq[next]}"`,
            };
        }
    }
    else {
        if (phaseIdx > 0) {
            const prevPhase = seq[phaseIdx - 1];
            return {
                currentPhase,
                expectedPhase: prevPhase,
                direction: "ahead",
                evidence: `Tasks incomplete but phase is "${currentPhase}", expected still at "${prevPhase}"`,
            };
        }
    }
    return null;
}
// ---------------------------------------------------------------------------
// Interruption_Classifier
// ---------------------------------------------------------------------------
/**
 * Check if a file path matches test file naming conventions.
 */
export function isTestFile(filePath) {
    return TEST_FILE_PATTERNS.some((re) => re.test(filePath));
}
/**
 * Infer the TDD phase from uncommitted file changes and verification status.
 */
export function inferTDDPhase(changes, verificationPassed) {
    const hasTestFiles = changes.some((c) => isTestFile(c.filePath));
    const hasImplFiles = changes.some((c) => !isTestFile(c.filePath));
    if (!hasTestFiles)
        return null;
    if (!hasImplFiles)
        return "red";
    if (verificationPassed === false)
        return "green-incomplete";
    if (verificationPassed === true && hasImplFiles)
        return "refactor-incomplete";
    return null;
}
/**
 * Classify the interruption point.
 *
 * Priority order: (a) task-completed-not-committed → (b) committed-not-progress-updated
 * → (c) progress-updated-not-phase-advanced → (d) subagent-mid-execution → (e) clean-state
 */
export function classifyInterruption(uncommittedResult, _gitScanResult, progressInconsistencies, phaseInconsistency, verificationPassed) {
    // (a) Task completed but not committed
    if (!uncommittedResult.isClean && uncommittedResult.relevantChanges.length > 0) {
        return {
            category: "task-completed-not-committed",
            evidence: `${uncommittedResult.relevantChanges.length} relevant uncommitted change(s): ${uncommittedResult.relevantChanges.map((c) => c.filePath).join(", ")}`,
            tddPhase: null,
        };
    }
    // (b) Committed but progress not updated
    if (progressInconsistencies.length > 0) {
        return {
            category: "committed-not-progress-updated",
            evidence: `${progressInconsistencies.length} task(s) committed but not marked: ${progressInconsistencies.map((i) => `${i.taskId} (${i.commitHash.slice(0, 7)})`).join(", ")}`,
            tddPhase: null,
        };
    }
    // (c) Progress updated but phase not advanced
    if (phaseInconsistency !== null) {
        return {
            category: "progress-updated-not-phase-advanced",
            evidence: `Phase "${phaseInconsistency.currentPhase}" ${phaseInconsistency.direction} expected "${phaseInconsistency.expectedPhase}"`,
            tddPhase: null,
        };
    }
    // (d) Subagent mid-execution
    if (!uncommittedResult.isClean) {
        const tddPhase = inferTDDPhase(uncommittedResult.changes, verificationPassed);
        return {
            category: "subagent-mid-execution",
            evidence: `Uncommitted changes with no relevant task match, TDD phase: ${tddPhase ?? "ambiguous"}`,
            tddPhase,
        };
    }
    // (e) Clean state
    return {
        category: "clean-state",
        evidence: "No inconsistencies detected across git, progress, and phase state",
        tddPhase: null,
    };
}
// ---------------------------------------------------------------------------
// Recovery_Engine — report builder
// ---------------------------------------------------------------------------
/**
 * Build the recovery report from all detection results.
 */
export function buildRecoveryReport(header, progressInconsistencies, phaseInconsistency, classification, uncommittedResult, dependencyGaps) {
    const inconsistencies = [];
    const actions = [];
    // Progress inconsistencies
    for (const inc of progressInconsistencies) {
        inconsistencies.push({
            category: "committed-but-not-marked",
            evidence: `Task ${inc.taskId}: commit ${inc.commitHash.slice(0, 7)} "${inc.commitMessage}" at ${inc.commitTimestamp}`,
            recommendedAction: "Mark task as completed in Progress_Document",
        });
        actions.push([
            {
                index: 1,
                description: `Auto-reconcile: mark ${inc.taskId} completed (commit ${inc.commitHash.slice(0, 7)})`,
                isDefault: true,
            },
            { index: 2, description: "Skip reconciliation and manually verify", isDefault: false },
        ]);
    }
    // Phase inconsistency
    if (phaseInconsistency) {
        inconsistencies.push({
            category: `phase-${phaseInconsistency.direction}`,
            evidence: phaseInconsistency.evidence,
            recommendedAction: phaseInconsistency.direction === "behind"
                ? `Advance phase from "${phaseInconsistency.currentPhase}" to "${phaseInconsistency.expectedPhase}"`
                : `Revert phase from "${phaseInconsistency.currentPhase}" to "${phaseInconsistency.expectedPhase}"`,
        });
        actions.push([
            {
                index: 1,
                description: `Apply phase ${phaseInconsistency.direction === "behind" ? "advancement" : "revert"}`,
                isDefault: true,
            },
            { index: 2, description: "Skip phase update", isDefault: false },
        ]);
    }
    // Dependency gaps
    for (const gap of dependencyGaps) {
        inconsistencies.push({
            category: "dependency-gap",
            evidence: `Task ${gap.taskId} has commit but dependency ${gap.missingDependencyTaskId} is incomplete`,
            recommendedAction: "Resolve missing dependency before proceeding",
        });
        actions.push([
            {
                index: 1,
                description: "Request user guidance before proceeding",
                isDefault: true,
            },
            {
                index: 2,
                description: `Auto-complete ${gap.missingDependencyTaskId} if matching commit found`,
                isDefault: false,
            },
        ]);
    }
    // Uncommitted changes (classification a/d)
    if (classification.category === "task-completed-not-committed") {
        if (progressInconsistencies.length === 0 && !phaseInconsistency) {
            inconsistencies.push({
                category: "uncommitted-task-work",
                evidence: `${uncommittedResult.relevantChanges.length} relevant uncommitted file(s)`,
                recommendedAction: "Commit or discard the changes",
            });
            const verificationNote = uncommittedResult.changes.length > 0;
            actions.push([
                { index: 1, description: "Commit with Plan-defined message", isDefault: verificationNote },
                { index: 2, description: "Discard changes and redo task", isDefault: !verificationNote },
            ]);
        }
    }
    else if (classification.category === "subagent-mid-execution") {
        if (classification.tddPhase === "red" || classification.tddPhase === "green-incomplete") {
            inconsistencies.push({
                category: "subagent-mid-execution",
                evidence: `TDD phase: ${classification.tddPhase}`,
                recommendedAction: "Preserve test files and resume from GREEN",
            });
            actions.push([
                { index: 1, description: "Preserve test files, resume from GREEN", isDefault: true },
                {
                    index: 2,
                    description: "Discard all uncommitted changes, restart task",
                    isDefault: false,
                },
            ]);
        }
        else if (classification.tddPhase === "refactor-incomplete") {
            inconsistencies.push({
                category: "subagent-mid-execution",
                evidence: "TDD phase: refactor-incomplete",
                recommendedAction: "Commit current passing state",
            });
            actions.push([
                {
                    index: 1,
                    description: "Commit current passing state, skip refactoring",
                    isDefault: true,
                },
                { index: 2, description: "Continue refactoring phase", isDefault: false },
            ]);
        }
        else {
            // tddPhase is null — ambiguous file state per Spec 6.5
            inconsistencies.push({
                category: "subagent-mid-execution",
                evidence: `Ambiguous TDD phase. Uncommitted files: ${uncommittedResult.changes.map((c) => c.filePath).join(", ")}`,
                recommendedAction: "Manually classify the interruption state",
            });
            actions.push([
                {
                    index: 1,
                    description: "Preserve all uncommitted changes for manual inspection",
                    isDefault: true,
                },
                {
                    index: 2,
                    description: "Discard all uncommitted changes, restart task",
                    isDefault: false,
                },
            ]);
        }
    }
    const totalInconsistencies = inconsistencies.length;
    const autoFixable = progressInconsistencies.length + (phaseInconsistency ? 1 : 0);
    return {
        header,
        inconsistencies,
        actions,
        summary: {
            totalInconsistencies,
            autoFixable,
            requiresUserDecision: totalInconsistencies - autoFixable,
        },
    };
}
/**
 * Calculate task segmentation for cross-session resume.
 */
export function calculateSegmentation(planTaskIds, completedTaskIds, commitMatches, currentInterruption) {
    const completedSet = new Set(completedTaskIds);
    const commitMap = new Map(commitMatches.map((m) => [m.taskId, m.commit.hash]));
    const completedTasks = [];
    const remainingTasks = [];
    let currentTask = null;
    let lastCompletedIndex = -1;
    for (let i = 0; i < planTaskIds.length; i++) {
        const id = planTaskIds[i];
        if (completedSet.has(id)) {
            completedTasks.push({ taskId: id, commitHash: commitMap.get(id) ?? "" });
            lastCompletedIndex = i;
        }
        else if (!currentTask) {
            currentTask = {
                taskId: id,
                interruptionState: currentInterruption?.category ?? "unknown",
            };
        }
        else {
            remainingTasks.push(id);
        }
    }
    return {
        completedTasks,
        currentTask,
        remainingTasks,
        lastCompletedIndex,
    };
}
// ---------------------------------------------------------------------------
// Recovery_Report serialization
// ---------------------------------------------------------------------------
/**
 * Serialize a RecoveryReport to structured Markdown.
 */
export function serializeRecoveryReport(report) {
    const lines = [];
    // YAML frontmatter
    lines.push("---");
    lines.push(`task: ${report.header.taskName}`);
    lines.push(`tier: ${report.header.tier}`);
    lines.push(`phase: ${report.header.phase}`);
    lines.push(`last_update: ${report.header.lastUpdate}`);
    lines.push(`interruption: ${report.header.interruptionCategory}`);
    lines.push("---");
    lines.push("");
    // Inconsistencies
    if (report.inconsistencies.length > 0) {
        lines.push("## Inconsistencies");
        lines.push("");
        for (let i = 0; i < report.inconsistencies.length; i++) {
            const inc = report.inconsistencies[i];
            lines.push(`### ${i + 1}. ${inc.category}`);
            lines.push(`**Evidence:** ${inc.evidence}`);
            lines.push(`**Recommended:** ${inc.recommendedAction}`);
            lines.push("");
            if (report.actions[i]) {
                lines.push("**Options:**");
                for (const opt of report.actions[i]) {
                    lines.push(`${opt.index}. ${opt.isDefault ? "[x]" : "[ ]"} ${opt.description}`);
                }
                lines.push("");
            }
        }
    }
    // Summary
    lines.push("## Summary");
    lines.push(`- Total: ${report.summary.totalInconsistencies}`);
    lines.push(`- Auto-fixable: ${report.summary.autoFixable}`);
    lines.push(`- Requires decision: ${report.summary.requiresUserDecision}`);
    return lines.join("\n");
}
/**
 * Deserialize structured Markdown back into a RecoveryReport.
 */
export function deserializeRecoveryReport(markdown) {
    const headerMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
    const headerBlock = headerMatch ? headerMatch[1] : "";
    const headerField = (name) => {
        const prefix = `${name}: `;
        for (const line of headerBlock.split("\n")) {
            if (line.startsWith(prefix))
                return line.slice(prefix.length).trim();
        }
        return "";
    };
    const header = {
        taskName: headerField("task"),
        tier: headerField("tier"),
        phase: headerField("phase"),
        lastUpdate: headerField("last_update"),
        interruptionCategory: headerField("interruption"),
    };
    const inconsistencies = [];
    const actions = [];
    const incRegex = /### (\d+)\.\s+(.+?)\n\*\*Evidence:\*\*\s+(.+?)\n\*\*Recommended:\*\*\s+(.+?)(?:\n\n|\n\*\*Options)/gs;
    let incMatch;
    const fullText = markdown;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
    while ((incMatch = incRegex.exec(fullText)) !== null) {
        inconsistencies.push({
            category: incMatch[2].trim(),
            evidence: incMatch[3].trim(),
            recommendedAction: incMatch[4].trim(),
        });
        // Parse options block
        const afterInc = fullText.slice(incMatch.index + incMatch[0].length);
        const opts = [];
        const optRegex = /^(\d+)\.\s+\[([ x])\]\s+(.+)$/gm;
        let optMatch;
        let searchSlice = afterInc;
        // Only look at options until the next section heading
        const nextSection = searchSlice.search(/^###|^## /m);
        if (nextSection > 0)
            searchSlice = searchSlice.slice(0, nextSection);
        // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
        while ((optMatch = optRegex.exec(searchSlice)) !== null) {
            opts.push({
                index: Number(optMatch[1]),
                isDefault: optMatch[2] === "x",
                description: optMatch[3].trim(),
            });
        }
        actions.push(opts);
    }
    const totalMatch = fullText.match(/^- Total:\s*(\d+)/m);
    const autoMatch = fullText.match(/^- Auto-fixable:\s*(\d+)/m);
    const decisionMatch = fullText.match(/^- Requires decision:\s*(\d+)/m);
    return {
        header,
        inconsistencies,
        actions,
        summary: {
            totalInconsistencies: totalMatch ? Number(totalMatch[1]) : inconsistencies.length,
            autoFixable: autoMatch ? Number(autoMatch[1]) : 0,
            requiresUserDecision: decisionMatch ? Number(decisionMatch[1]) : 0,
        },
    };
}
// ---------------------------------------------------------------------------
// InterruptionClassification serialization
// ---------------------------------------------------------------------------
/**
 * Serialize an InterruptionClassification to structured text.
 */
export function serializeClassification(classification) {
    const lines = [
        `category: ${classification.category}`,
        `evidence: ${classification.evidence}`,
        `tddPhase: ${classification.tddPhase ?? "null"}`,
    ];
    return lines.join("\n");
}
/**
 * Deserialize structured text into an InterruptionClassification.
 */
export function deserializeClassification(text) {
    const field = (name) => {
        const prefix = `${name}: `;
        for (const line of text.split("\n")) {
            if (line.startsWith(prefix))
                return line.slice(prefix.length).trim();
        }
        return "";
    };
    const tddPhaseStr = field("tddPhase");
    const tddPhase = tddPhaseStr && tddPhaseStr !== "null" ? tddPhaseStr : null;
    return {
        category: field("category"),
        evidence: field("evidence"),
        tddPhase,
    };
}
// ---------------------------------------------------------------------------
// CheckpointMarker serialization
// ---------------------------------------------------------------------------
/**
 * Serialize a CheckpointMarker to structured text.
 */
export function serializeCheckpointMarker(marker) {
    const lines = [
        `taskId: ${marker.taskId}`,
        `intendedCommitMessage: ${marker.intendedCommitMessage}`,
        `timestamp: ${marker.timestamp}`,
    ];
    return lines.join("\n");
}
/**
 * Deserialize structured text into a CheckpointMarker.
 */
export function deserializeCheckpointMarker(text) {
    const field = (name) => {
        const prefix = `${name}: `;
        for (const line of text.split("\n")) {
            if (line.startsWith(prefix))
                return line.slice(prefix.length).trim();
        }
        return "";
    };
    return {
        taskId: field("taskId"),
        intendedCommitMessage: field("intendedCommitMessage"),
        timestamp: field("timestamp"),
    };
}
//# sourceMappingURL=error-recovery.js.map