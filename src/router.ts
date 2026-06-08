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

import { readFileSync } from "node:fs";
import { PromptDefenseError } from "./forge-error.js";
import { scanInput } from "./prompt-defense.js";
import { intentsToHints, matchIntents, parseIntentDictionary } from "./router-intents.js";

// ---------------------------------------------------------------------------
// Tier (complexity dimension) — determines WHICH commands to run
// ---------------------------------------------------------------------------

export type Tier = "light" | "standard" | "full";

// ---------------------------------------------------------------------------
// TaskType (domain dimension) — determines HOW each command behaves
// ---------------------------------------------------------------------------

export type TaskType = "frontend" | "backend" | "fullstack" | "data" | "infra" | "docs";

// ---------------------------------------------------------------------------
// ProjectPhase (lifecycle dimension) — determines WHAT to emphasize
// ---------------------------------------------------------------------------

export type ProjectPhase = "greenfield" | "iteration" | "refactor" | "bugfix";

// ---------------------------------------------------------------------------
// WorkNature (work-nature dimension) — determines WHICH command sequence
// ---------------------------------------------------------------------------

export type WorkNature = "feature" | "refactor" | "bugfix";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

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
  /** Origin of this hint. Defaults to 'taskType' when serialized. */
  source?: "taskType" | "projectPhase" | "workNature" | "intent";
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

// ---------------------------------------------------------------------------
// Command sequences per tier (unchanged)
// ---------------------------------------------------------------------------

/**
 * Command sequences for each tier in the complete interactive workflow.
 *
 * The `full` sequence includes `decide` and `spec` phases because the Router
 * is responsible for the entire interactive workflow — from initial decision
 * and specification through to learning. The Skill Scheduler uses a separate
 * set of sequences that omit these early phases, since it only handles SKILL
 * execution (plan → build → review → test → ship → learn).
 *
 * @see src/skill-scheduler.ts SKILL_COMMAND_SEQUENCES
 */
const COMMAND_SEQUENCES: Record<Tier, string[]> = {
  light: ["build", "review"],
  standard: ["plan", "build", "review", "test", "ship"],
  full: ["decide", "spec", "plan", "build", "review", "test", "ship", "learn"],
};

// ---------------------------------------------------------------------------
// Intent dictionary loader (lazy, cached)
// ---------------------------------------------------------------------------

const MAX_RUNTIME_INTENT_HINTS = 5;

let _intentDictCache: import("./router-intents.js").IntentDefinition[] | null = null;

function loadIntentDictionary(): import("./router-intents.js").IntentDefinition[] {
  if (_intentDictCache !== null) return _intentDictCache;
  try {
    const dictUrls = [
      new URL("../templates/router-intents.md", import.meta.url),
      new URL("../../templates/router-intents.md", import.meta.url),
    ];
    let content: string | null = null;
    for (const dictUrl of dictUrls) {
      try {
        content = readFileSync(dictUrl, "utf-8");
        break;
      } catch {
        // Try the next known runtime layout: src/, dist/src/, dist-plugin/dist/src/.
      }
    }
    if (content === null) {
      throw new Error(
        `router-intents.md not found in: ${dictUrls.map((u) => u.pathname).join(", ")}`,
      );
    }
    _intentDictCache = parseIntentDictionary(content);
  } catch (err: unknown) {
    // Structured diagnostic instead of silent swallow
    // biome-ignore lint/suspicious/noConsole: structured diagnostic for intent dictionary load failure
    console.error(
      "[router] Failed to load intent dictionary:",
      err instanceof Error ? err.message : String(err),
    );
    _intentDictCache = [];
  }
  return _intentDictCache;
}

/** @visibleForTesting Reset the cached intent dictionary (for tests). */
export function _resetIntentDictCache(): void {
  _intentDictCache = null;
}

// ---------------------------------------------------------------------------
// WorkNature detection — keyword-based classification
// ---------------------------------------------------------------------------

/** Keywords that indicate a refactor work nature. */
const REFACTOR_KEYWORDS = [
  "优化",
  "重构",
  "重写",
  "拆分",
  "性能改进",
  "代码整理",
  "refactor",
  "optimize",
  "restructure",
  "simplify",
];

