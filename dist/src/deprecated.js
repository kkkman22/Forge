/**
 * Deprecated re-exports — backward compatibility shim for v2.4→v2.5 migration.
 *
 * These symbols were removed from the public barrel (`src/index.ts`) in v2.4.0.
 * Import them directly from the source module or via `forge-loop/deprecated`.
 *
 * @deprecated Will be removed in v2.5.0. Import directly from source modules.
 */
/** @deprecated Import from forge-loop/error-recovery instead */
export { buildReconciliationPatch, buildRecoveryReport, calculateSegmentation, classifyInterruption, deserializeCheckpointMarker, deserializeClassification, deserializeRecoveryReport, extractCommitPatterns, filterCommitsSince, findDependencyGaps, findPhaseInconsistencies, findProgressInconsistencies, getNextPhase, getPhaseSequence, inferTDDPhase, isTestFile, matchChangesToTask, matchCommitsToTasks, PHASE_SEQUENCES, parseGitLog, parseGitStatus, serializeCheckpointMarker, serializeClassification, serializeRecoveryReport, TEST_FILE_PATTERNS, } from "./error-recovery.js";
/** @deprecated Import from forge-loop/orphan-detector instead */
export { cleanupOrphans, cleanupStaleSessions, deletePidFile, detectPpidOrphans, readPidFile, writePidFile, } from "./orphan-detector.js";
/** @deprecated Import from forge-loop/process-registry instead */
export { ProcessRegistry } from "./process-registry.js";
/** @deprecated Import from forge-loop/process-tree-cleaner instead */
export { getDescendants, killProcessGroup, killProcessTree } from "./process-tree-cleaner.js";
/** @deprecated Import from forge-loop/backlog instead */
export { appendToBacklog, findOverlappingEntries, generateBacklogHeader, parseBacklog, resolveEntry, serializeBacklog, } from "./backlog.js";
/** @deprecated Import from forge-loop/episode instead */
export { generateEpisodeId, parseEpisode, renderEpisode } from "./episode.js";
/** @deprecated Import from forge-loop/evolution-marker instead */
export { aggregateEvolutionMarkers, parseEvolutionMarkers, validateEvolutionTarget, } from "./evolution-marker.js";
/** @deprecated Import from forge-loop/failure-sink instead */
export { buildFailureEpisode, buildFailureEvolutionMarker } from "./failure-sink.js";
/** @deprecated Import from forge-loop/pattern-stats instead */
export { findStaleOrDecayedPatterns, findUpgradableEpisodes, parseInstinct, renderInstincts, updatePatternStats, } from "./pattern-stats.js";
// ---------------------------------------------------------------------------
// Branch lifecycle enforcement (removed in Wave 3 — loop-native-fusion)
// Functions inlined into branch-gate.ts. Other functions retired with SDK.
// ---------------------------------------------------------------------------
//# sourceMappingURL=deprecated.js.map