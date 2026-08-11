---
feature: error-recovery-strategy
layout: tasks
created: 2026-04-29
spec_ref: ".tinkerman/specs/error-recovery-strategy/requirements.md"
---

# Tasks

## Task 1: Create core data models and type definitions

- [x] 1.1 Create `src/error-recovery.ts` with all TypeScript interfaces: `GitCommitEntry`, `TaskCommitPattern`, `CommitTaskMatch`, `GitScanResult`, `FileChange`, `UncommittedChangeResult`, `ProgressTaskEntry`, `ProgressInconsistency`, `ProgressReconciliationPatch`, `DependencyGap`, `ForgePhase`, `ForgeTier`, `PhaseInconsistency`, `InterruptionCategory`, `TDDInterruptionPhase`, `InterruptionClassification`, `RecoveryInconsistencyItem`, `RecoveryActionOption`, `RecoveryReport`, `CheckpointMarker`, `TaskSegmentationInfo`
- [x] 1.2 Implement `PHASE_SEQUENCES` constant mapping each `ForgeTier` to its ordered `ForgePhase[]` array (lightweight: build→review, standard: plan→build→review→test→ship, full: decide→spec→plan→build→review→test→ship→learn)
- [x] 1.3 Implement `TEST_FILE_PATTERNS` constant array with the four regex patterns for test file identification (`*.test.ts`, `*.spec.ts`, `test/*`, `__tests__/*`)
- [x] 1.4 Export all types and constants from `src/error-recovery.ts` and add to `src/index.ts` barrel file

## Task 2: Implement Git_State_Scanner (parseGitLog, extractCommitPatterns, matchCommitsToTasks)

- [x] 2.1 Implement `parseGitLog(rawOutput: string): GitCommitEntry[]` that parses `git log --format` output into structured commit entries, handling empty output by returning an empty array
- [x] 2.2 Implement `extractCommitPatterns(planContent: string): TaskCommitPattern[]` that parses Plan_Document markdown content to extract task IDs, titles, commit message prefixes, and keywords for each task
- [x] 2.3 Implement `filterCommitsSince(commits: GitCommitEntry[], sinceTimestamp: string): GitCommitEntry[]` that filters commits to only those after the given ISO 8601 timestamp
- [x] 2.4 Implement `matchCommitsToTasks(commits: GitCommitEntry[], patterns: TaskCommitPattern[]): CommitTaskMatch[]` that matches commits to tasks using prefix + keyword matching with fuzzy tolerance for minor wording variations, returning confidence level (exact or fuzzy)
- [x] 2.5 Write property test in `test/error-recovery.property.test.ts` for Property 1 (commit pattern extraction): for any valid Plan_Document content, extractCommitPatterns returns a pattern for every task with a commit message
- [x] 2.6 Write property test in `test/error-recovery.property.test.ts` for Property 2 (commit-to-task matching): for any commits and patterns, matching requires prefix presence and does not match when prefix is absent

## Task 3: Implement Uncommitted_Change_Detector (parseGitStatus, matchChangesToTask)

- [x] 3.1 Implement `parseGitStatus(rawOutput: string): FileChange[]` that parses `git status --porcelain` output into structured file change entries, handling empty output by returning an empty array
- [x] 3.2 Implement `matchChangesToTask(changes: FileChange[], taskFilePaths: string[]): FileChange[]` that filters changes to only those whose file paths overlap with the task's expected file paths
- [x] 3.3 Write property test in `test/error-recovery.property.test.ts` for Property 3 (git status parsing): for any valid porcelain output, parseGitStatus returns correct file paths and statuses with matching count
- [x] 3.4 Write property test in `test/error-recovery.property.test.ts` for Property 4 (file change relevance): for any changes and task paths, matchChangesToTask returns exactly the overlapping changes

## Task 4: Implement Progress_Reconciler (findProgressInconsistencies, findDependencyGaps, buildReconciliationPatch)

