/**
 * Router Hint Rules — the (taskType, projectPhase) → RouteHint mapping table.
 *
 * Externalised from router.ts (REQ-07) so that adding a taskType×phase
 * combination is a data edit, not a code edit + accompanying test churn.
 * Mirrors the router-intents.ts precedent (intent dictionary as data).
 *
 * Design principle (from router.ts): hints are ADDITIVE. They never remove
 * commands from the sequence — that's the tier's job. They only add emphasis
 * or checks.
 *
 * Pure data module, zero IO, no runtime logic.
 */

// P3-2: import shared types from the leaf module (was from router.js, which
// created a router ↔ hint-rules back-edge).
import type { ProjectPhase, RouteHint, TaskType } from "./router-types.js";

export interface HintRule {
  /** Match any of these task types (empty = match all). */
  taskTypes: TaskType[];
  /** Match any of these project phases (empty = match all). */
  projectPhases: ProjectPhase[];
  /** The hint to inject. */
  hint: RouteHint;
}

export const HINT_RULES: readonly HintRule[] = [
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
