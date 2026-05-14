/**
 * Router classification logic for Forge.
 *
 * Three routing dimensions:
 *
 * 1. **Tier** (complexity) — light / standard / full
 *    Determines WHICH commands to run.
 *
 * 2. **TaskType** (domain) — frontend / backend / fullstack / data / infra / docs
 *    Determines HOW each command behaves (e.g., review adds a11y checks for frontend).
 *
 * 3. **ProjectPhase** (lifecycle) — greenfield / iteration / refactor / bugfix
 *    Determines WHAT to emphasize (e.g., refactor emphasizes regression tests).
 *
 * Priority for tier classification (high → low):
 *   1. User override (always wins)
 *   2. Full signals (any match → full, never downgraded)
 *   3. Standard signals (clear requirements or existing spec)
 *   4. Light signals (≤ 1 file AND ≤ 20 lines)
 *   5. Default → standard ("宁重勿轻")
 *
 * Project context:
 *   - projectType: "greenfield" | "brownfield" | "unknown"
 *   - Brownfield projects boost light → standard when touching existing modules
 */
export type Tier = "light" | "standard" | "full";
export type TaskType = "frontend" | "backend" | "fullstack" | "data" | "infra" | "docs";
export type ProjectPhase = "greenfield" | "iteration" | "refactor" | "bugfix";
export type WorkNature = "feature" | "refactor" | "bugfix";
export interface TaskSignals {
    filesAffected: number;
    linesChanged: number;
    hasExistingSpec: boolean;
    hasNewService: boolean;
    hasNewDatabase: boolean;
    hasAuthChanges: boolean;
    isVagueRequirement: boolean;
    hasClearRequirements: boolean;
}
export type ProjectType = "greenfield" | "brownfield" | "unknown";
export interface ProjectContext {
    /** Project type affects routing: brownfield projects are more cautious. */
    projectType: ProjectType;
    /** Whether the task touches existing modules (relevant for brownfield). */
    touchesExistingModules: boolean;
}
/**
 * A behavioral hint injected into the command sequence based on task type
 * and project phase. Downstream skills read these to adjust their behavior.
 */
export interface RouteHint {
    /** Which command this hint applies to. */
    command: string;
    /** Short machine-readable tag for the hint. */
    tag: string;
    /** Human-readable description of the behavioral adjustment. */
    description: string;
}
export interface ClassificationResult {
    tier: Tier;
    reason: string;
    commandSequence: string[];
    /** Domain dimension — what kind of work this is. */
    taskType: TaskType;
    /** Lifecycle dimension — what phase the project is in. */
    projectPhase: ProjectPhase;
    /** Work-nature dimension — feature, refactor, or bugfix. */
    work_nature: WorkNature;
    /** Behavioral hints for downstream commands. */
    hints: RouteHint[];
    /** Explicit assumptions surfaced during routing analysis. */
    assumptions: string[];
}
/**
 * Detect the work nature from a task description using keyword matching.
 *
 * Rules:
 * - Returns "refactor" when description contains refactor keywords
 *   and does NOT contain bugfix keywords.
 * - Returns "bugfix" when description contains bugfix keywords
 *   and describes existing functionality issues.
 * - Returns "feature" as default when description is ambiguous or
 *   doesn't match the above patterns.
 */
export declare function detectWorkNature(description: string): WorkNature;
/**
 * Map a WorkNature × Tier combination to the correct command sequence key
 * used by the Skill Scheduler.
 *
 * Mapping:
 * - feature + light → "light", feature + standard → "standard", feature + full → "full"
 * - refactor + light → "refactor_light", refactor + standard/full → "refactor_standard"
 * - bugfix + light → "fix_light", bugfix + standard/full → "fix_standard"
 *
 * @visibleForTesting Currently only used in tests. May be connected to
 * production call points in the future when the Skill Scheduler consumes
 * work-nature routing directly.
 */
export declare function getWorkNatureSequenceKey(workNature: WorkNature, tier: Tier): string;
/**
 * Generate hints for a given task type, project phase, and command sequence.
 * Only returns hints whose command appears in the active command sequence.
 */
export declare function generateHints(taskType: TaskType, projectPhase: ProjectPhase, commandSequence: string[]): RouteHint[];
/**
 * Classify a task across four dimensions:
 *
 * 1. Tier (complexity) — from signals + user override + project context
 * 2. TaskType (domain) — from caller analysis
 * 3. ProjectPhase (lifecycle) — from caller analysis
 * 4. WorkNature (work nature) — from description keywords or user override
 *
 * The tier determines the command sequence. The task type and project phase
 * generate behavioral hints that downstream skills use to adjust their behavior.
 * The work nature determines which command sequence variant to use.
 *
 * Backward compatible: taskType defaults to "fullstack", projectPhase defaults
 * to "iteration", workNature defaults to "feature" when not provided.
 *
 * Prompt defense (Requirement 5.5–5.7): when `rawDescription` is provided,
 * the router runs `scanInput` on it. Critical threats raise
 * `PromptDefenseError`; high / medium threats add a
 * `tag: "prompt-defense-warning"` RouteHint on `command: "*"`.
 */
export declare function classifyTask(signals: TaskSignals, userOverride?: Tier, projectContext?: ProjectContext, taskType?: TaskType, projectPhase?: ProjectPhase, workNature?: WorkNature, rawDescription?: string): ClassificationResult;