- [x] 4.1 Implement `findProgressInconsistencies(matches: CommitTaskMatch[], progressEntries: ProgressTaskEntry[]): ProgressInconsistency[]` that identifies tasks with matching commits but not marked completed, including commit hash, message, and timestamp
- [x] 4.2 Implement `findDependencyGaps(inconsistencies: ProgressInconsistency[], progressEntries: ProgressTaskEntry[], taskOrder: string[]): DependencyGap[]` that detects when a committed task's preceding dependency is neither completed nor committed
- [x] 4.3 Implement `buildReconciliationPatch(inconsistencies: ProgressInconsistency[], taskOrder: string[]): ProgressReconciliationPatch[]` that generates patches ordered by Plan_Document task order with correct commit references
- [x] 4.4 Write property test in `test/error-recovery.property.test.ts` for Property 5 (progress inconsistency detection): for any matches and progress entries, flags exactly the committed-but-not-marked tasks with full commit details
- [x] 4.5 Write property test in `test/error-recovery.property.test.ts` for Property 6 (reconciliation patch ordering): for any shuffled inconsistencies and task order, patches are ordered by Plan order
- [x] 4.6 Write property test in `test/error-recovery.property.test.ts` for Property 7 (dependency gap detection): for any task chain with gaps, correctly identifies missing dependencies

## Task 5: Implement Phase_Reconciler (getPhaseSequence, getNextPhase, findPhaseInconsistencies)

- [x] 5.1 Implement `getPhaseSequence(tier: ForgeTier): ForgePhase[]` that returns the ordered phase array for the given tier from PHASE_SEQUENCES
- [x] 5.2 Implement `getNextPhase(currentPhase: ForgePhase, tier: ForgeTier): ForgePhase | null` that returns the next phase in the tier's sequence or null if at the end
- [x] 5.3 Implement `findPhaseInconsistencies(allTasksCompleted: boolean, currentPhase: ForgePhase, tier: ForgeTier): PhaseInconsistency | null` that detects "behind" (all completed but phase not advanced) and "ahead" (incomplete but phase advanced) inconsistencies
- [x] 5.4 Write property test in `test/error-recovery.property.test.ts` for Property 8 (phase inconsistency detection): for any (allCompleted, phase, tier) combination, correctly detects behind, ahead, or consistent state
- [x] 5.5 Write property test in `test/error-recovery.property.test.ts` for Property 9 (next phase computation): for any valid (phase, tier) where phase is in the sequence, returns the correct next phase or null

## Task 6: Implement Interruption_Classifier (classifyInterruption, isTestFile, inferTDDPhase)

- [x] 6.1 Implement `isTestFile(filePath: string): boolean` that matches file paths against TEST_FILE_PATTERNS
- [x] 6.2 Implement `inferTDDPhase(changes: FileChange[], verificationPassed: boolean | null): TDDInterruptionPhase | null` that infers the TDD phase from file changes (red, green-incomplete, refactor-incomplete, or null for ambiguous)
- [x] 6.3 Implement `classifyInterruption(uncommittedResult, gitScanResult, progressInconsistencies, phaseInconsistency, verificationPassed): InterruptionClassification` that classifies the interruption in priority order (a→b→c→d→e), returning the first matching category with evidence
- [x] 6.4 Write property test in `test/error-recovery-classifier.property.test.ts` for Property 10 (classification totality + evidence): for any input combination, returns exactly one category whose evidence conditions are satisfied
- [x] 6.5 Write property test in `test/error-recovery-classifier.property.test.ts` for Property 11 (classification priority): for any input where multiple conditions are true, returns the highest-priority category
- [x] 6.6 Write property test in `test/error-recovery-classifier.property.test.ts` for Property 12 (TDD phase inference): for any file changes with test files, correctly infers the TDD phase
- [x] 6.7 Write property test in `test/error-recovery-classifier.property.test.ts` for Property 13 (test file identification): for any file path, isTestFile returns true iff it matches a test file pattern