/** Keywords that indicate a bugfix work nature. */
const BUGFIX_KEYWORDS = [
  "bug",
  "报错",
  "异常",
  "崩溃",
  "不工作",
  "修复",
  "fix",
  "error",
  "crash",
  "broken",
  "not working",
];

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
export function detectWorkNature(description: string): WorkNature {
  const lower = description.toLowerCase();

  const hasRefactorKeyword = REFACTOR_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
  const hasBugfixKeyword = BUGFIX_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));

  // If both refactor and bugfix keywords are present, default to feature (ambiguous)
  if (hasRefactorKeyword && hasBugfixKeyword) {
    return "feature";
  }

  if (hasBugfixKeyword) {
    return "bugfix";
  }

  if (hasRefactorKeyword) {
    return "refactor";
  }

  return "feature";
}

// ---------------------------------------------------------------------------
// WorkNature × Tier → command sequence key mapping
// ---------------------------------------------------------------------------

/**
 * Map a WorkNature × Tier combination to the correct command sequence key
 * used by the Skill Scheduler.
 *
 * Mapping:
 * - feature + light → "light", feature + standard → "standard", feature + full → "full"
 * - refactor + light → "refactor_light", refactor + standard/full → "refactor_standard"
 * - bugfix + light → "fix_light", bugfix + standard/full → "fix_standard"
 *
 * Consumed by `sdk-status-helpers.initializeLoopFields()` for WorkNature-aware
 * sequence selection.
 */
export function getWorkNatureSequenceKey(workNature: WorkNature, tier: Tier): string {
  if (workNature === "feature") {
    return tier;
  }
  if (workNature === "refactor") {
    return tier === "light" ? "refactor_light" : "refactor_standard";
  }
  // bugfix
  return tier === "light" ? "fix_light" : "fix_standard";
}

// ---------------------------------------------------------------------------
// Tier classification helpers (unchanged logic)
// ---------------------------------------------------------------------------

function hasFullSignals(signals: TaskSignals): boolean {
  return (
    signals.hasNewService ||
    signals.hasNewDatabase ||
    signals.hasAuthChanges ||
    signals.isVagueRequirement
  );
}

function hasStandardSignals(signals: TaskSignals): boolean {
  return signals.hasExistingSpec || signals.hasClearRequirements;
}

function hasLightSignals(signals: TaskSignals): boolean {
  return signals.filesAffected <= 1 && signals.linesChanged <= 20;
}

/**
 * Determine whether a brownfield project should receive a tier boost.
 *
 * Currently implements light → standard promotion only.
 *
 * **Design decision — standard → full promotion not implemented:**
 * A standard → full boost for brownfield projects with `hasAuthChanges` or
 * `hasNewService` is unnecessary because those signals already trigger the
 * `full` tier directly via `hasFullSignals()`, which is evaluated before
 * standard signals in `classifyTier`. There is no reachable code path where
 * a task has auth changes or a new service AND is classified as `standard` —
 * those signals always short-circuit to `full` first.
 *
 * If future signal combinations allow standard classification alongside
 * auth/service changes (e.g., a user override or new priority rules),
 * revisit this function to add standard → full promotion.
 *
 * @see classifyTier — tier classification priority order
 * @see hasFullSignals — signals that directly trigger full tier
 */
function shouldBrownfieldBoost(context?: ProjectContext): boolean {
  if (!context) return false;
  return context.projectType === "brownfield" && context.touchesExistingModules;
}

// ---------------------------------------------------------------------------
// Tier classification (core logic — unchanged from v1.1)
// ---------------------------------------------------------------------------

interface TierResult {
  tier: Tier;
  reason: string;
}

