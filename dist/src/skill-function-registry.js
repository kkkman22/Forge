/**
 * Registry of TypeScript functions referenced by SKILL.md documents.
 *
 * Each entry maps a function name to its source module and the SKILL.md
 * files that reference it. The contract test (`test/contract.skill-function-sync.test.ts`)
 * verifies bidirectional consistency:
 *
 * 1. Every registered function actually exists and is exported from its module
 * 2. Every "Function Call" / "call `fn(`" pattern in SKILL.md has a registry entry
 * 3. Every registry entry's declared SKILL references actually contain the function name
 *
 * This registry is the **single source of truth** for SKILL-code sync.
 * When adding a new function reference to a SKILL.md, add a corresponding
 * entry here. When renaming or removing a function, update both the registry
 * and the SKILL.md references.
 *
 * **Validates: SKILL-Code Sync Contract**
 */
// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const SKILL_FUNCTION_REGISTRY = [
    // --- forge-build/SKILL.md ---
    {
        module: "build.ts",
        functionName: "checkBuildGate",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["specStatus", "planStatus"],
    },
    {
        module: "build.ts",
        functionName: "analyzeFixAttempts",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["sequence"],
    },
    {
        module: "build.ts",
        functionName: "buildResearchSubagents",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["topics"],
    },
    {
        module: "build.ts",
        functionName: "mergeResearchFindings",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["results"],
    },
    {
        module: "build.ts",
        functionName: "buildThreeStrikeFailureArtifacts",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["topic", "tier", "situation", "rootCause", "now", "sequenceInDay"],
    },
    {
        module: "branch-lifecycle.ts",
        functionName: "checkBranchTopicGate",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["branchName", "taskTopic"],
    },
    {
        module: "branch-gate.ts",
        functionName: "runBranchGate",
        skills: [
            "forge-plan/SKILL.md",
            "forge-build/SKILL.md",
            "forge-review/SKILL.md",
            "forge-test/SKILL.md",
            "forge-ship/SKILL.md",
            "forge-debug/SKILL.md",
            "forge-learn/SKILL.md",
        ],
        parameterNames: ["skill", "mode", "currentBranch", "currentTask", "pendingDeliveries", "alreadyCheckedThisPhase", "isCleanTree"],
    },
    {
        module: "branch-lifecycle.ts",
        functionName: "detectUnshippedBranches",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["pendingDeliveries", "currentTopic"],
    },
    {
        module: "branch-lifecycle.ts",
        functionName: "detectStaleBranches",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["pendingDeliveries", "currentTopic"],
    },
    {
        module: "branch-lifecycle.ts",
        functionName: "checkCommitTopicMatch",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["branchName", "commitTopic"],
    },
    {
        module: "context-budget.ts",
        functionName: "serializeExploreResult",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["input"],
    },
    {
        module: "context-budget.ts",
        functionName: "serializeTestOutput",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["summary"],
    },
    {
        module: "context-budget.ts",
        functionName: "serializeGitDiff",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["summary", "lineCount"],
    },
    {
        module: "context-budget.ts",
        functionName: "serializeGitStatus",
        skills: ["forge-build/SKILL.md"],
        parameterNames: ["summary", "fileCount"],
    },
    // --- forge-decide/SKILL.md + forge-build/SKILL.md ---
    {
        module: "context-budget.ts",
        functionName: "serializeSubagentSummary",
        skills: ["forge-build/SKILL.md", "forge-decide/SKILL.md"],
        parameterNames: ["summary"],
    },
    {
        module: "adr-registry.ts",
        functionName: "loadAllAdrs",
        skills: ["forge-decide/SKILL.md"],
        parameterNames: ["entries", "readFile"],
    },
    {
        module: "adr-registry.ts",
        functionName: "findRelatedAdrs",
        skills: ["forge-decide/SKILL.md"],
        parameterNames: ["taskDescription", "adrs", "limit"],
    },
    {
        module: "decide.ts",
        functionName: "finalizeAdr",
        skills: ["forge-decide/SKILL.md"],
        parameterNames: ["input", "readExistingFile"],
    },
    {
        module: "decide.ts",
        functionName: "checkDecideGlossaryConflicts",
        skills: ["forge-decide/SKILL.md"],
        parameterNames: ["candidateTerms", "glossary"],
    },
    // --- forge-ship/SKILL.md ---
    {
        module: "ship.ts",
        functionName: "checkShipGate",
        skills: ["forge-ship/SKILL.md"],
        parameterNames: ["review", "test", "progress"],
    },
    {
        module: "ship.ts",
        functionName: "checkShipGateWithChecklist",
        skills: ["forge-ship/SKILL.md"],
        parameterNames: ["review", "test", "progress", "checklist"],
    },
    {
        module: "ship.ts",
        functionName: "checkReviewFreshness",
        skills: ["forge-ship/SKILL.md"],
        parameterNames: ["reviewedCommit", "currentHead", "changedFiles"],
    },
    {
        module: "ship.ts",
        functionName: "checkShipGateWithFreshness",
        skills: ["forge-ship/SKILL.md"],
        parameterNames: ["review", "test", "progress", "currentHead", "changedFiles", "checklist"],
    },
    {
        module: "ship.ts",
        functionName: "buildShipGateBlockArtifacts",
        skills: ["forge-ship/SKILL.md"],
        parameterNames: ["topic", "tier", "reason", "situation", "now", "sequenceInDay"],
    },
    {
        module: "branch-lifecycle.ts",
        functionName: "recordPendingDelivery",
        skills: ["forge-ship/SKILL.md"],
        parameterNames: ["branchName", "topic", "timestamp"],
    },
    // --- forge-learn/SKILL.md ---
    {
        module: "context-budget.ts",
        functionName: "serializeContextBudgetReport",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["report"],
    },
    {
        module: "learn.ts",
        functionName: "analyzeSkillFeedback",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["entries"],
    },
    {
        module: "learn.ts",
        functionName: "crossValidateFailures",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["feedbackReasons", "knownFailureDescriptions"],
    },
    {
        module: "learn.ts",
        functionName: "generateKnowledgeDocument",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["title", "tags", "date", "confidence", "body"],
    },
    {
        module: "learn.ts",
        functionName: "validateKnowledgeFrontmatter",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["frontmatter"],
    },
    {
        module: "learn.ts",
        functionName: "maintainKnowledgeBase",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["state"],
    },
    {
        module: "learn.ts",
        functionName: "extractSessionTermCandidates",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["sessionData", "glossary"],
    },
    {
        module: "learn.ts",
        functionName: "proposeStaleTerms",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["glossary", "now", "maxAgeDays"],
    },
    {
        module: "learn.ts",
        functionName: "buildEpisodeFromSession",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["meta", "phaseHistory", "situation", "lesson", "sequenceInDay"],
    },
    {
        module: "learn.ts",
        functionName: "archivePatternByName",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["patterns", "name"],
    },
    {
        module: "learn.ts",
        functionName: "buildPatternUpgradeDrafts",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["episodes", "patterns", "now"],
    },
    {
        module: "learn.ts",
        functionName: "getLearnPromptConfig",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["outcome"],
    },
    {
        module: "learn.ts",
        functionName: "generateEvolutionReport",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["fs", "forgeRoot", "skillsRegistry", "now"],
    },
    {
        module: "learn.ts",
        functionName: "renderEvolutionReport",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["report"],
    },
    {
        module: "pattern-stats.ts",
        functionName: "findStaleOrDecayedPatterns",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["patterns", "now", "maxAgeDays"],
    },
    {
        module: "glossary.ts",
        functionName: "mergeTerm",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["glossary", "candidate", "strategy"],
    },
    {
        module: "glossary.ts",
        functionName: "archiveTerm",
        skills: ["forge-learn/SKILL.md"],
        parameterNames: ["glossary", "termName"],
    },
    // --- forge-review/SKILL.md ---
    {
        module: "context-budget.ts",
        functionName: "serializeReviewSummary",
        skills: ["forge-review/SKILL.md"],
        parameterNames: ["summary"],
    },
    {
        module: "review.ts",
        functionName: "buildReviewEvolutionArtifacts",
        skills: ["forge-review/SKILL.md"],
        parameterNames: ["input", "now", "sequenceInDay"],
    },
    // --- forge-router/SKILL.md (multi-task) ---
    {
        module: "status-manager.ts",
        functionName: "writeTaskStatus",
        skills: ["forge-router/SKILL.md", "forge-loop/SKILL.md"],
        parameterNames: ["io", "forgeRoot", "taskName", "content"],
    },
    // --- forge-abort/SKILL.md (multi-task) ---
    {
        module: "status-manager.ts",
        functionName: "listActiveTasks",
        skills: [
            "forge-abort/SKILL.md",
            "forge-loop/SKILL.md",
            "forge-resume/SKILL.md",
            "forge-status/SKILL.md",
        ],
        parameterNames: ["io", "forgeRoot"],
    },
    {
        module: "status-manager.ts",
        functionName: "archiveTaskStatus",
        skills: ["forge-abort/SKILL.md"],
        parameterNames: ["io", "forgeRoot", "taskName", "date"],
    },
    // --- forge-resume/SKILL.md (state reconstruction) ---
    {
        module: "resume.ts",
        functionName: "recoverPhase",
        skills: ["forge-resume/SKILL.md"],
        parameterNames: ["statusContent", "forgeFiles"],
    },
    // --- forge-grill/SKILL.md (Socratic grilling loop) ---
    {
        module: "grill.ts",
        functionName: "selectNextQuestion",
        skills: ["forge-grill/SKILL.md"],
        parameterNames: ["tree"],
    },
    {
        module: "grill.ts",
        functionName: "checkGrillGlossaryConflicts",
        skills: ["forge-grill/SKILL.md"],
        parameterNames: ["tree", "glossary"],
    },
    // --- forge-spec/SKILL.md (Living Doc, Sprint 3) ---
    {
        module: "living-doc/generator.ts",
        functionName: "generateLivingDoc",
        skills: ["forge-spec/SKILL.md"],
        parameterNames: ["specsDir", "acceptanceDir"],
    },
    {
        module: "living-doc/renderer.ts",
        functionName: "renderLivingDoc",
        skills: ["forge-spec/SKILL.md"],
        parameterNames: ["data", "outputDir"],
    },
    // --- MCP Tools ---
    {
        module: "mcp/tools/forge-git.ts",
        functionName: "forge_git",
        skills: ["forge-review/SKILL.md"],
        parameterNames: ["subcommand", "args"],
        mcpTool: true,
    },
];
//# sourceMappingURL=skill-function-registry.js.map