## Task 7: Implement Recovery_Engine report builder (buildRecoveryReport, calculateSegmentation)

- [x] 7.1 Implement `buildRecoveryReport(header, progressInconsistencies, phaseInconsistency, classification, uncommittedResult, dependencyGaps): RecoveryReport` that aggregates all inconsistencies into a single report with action options (including default recommendations) and correct summary counts
- [x] 7.2 Implement `calculateSegmentation(planTaskIds, completedTaskIds, commitMatches, currentInterruption): TaskSegmentationInfo` that partitions tasks into completed (with commit refs), current (with interruption state), and remaining, with no duplicates
- [x] 7.3 Write property test in `test/error-recovery-report.property.test.ts` for Property 14 (report completeness): for any inputs, report includes all inconsistencies with required fields, action options with one default each, and correct summary counts
- [x] 7.4 Write property test in `test/error-recovery-report.property.test.ts` for Property 15 (task segmentation): for any task IDs and completion state, segmentation covers all tasks with no duplicates and consistent lastCompletedIndex

## Task 8: Implement Recovery_Report serializer and deserializer

- [x] 8.1 Implement `serializeRecoveryReport(report: RecoveryReport): string` that produces the structured Markdown format with YAML frontmatter header, inconsistency sections, action options, and summary
- [x] 8.2 Implement `deserializeRecoveryReport(markdown: string): RecoveryReport` that parses the structured Markdown format back into a RecoveryReport object
- [x] 8.3 Write property test in `test/error-recovery-roundtrip.property.test.ts` for Property 16 (Recovery_Report round-trip): for any valid RecoveryReport, serialize then deserialize yields semantically equivalent object

## Task 9: Implement InterruptionClassification and CheckpointMarker serializers

- [x] 9.1 Implement `serializeClassification(classification: InterruptionClassification): string` and `deserializeClassification(text: string): InterruptionClassification` for structured text serialization
- [x] 9.2 Implement `serializeCheckpointMarker(marker: CheckpointMarker): string` and `deserializeCheckpointMarker(text: string): CheckpointMarker` for structured text serialization
- [x] 9.3 Write property test in `test/error-recovery-roundtrip.property.test.ts` for Property 17 (InterruptionClassification round-trip): for any valid InterruptionClassification, serialize then deserialize yields semantically equivalent object
- [x] 9.4 Write property test in `test/error-recovery-roundtrip.property.test.ts` for Property 18 (CheckpointMarker round-trip): for any valid CheckpointMarker, serialize then deserialize yields semantically equivalent object

## Task 10: Write unit tests for edge cases and specific scenarios

- [x] 10.1 Write unit tests in `test/error-recovery.test.ts` for edge cases: empty git log output, empty git status output, Plan_Document with no commit patterns, missing phase field in Status_Document
- [x] 10.2 Write unit tests for report action options: verification passed → commit/discard options, verification failed → keep/discard options, TDD RED → preserve/discard options, TDD REFACTOR → commit/continue options
- [x] 10.3 Write unit tests for phase sequence correctness: getPhaseSequence returns correct sequences for all three tiers
- [x] 10.4 Write unit tests for fix dependency ordering: progress patches applied before phase patches
- [x] 10.5 Write unit tests for clean state: zero inconsistencies triggers standard five-question format
- [x] 10.6 Write unit tests for checkpoint marker without matching commit: classification is "task-completed-not-committed"

## Task 11: Export module and run full test suite

- [x] 11.1 Verify all exports from `src/error-recovery.ts` are included in `src/index.ts` barrel file
- [x] 11.2 Run `npx vitest run` to verify all new and existing tests pass
- [x] 11.3 Run `npx tsc --noEmit` to verify no type errors
- [x] 11.4 Run the project's full CI check command (`npm run check`) to verify no regressions