function classifyTier(
  signals: TaskSignals,
  userOverride?: Tier,
  projectContext?: ProjectContext,
): TierResult {
  if (userOverride) {
    return { tier: userOverride, reason: `用户明确指定档位: ${userOverride}` };
  }

  if (hasFullSignals(signals)) {
    const reasons: string[] = [];
    if (signals.hasNewService) reasons.push("涉及新服务");
    if (signals.hasNewDatabase) reasons.push("涉及新数据库");
    if (signals.hasAuthChanges) reasons.push("涉及认证体系变更");
    if (signals.isVagueRequirement) reasons.push("需求描述模糊");
    return { tier: "full", reason: reasons.join("、") };
  }

  if (hasStandardSignals(signals)) {
    const reasons: string[] = [];
    if (signals.hasExistingSpec) reasons.push("有现成 Spec");
    if (signals.hasClearRequirements) reasons.push("需求已明确");
    return { tier: "standard", reason: reasons.join("、") };
  }

  if (hasLightSignals(signals)) {
    if (shouldBrownfieldBoost(projectContext)) {
      return {
        tier: "standard",
        reason: `影响文件 ${signals.filesAffected} 个，改动 ${signals.linesChanged} 行，但项目为棕地且涉及现有模块，提升至标准路径`,
      };
    }
    return {
      tier: "light",
      reason: `影响文件 ${signals.filesAffected} 个，改动 ${signals.linesChanged} 行`,
    };
  }

  return { tier: "standard", reason: "无法明确判定，默认选择标准路径" };
}

// ---------------------------------------------------------------------------
// Hint generation — the core of the new routing dimensions
// ---------------------------------------------------------------------------

/**
 * Hint registry: maps (taskType, projectPhase) combinations to behavioral
 * hints for specific commands. Each hint tells a downstream skill HOW to
 * adjust its behavior.
 *
 * Design principle: hints are ADDITIVE. They never remove commands from the
 * sequence — that's the tier's job. They only add emphasis or checks.
 */

interface HintRule {
  /** Match any of these task types (empty = match all). */
  taskTypes: TaskType[];
  /** Match any of these project phases (empty = match all). */
  projectPhases: ProjectPhase[];
  /** The hint to inject. */
  hint: RouteHint;
}

