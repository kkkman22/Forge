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
// Types
// ---------------------------------------------------------------------------

export interface SkillFunctionEntry {
  /** Source module relative to src/ (e.g., "build.ts") */
  module: string;
  /** Exported function name */
  functionName: string;
  /** SKILL.md files that reference this function (relative to skills/) */
  skills: string[];
  /** Parameter names for contract verification */
  parameterNames: string[];
  /** If true, the function is registered via MCP server.tool() instead of export function */
  mcpTool?: boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SKILL_FUNCTION_REGISTRY: readonly SkillFunctionEntry[] = [
  // --- forge-build/SKILL.md ---
  {
    module: "build.ts",
    functionName: "checkBuildGate",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["specStatus", "planStatus"],
  },
  {
    module: "build.ts",
    functionName: "analyzeFixAttempts",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["sequence"],
  },
  {
    module: "build.ts",
    functionName: "buildResearchSubagents",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["topics"],
  },
  {
    module: "build.ts",
    functionName: "mergeResearchFindings",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["results"],
  },
  {
    module: "build.ts",
    functionName: "buildThreeStrikeFailureArtifacts",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["topic", "tier", "situation", "rootCause", "now", "sequenceInDay"],
  },
  {
    module: "branch-gate.ts",
    functionName: "checkBranchTopicGate",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["branchName", "taskTopic"],
  },
  {
    module: "branch-gate.ts",
    functionName: "runBranchGate",
    skills: [
      "forge/lib/plan/instructions.md",
      "forge/lib/build/instructions.md",
      "forge/lib/review/instructions.md",
      "forge/lib/test/instructions.md",
      "forge/lib/ship/instructions.md",
      "forge/lib/debug/instructions.md",
      "forge/lib/learn/instructions.md",
    ],
    parameterNames: ["input"],
  },
  {
    module: "branch-gate.ts",
    functionName: "detectUnshippedBranches",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["pendingDeliveries", "currentTopic"],
  },
  {
    module: "context-budget.ts",
    functionName: "serializeExploreResult",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["input"],
  },
  {
    module: "context-budget.ts",
    functionName: "serializeTestOutput",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["summary"],
  },
  {
    module: "context-budget.ts",
    functionName: "serializeGitDiff",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["summary", "lineCount"],
  },
  {
    module: "context-budget.ts",
    functionName: "serializeGitStatus",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["summary", "fileCount"],
  },

  // --- forge-decide/SKILL.md + forge-build/SKILL.md ---
  {
    module: "context-budget.ts",
    functionName: "serializeSubagentSummary",
    skills: ["forge/lib/build/instructions.md", "forge/lib/decide/instructions.md"],
    parameterNames: ["summary"],
  },
  {
    module: "adr-registry.ts",
    functionName: "loadAllAdrs",
    skills: ["forge/lib/decide/instructions.md"],
    parameterNames: ["entries", "readFile"],
  },
  {
    module: "adr-registry.ts",
    functionName: "findRelatedAdrs",
    skills: ["forge/lib/decide/instructions.md"],
    parameterNames: ["taskDescription", "adrs", "limit"],
  },
  {
    module: "decide.ts",
    functionName: "finalizeAdr",
    skills: ["forge/lib/decide/instructions.md"],
    parameterNames: ["input", "readExistingFile"],
  },
  {
    module: "decide.ts",
    functionName: "checkDecideGlossaryConflicts",
    skills: ["forge/lib/decide/instructions.md"],
    parameterNames: ["candidateTerms", "glossary"],
  },

  // --- forge-ship/SKILL.md ---
  {
    module: "ship-gates.ts",
    functionName: "runAllGates",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["input"],
  },
  {
    module: "ship-gates.ts",
    functionName: "persistGateResults",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["report", "shipDir"],
  },
  {
    module: "ship-gates.ts",
    functionName: "validateSkipGateOptions",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["options"],
  },
  {
    module: "ship-gates.ts",
    functionName: "buildSkipGateAnnotation",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["options"],
  },
  {
    module: "ship.ts",
    functionName: "checkShipGate",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["review", "test", "progress"],
  },
  {
    module: "ship.ts",
    functionName: "checkShipGateWithChecklist",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["review", "test", "progress", "checklist"],
  },
  {
    module: "ship.ts",
    functionName: "checkReviewFreshness",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["reviewedCommit", "currentHead", "changedFiles"],
  },
  {
    module: "ship.ts",
    functionName: "checkShipGateWithFreshness",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["review", "test", "progress", "currentHead", "changedFiles", "checklist"],
  },
  {
    module: "ship.ts",
    functionName: "checkShipGateWithForceSkip",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["review", "test", "progress", "options"],
  },
  {
    module: "ship.ts",
    functionName: "recordForceSkip",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["commitHash", "reason", "user"],
  },
  {
    module: "ship.ts",
    functionName: "buildShipGateBlockArtifacts",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["topic", "tier", "reason", "situation", "now", "sequenceInDay"],
  },

  // --- forge-learn/SKILL.md ---
  {
    module: "context-budget.ts",
    functionName: "serializeContextBudgetReport",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["report"],
  },
  {
    module: "learn.ts",
    functionName: "analyzeSkillFeedback",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["entries"],
  },
  {
    module: "learn.ts",
    functionName: "crossValidateFailures",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["feedbackReasons", "knownFailureDescriptions"],
  },
  {
    module: "learn.ts",
    functionName: "generateKnowledgeDocument",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["title", "tags", "date", "confidence", "body"],
  },
  {
    module: "learn.ts",
    functionName: "validateKnowledgeFrontmatter",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["frontmatter"],
  },
  {
    module: "learn.ts",
    functionName: "maintainKnowledgeBase",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["state"],
  },
  {
    module: "learn.ts",
    functionName: "extractSessionTermCandidates",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["sessionData", "glossary"],
  },
  {
    module: "learn.ts",
    functionName: "proposeStaleTerms",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["glossary", "now", "maxAgeDays"],
  },
  {
    module: "learn.ts",
    functionName: "buildEpisodeFromSession",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["meta", "phaseHistory", "situation", "lesson", "sequenceInDay"],
  },
  {
    module: "learn.ts",
    functionName: "archivePatternByName",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["patterns", "name"],
  },
  {
    module: "learn.ts",
    functionName: "buildPatternUpgradeDrafts",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["episodes", "patterns", "now"],
  },
  {
    module: "learn.ts",
    functionName: "getLearnPromptConfig",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["outcome"],
  },
  {
    module: "learn.ts",
    functionName: "generateEvolutionReport",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["fs", "forgeRoot", "skillsRegistry", "now"],
  },
  {
    module: "learn.ts",
    functionName: "renderEvolutionReport",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["report"],
  },
  {
    module: "pattern-stats.ts",
    functionName: "findStaleOrDecayedPatterns",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["patterns", "now", "maxAgeDays"],
  },
  {
    module: "glossary.ts",
    functionName: "mergeTerm",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["glossary", "candidate", "strategy"],
  },
  {
    module: "glossary.ts",
    functionName: "archiveTerm",
    skills: ["forge/lib/learn/instructions.md"],
    parameterNames: ["glossary", "termName"],
  },

  // --- forge-review/SKILL.md ---
  {
    module: "context-budget.ts",
    functionName: "serializeReviewSummary",
    skills: ["forge/lib/review/instructions.md"],
    parameterNames: ["summary"],
  },
  {
    module: "review.ts",
    functionName: "buildReviewEvolutionArtifacts",
    skills: ["forge/lib/review/instructions.md"],
    parameterNames: ["input", "now", "sequenceInDay"],
  },
  {
    module: "review.ts",
    functionName: "persistReviewEvidenceArtifact",
    skills: ["forge/lib/review/instructions.md"],
    parameterNames: ["projectRoot", "frontmatter", "options"],
  },
  {
    module: "truncation-detection.ts",
    functionName: "detectTruncation",
    skills: ["forge/lib/review/instructions.md"],
    parameterNames: ["layer", "raw"],
  },
  {
    module: "truncation-detection.ts",
    functionName: "assessTruncationSeverity",
    skills: ["forge/lib/review/instructions.md"],
    parameterNames: ["results"],
  },

  // --- forge-router/SKILL.md (multi-task) ---
  {
    module: "status-manager.ts",
    functionName: "writeTaskStatus",
    skills: ["forge/lib/router/instructions.md"],
    parameterNames: ["io", "forgeRoot", "taskName", "content"],
  },
  {
    module: "doctor.ts",
    functionName: "buildHealthSnapshot",
    skills: ["forge/lib/status/instructions.md"],
    parameterNames: ["options"],
  },
  {
    module: "doctor.ts",
    functionName: "renderStatusSummary",
    skills: ["forge/lib/status/instructions.md"],
    parameterNames: ["snapshot"],
  },

  // --- forge-abort/SKILL.md (multi-task) ---
  {
    module: "status-manager.ts",
    functionName: "listActiveTasks",
    skills: [
      "forge/lib/abort/instructions.md",
      "forge/lib/resume/instructions.md",
      "forge/lib/status/instructions.md",
    ],
    parameterNames: ["io", "forgeRoot"],
  },
  {
    module: "status-manager.ts",
    functionName: "archiveTaskStatus",
    skills: ["forge/lib/abort/instructions.md"],
    parameterNames: ["io", "forgeRoot", "taskName", "date"],
  },

  // --- forge-resume/SKILL.md (state reconstruction) ---
  {
    module: "resume.ts",
    functionName: "recoverPhase",
    skills: ["forge/lib/resume/instructions.md"],
    parameterNames: ["statusContent", "forgeFiles"],
  },

  // --- forge-grill/SKILL.md (Socratic grilling loop) ---
  {
    module: "grill.ts",
    functionName: "selectNextQuestion",
    skills: ["forge/lib/grill/instructions.md"],
    parameterNames: ["tree"],
  },
  {
    module: "grill.ts",
    functionName: "checkGrillGlossaryConflicts",
    skills: ["forge/lib/grill/instructions.md"],
    parameterNames: ["tree", "glossary"],
  },
  {
    module: "zoom-out.ts",
    functionName: "shouldAutoTriggerZoomOut",
    skills: ["forge/lib/decide/instructions.md"],
    parameterNames: ["context"],
  },
  // --- forge-spec/SKILL.md + forge-decide/SKILL.md (inline grill triggers) ---
  {
    module: "grill-inline.ts",
    functionName: "shouldTriggerInlineGrill",
    skills: ["forge/lib/spec/instructions.md", "forge/lib/decide/instructions.md"],
    parameterNames: ["input"],
  },
  {
    module: "grill-inline.ts",
    functionName: "renderInlineGrillConfirmPrompt",
    skills: ["forge/lib/spec/instructions.md", "forge/lib/decide/instructions.md"],
    parameterNames: ["reason"],
  },
  {
    module: "grill-inline.ts",
    functionName: "renderInlineGrillAdvisory",
    skills: ["forge/lib/spec/instructions.md", "forge/lib/decide/instructions.md"],
    parameterNames: ["reason"],
  },
  {
    module: "grill-inline.ts",
    functionName: "formatInlineGrillInjection",
    skills: ["forge/lib/spec/instructions.md", "forge/lib/decide/instructions.md"],
    parameterNames: ["result", "mode"],
  },
  // --- Glossary Hook (7-phase unified dispatch) ---
  {
    module: "glossary-hook.ts",
    functionName: "runGlossaryCheck",
    skills: [
      "forge/lib/decide/instructions.md",
      "forge/lib/grill/instructions.md",
      "forge/lib/spec/instructions.md",
      "forge/lib/plan/instructions.md",
      "forge/lib/review/instructions.md",
      "forge/lib/learn/instructions.md",
      "forge/lib/build/instructions.md",
    ],
    parameterNames: ["input"],
  },
  {
    module: "glossary-hook.ts",
    functionName: "getAdvisoryPath",
    skills: ["forge/lib/spec/instructions.md"],
    parameterNames: ["phase", "topic"],
  },
  {
    module: "glossary-hook.ts",
    functionName: "renderPendingAdvisoryNotice",
    skills: ["forge/lib/plan/instructions.md"],
    parameterNames: ["paths"],
  },
  // --- forge-spec/SKILL.md (Living Doc, Sprint 3) ---
  {
    module: "living-doc/generator.ts",
    functionName: "generateLivingDoc",
    skills: ["forge/lib/spec/instructions.md"],
    parameterNames: ["specsDir", "acceptanceDir"],
  },
  {
    module: "living-doc/renderer.ts",
    functionName: "renderLivingDoc",
    skills: ["forge/lib/spec/instructions.md"],
    parameterNames: ["data", "outputDir"],
  },

  // --- forge-fix-conflicts/SKILL.md (conflict-resolver-hook) ---
  {
    module: "conflict-resolver.ts",
    functionName: "parseConflictedPaths",
    skills: ["forge/lib/fix-conflicts/instructions.md"],
    parameterNames: ["gitOutput"],
  },
  {
    module: "conflict-resolver.ts",
    functionName: "classifyConflictZone",
    skills: ["forge/lib/fix-conflicts/instructions.md"],
    parameterNames: ["path", "statusContent"],
  },
  {
    module: "conflict-resolver.ts",
    functionName: "applyGuardedMerge",
    skills: ["forge/lib/fix-conflicts/instructions.md"],
    parameterNames: ["type", "ours", "theirs"],
  },
  {
    module: "conflict-resolver.ts",
    functionName: "buildFrozenRefusalPrompt",
    skills: ["forge/lib/fix-conflicts/instructions.md"],
    parameterNames: ["paths"],
  },
  {
    module: "conflict-resolver.ts",
    functionName: "validateConflictResolution",
    skills: ["forge/lib/fix-conflicts/instructions.md"],
    parameterNames: ["attempts"],
  },
  {
    module: "conflict-resolver.ts",
    functionName: "resolveConflicts",
    skills: ["forge/lib/fix-conflicts/instructions.md"],
    parameterNames: ["paths", "mode", "context"],
  },

  // --- forge-spec/SKILL.md (spec-health) ---
  {
    module: "spec-health.ts",
    functionName: "checkSpecHealth",
    skills: ["forge/lib/spec/instructions.md"],
    parameterNames: ["input"],
  },

  // --- forge-spec/SKILL.md (three-file spec system) ---
  {
    module: "spec.ts",
    functionName: "routeSpecEntry",
    skills: ["forge/lib/spec/instructions.md"],
    parameterNames: ["argv", "featureDir", "outputDir", "existingBundle"],
  },
  {
    module: "plan.ts",
    functionName: "lockPlan",
    skills: ["forge/lib/plan/instructions.md"],
    parameterNames: ["doc"],
  },
  {
    module: "spec-plan-upgrade.ts",
    functionName: "upgradeTasksSeed",
    skills: ["forge/lib/plan/instructions.md"],
    parameterNames: ["doc"],
  },
  {
    module: "spec-migration.ts",
    functionName: "migrateLegacySpec",
    skills: ["forge/lib/spec/instructions.md"],
    parameterNames: ["featureDir"],
  },
  {
    module: "spec-refine.ts",
    functionName: "refineDownstream",
    skills: ["forge/lib/spec/instructions.md"],
    parameterNames: ["bundle", "target", "options"],
  },
  {
    module: "spec-import.ts",
    functionName: "runImportMode",
    skills: ["forge/lib/spec/instructions.md"],
    parameterNames: ["inputPath", "outputDir"],
  },
  {
    module: "spec-refine.ts",
    functionName: "detectSpecTriggers",
    skills: ["forge/lib/spec/instructions.md"],
    parameterNames: ["featureDir"],
  },
  {
    module: "spec-variant.ts",
    functionName: "resolveSpecVariant",
    skills: ["forge/lib/spec/instructions.md"],
    parameterNames: ["input"],
  },
  {
    module: "spec-analyze.ts",
    functionName: "analyzeRequirements",
    skills: ["forge/lib/spec/instructions.md"],
    parameterNames: ["req"],
  },

  // --- forge-build (wave orchestration + three-strike) ---
  {
    module: "spec-wave.ts",
    functionName: "parseWaves",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["jsonBlock", "tasks"],
  },
  {
    module: "build.ts",
    functionName: "scheduleWave",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["wave", "options"],
  },
  {
    module: "build.ts",
    functionName: "buildThreeStrikeDebugReroute",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["history", "currentFailure", "debugDir", "topic"],
  },
  {
    module: "spec-pbt-derivation.ts",
    functionName: "triggerThreeStrikeReroute",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["history", "currentFailure"],
  },
  {
    module: "spec-pbt-derivation.ts",
    functionName: "computeFailSignature",
    skills: ["forge/lib/build/instructions.md"],
    parameterNames: ["failures"],
  },

  // --- forge-fix (bugfix three-file workflow) ---
  {
    module: "spec-kind.ts",
    functionName: "detectSpecKind",
    skills: ["forge/lib/fix/instructions.md"],
    parameterNames: ["files", "mode"],
  },
  {
    module: "spec-bugfix-orchestration.ts",
    functionName: "runBugfixOrchestration",
    skills: ["forge/lib/fix/instructions.md"],
    parameterNames: ["bundle"],
  },

  // --- forge-test/SKILL.md (ci-drift) ---
  {
    module: "ci-command-drift.ts",
    functionName: "detectCiCommandDrift",
    skills: ["forge/lib/test/instructions.md"],
    parameterNames: ["frontmatter", "packageJsonRaw"],
  },
  {
    module: "test-engine.ts",
    functionName: "persistTestEvidenceArtifact",
    skills: ["forge/lib/test/instructions.md"],
    parameterNames: ["projectRoot", "input"],
  },

  // --- MCP Tools ---
  {
    module: "mcp/tools/forge-git.ts",
    functionName: "forge_git",
    skills: ["forge/lib/review/instructions.md"],
    parameterNames: ["subcommand", "args"],
    mcpTool: true,
  },

  // --- sandbox-phased.ts ---
  {
    module: "sandbox-phased.ts",
    functionName: "checkFilesystemPolicy",
    skills: [
      "forge/lib/build/instructions.md",
      "forge/lib/plan/instructions.md",
      "forge/lib/review/instructions.md",
    ],
    parameterNames: ["filePath", "operation", "config"],
  },
  {
    module: "sandbox-phased.ts",
    functionName: "checkCommandPolicy",
    skills: ["forge/lib/ship/instructions.md"],
    parameterNames: ["command", "config"],
  },
  {
    module: "sandbox-phased.ts",
    functionName: "checkNetworkPolicy",
    skills: [],
    parameterNames: ["url", "config"],
  },
  {
    module: "sandbox-phased.ts",
    functionName: "loadSandboxConfig",
    skills: [],
    parameterNames: ["configPath"],
  },
] as const;