const HINT_RULES: HintRule[] = [
  // ── Frontend hints ──────────────────────────────────────────────────
  {
    taskTypes: ["frontend"],
    projectPhases: [],
    hint: {
      command: "review",
      tag: "a11y-check",
      description: "增加可访问性检查（WCAG 2.1 AA 级别对照）",
    },
  },
  {
    taskTypes: ["frontend"],
    projectPhases: [],
    hint: {
      command: "review",
      tag: "responsive-check",
      description: "检查响应式布局在主流断点下的表现",
    },
  },
  {
    taskTypes: ["frontend"],
    projectPhases: [],
    hint: {
      command: "test",
      tag: "visual-regression",
      description: "建议运行视觉回归测试（如有配置）",
    },
  },
  {
    taskTypes: ["frontend"],
    projectPhases: [],
    hint: {
      command: "build",
      tag: "component-isolation",
      description: "优先以组件为单位拆分任务，每个组件独立测试",
    },
  },

  // ── Backend hints ───────────────────────────────────────────────────
  {
    taskTypes: ["backend"],
    projectPhases: [],
    hint: {
      command: "review",
      tag: "api-contract-check",
      description: "检查 API 契约向后兼容性（请求/响应 schema 变更）",
    },
  },
  {
    taskTypes: ["backend"],
    projectPhases: [],
    hint: {
      command: "review",
      tag: "n-plus-one-check",
      description: "重点检查 N+1 查询和数据库性能热点",
    },
  },
  {
    taskTypes: ["backend"],
    projectPhases: [],
    hint: {
      command: "test",
      tag: "integration-test",
      description: "除单元测试外，补充 API 集成测试",
    },
  },
  {
    taskTypes: ["backend"],
    projectPhases: [],
    hint: {
      command: "build",
      tag: "migration-safety",
      description: "数据库变更必须有可回滚的迁移脚本",
    },
  },

  // ── Data hints ──────────────────────────────────────────────────────
  {
    taskTypes: ["data"],
    projectPhases: [],
    hint: {
      command: "review",
      tag: "data-integrity-check",
      description: "检查数据一致性约束和边界值处理",
    },
  },
  {
    taskTypes: ["data"],
    projectPhases: [],
    hint: {
      command: "test",
      tag: "data-validation",
      description: "测试数据管道的输入验证和异常数据处理",
    },
  },
  {
    taskTypes: ["data"],
    projectPhases: [],
    hint: {
      command: "plan",
      tag: "data-volume-estimate",
      description: "在计划中估算数据量级，选择合适的处理策略",
    },
  },

  // ── Infra hints ─────────────────────────────────────────────────────
  {
    taskTypes: ["infra"],
    projectPhases: [],
    hint: {
      command: "review",
      tag: "iac-drift-check",
      description: "检查基础设施代码与实际状态的漂移风险",
    },
  },
  {
    taskTypes: ["infra"],
    projectPhases: [],
    hint: {
      command: "build",
      tag: "dry-run-first",
      description: "变更前先执行 dry-run / plan，确认影响范围",
    },
  },
  {
    taskTypes: ["infra"],
    projectPhases: [],
    hint: {
      command: "review",
      tag: "blast-radius",
      description: "评估变更的爆炸半径，标注受影响的服务和环境",
    },
  },

  // ── Docs hints ──────────────────────────────────────────────────────
  {
    taskTypes: ["docs"],
    projectPhases: [],
    hint: {
      command: "review",
      tag: "accuracy-check",
      description: "对照代码验证文档中的示例和 API 签名是否准确",
    },
  },
  {
    taskTypes: ["docs"],
    projectPhases: [],
    hint: {
      command: "review",
      tag: "link-check",
      description: "检查文档中的链接是否有效",
    },
  },

  // ── Greenfield phase hints ──────────────────────────────────────────
  {
    taskTypes: [],
    projectPhases: ["greenfield"],
    hint: {
      command: "plan",
      tag: "scaffold-first",
      description: "优先搭建项目骨架和基础设施，再实现业务逻辑",
    },
  },
  {
    taskTypes: [],
    projectPhases: ["greenfield"],
    hint: {
      command: "decide",
      tag: "tech-stack-review",
      description: "决策阶段需评估技术栈选型的长期影响",
    },
  },

  // ── Iteration phase hints ───────────────────────────────────────────
  {
    taskTypes: [],
    projectPhases: ["iteration"],
    hint: {
      command: "review",
      tag: "backward-compat",
      description: "检查变更对现有用户和 API 消费者的向后兼容性",
    },
  },
  {
    taskTypes: [],
    projectPhases: ["iteration"],
    hint: {
      command: "test",
      tag: "regression-suite",
      description: "确保运行完整回归测试套件",
    },
  },

  // ── Refactor phase hints ────────────────────────────────────────────
  {
    taskTypes: [],
    projectPhases: ["refactor"],
    hint: {
      command: "plan",
      tag: "behavior-preservation",
      description: "计划中明确标注：每个任务不得改变外部可观察行为",
    },
  },
  {
    taskTypes: [],
    projectPhases: ["refactor"],
    hint: {
      command: "test",
      tag: "characterization-tests",
      description: "重构前先补充特征测试，锁定现有行为",
    },
  },
  {
    taskTypes: [],
    projectPhases: ["refactor"],
    hint: {
      command: "build",
      tag: "small-steps",
      description: "每步重构尽量小，每步都运行测试确认无回归",
    },
  },
  {
    taskTypes: [],
    projectPhases: ["refactor"],
    hint: {
      command: "review",
      tag: "behavior-diff",
      description: "评审重点：确认重构未引入行为变更",
    },
  },

  // ── Bugfix phase hints ──────────────────────────────────────────────
  {
    taskTypes: [],
    projectPhases: ["bugfix"],
    hint: {
      command: "build",
      tag: "reproduce-first",
      description: "先写复现 bug 的失败测试，再修复（TDD 的 RED 即复现）",
    },
  },
  {
    taskTypes: [],
    projectPhases: ["bugfix"],
    hint: {
      command: "plan",
      tag: "root-cause-focus",
      description: "计划中必须包含根因分析，不只是修复表面症状",
    },
  },
  {
    taskTypes: [],
    projectPhases: ["bugfix"],
    hint: {
      command: "test",
      tag: "regression-for-fix",
      description: "修复后补充回归测试，防止同类 bug 再次出现",
    },
  },

  // ── Cross-dimension: frontend + refactor ────────────────────────────
  {
    taskTypes: ["frontend"],
    projectPhases: ["refactor"],
    hint: {
      command: "test",
      tag: "snapshot-update",
      description: "重构后检查并更新组件快照测试",
    },
  },

  // ── Cross-dimension: backend + bugfix ───────────────────────────────
  {
    taskTypes: ["backend"],
    projectPhases: ["bugfix"],
    hint: {
      command: "review",
      tag: "error-path-audit",
      description: "审查错误处理路径，确认 bug 修复覆盖了所有错误分支",
    },
  },

  // ── Cross-dimension: infra + greenfield ─────────────────────────────
  {
    taskTypes: ["infra"],
    projectPhases: ["greenfield"],
    hint: {
      command: "decide",
      tag: "cost-estimate",
      description: "决策阶段需估算基础设施成本",
    },
  },
];

/**
 * Generate hints for a given task type, project phase, and command sequence.
 * Only returns hints whose command appears in the active command sequence.
 */
export function generateHints(
  taskType: TaskType,
  projectPhase: ProjectPhase,
  commandSequence: string[],
): RouteHint[] {
  const commandSet = new Set(commandSequence);
  const hints: RouteHint[] = [];

  for (const rule of HINT_RULES) {
    // Check task type match (empty = match all)
    const typeMatch = rule.taskTypes.length === 0 || rule.taskTypes.includes(taskType);
    // Check phase match (empty = match all)
    const phaseMatch = rule.projectPhases.length === 0 || rule.projectPhases.includes(projectPhase);
    // Check command is in active sequence
    const commandActive = commandSet.has(rule.hint.command);

    if (typeMatch && phaseMatch && commandActive) {
      hints.push({ ...rule.hint, source: "taskType" });
    }
  }

  // Deduplicate by tag (same tag from different rules = keep first)
  const seen = new Set<string>();
  return hints.filter((h) => {
    if (seen.has(h.tag)) return false;
    seen.add(h.tag);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main classification function
// ---------------------------------------------------------------------------

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
export function classifyTask(
  signals: TaskSignals,
  userOverride?: Tier,
  projectContext?: ProjectContext,
  taskType: TaskType = "fullstack",
  projectPhase: ProjectPhase = "iteration",
  workNature: WorkNature = "feature",
  rawDescription?: string,
): ClassificationResult {
  const { tier, reason } = classifyTier(signals, userOverride, projectContext);
  const commandSequence = COMMAND_SEQUENCES[tier];
  const hints = generateHints(taskType, projectPhase, commandSequence);

  let suppressIntent = false;

  // Prompt defense: scan raw description when provided. Critical threats
  // throw immediately so the task never reaches downstream skills; high /
  // medium threats surface as RouteHints so skills can decide how to react.
  if (rawDescription !== undefined && rawDescription !== "") {
    const scan = scanInput(rawDescription);
    const critical = scan.threats.filter((t) => t.severity === "critical");
    if (critical.length > 0) {
      throw new PromptDefenseError(
        `Input rejected by prompt-defense: ${critical.length} critical threat(s) detected`,
        critical,
      );
    }

    // R7-6: critical/high suppress intent matching
    const highSeverity = scan.threats.filter((t) => t.severity === "high");
    if (highSeverity.length > 0) {
      suppressIntent = true;
    }

    for (const threat of scan.threats) {
      if (threat.severity === "high" || threat.severity === "medium") {
        hints.push({
          command: "*",
          tag: "prompt-defense-warning",
          description: `${threat.type} detected (${threat.severity}); pattern ${threat.pattern}`,
          source: "taskType",
        });
      }
    }
  }

  // Intent matching (R7-8/R7-7: runs when not suppressed)
  let intentReasonSuffix = "";
  if (!suppressIntent && rawDescription !== undefined && rawDescription !== "") {
    try {
      const dict = loadIntentDictionary();
      const matched = matchIntents(rawDescription, dict);
      if (matched.length > 0) {
        let intentHints = intentsToHints(matched);

        // R7-2: Filter unreachable hints (command not in tier's sequence)
        const cmdSet = new Set(commandSequence);
        intentHints = intentHints.filter((h) => {
          if (cmdSet.has(h.command)) return true;
          return false;
        });

        // R7-3: Deduplicate by (command, tag)
        const existingKeys = new Set(hints.map((h) => `${h.command}:${h.tag}`));
        for (const ih of intentHints) {
          const key = `${ih.command}:${ih.tag}`;
          if (!existingKeys.has(key)) {
            hints.push(ih);
            existingKeys.add(key);
          }
        }

        // R7-5: Append intent names to reason
        const names = [...new Set(matched.map((m) => m.name))];
        intentReasonSuffix = `\nintent: ${names.join(", ")} (命中)`;

        // R6-4: Soft warning for overload
        const intentCount = hints.filter((h) => h.source === "intent").length;
        if (intentCount > MAX_RUNTIME_INTENT_HINTS) {
          process.stderr.write(
            `[intent_overload] ${intentCount} intent hints emitted (threshold: ${MAX_RUNTIME_INTENT_HINTS})\n`,
          );
        }
      }
    } catch (_err: unknown) {
      // R2-4: Dictionary load failure → skip intent step, no blocking
    }
  }

  const assumptions = generateAssumptions(signals, projectContext);

  return {
    tier,
    reason: reason + intentReasonSuffix,
    commandSequence,
    taskType,
    projectPhase,
    work_nature: workNature,
    hints,
    assumptions,
  };
}

// ---------------------------------------------------------------------------
// Assumption generation (Requirement 3.1–3.5)
// ---------------------------------------------------------------------------

/**
 * Generate explicit assumptions from task signals and project context.
 * Each assumption is derived from actual signals, NOT generic templates.
 *
 * @param signals — task complexity signals
 * @param projectContext — optional project context
 * @returns 3–5 assumptions with cited sources
 */
function generateAssumptions(signals: TaskSignals, projectContext?: ProjectContext): string[] {
  const assumptions: string[] = [];

  // 1. Project type / tech stack assumption
  if (projectContext?.projectType === "brownfield") {
    assumptions.push("项目为棕地（brownfield）类型，修改需兼容现有模块（基于 projectType 扫描）");
  } else if (projectContext?.projectType === "greenfield") {
    assumptions.push("项目为绿地（greenfield）类型，可自由引入新技术栈（基于 projectType 扫描）");
  }

  // 2. Impact scope assumption
  if (signals.filesAffected <= 1 && signals.linesChanged <= 20) {
    assumptions.push(
      `影响范围极小（${signals.filesAffected} 文件 / ${signals.linesChanged} 行），适合轻量路径（基于 filesAffected × linesChanged 信号）`,
    );
  } else if (signals.filesAffected > 5 || signals.linesChanged > 200) {
    assumptions.push(
      `影响范围较大（${signals.filesAffected} 文件 / ${signals.linesChanged} 行），可能涉及多模块协调（基于 filesAffected × linesChanged 信号）`,
    );
  }

  // 3. Requirement clarity assumption
  if (signals.isVagueRequirement) {
    assumptions.push(
      "需求描述存在模糊信号，需在全量路径中通过 decide/spec 阶段澄清（基于需求清晰度信号）",
    );
  } else if (signals.hasClearRequirements) {
    assumptions.push("需求信号明确，可直接进入标准路径执行（基于需求清晰度信号）");
  }

  // 4. Spec availability assumption
  if (signals.hasExistingSpec) {
    assumptions.push("存在已锁定 Spec，build 阶段可直接对照（基于 hasExistingSpec 信号）");
  } else {
    assumptions.push(
      "无现成 Spec，标准路径下 build 需自行推断需求边界（基于 hasExistingSpec 信号）",
    );
  }

  // 5. Architecture change assumption
  if (signals.hasNewService || signals.hasNewDatabase || signals.hasAuthChanges) {
    const changes: string[] = [];
    if (signals.hasNewService) changes.push("新服务");
    if (signals.hasNewDatabase) changes.push("新数据库");
    if (signals.hasAuthChanges) changes.push("认证变更");
    assumptions.push(
      `涉及架构级变更（${changes.join("、")}），需额外关注兼容性审查（基于架构变更信号）`,
    );
  }

  // Return 3–5 assumptions; if fewer than 3, supplement with a generic
  // project-type fallback so the array is never empty in practice.
  if (assumptions.length < 3 && projectContext === undefined) {
    assumptions.push(
      "项目上下文未提供，技术栈和影响范围假设基于信号推断（基于 TaskSignals 默认值）",
    );
  }

  return assumptions.slice(0, 5);
}
