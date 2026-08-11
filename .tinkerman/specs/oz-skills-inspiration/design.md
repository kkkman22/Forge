---
feature: oz-skills-inspiration
layout: design
created: 2026-05-08
---

# 设计文档：oz-skills-inspiration

## Overview

本设计把 6 个需求分为 4 个 phase 推进，按价值降序 + 依赖顺序实施。与既有 Forge spec 对齐的设计原则：

1. **零新增运行时依赖**：所有能力本地可运行；axe-core 作为 git-tracked vendor 文件
2. **纯函数优先**：核心模块 FCIS 风格，IO 注入 driver 层；property-based test 覆盖
3. **镜像既有验证器风格**：新增校验脚本对齐 `scripts/validate-skill-descriptions.mjs` / `validate-skill-length.mjs` 的内联实现风格，不引入新构建产物依赖
4. **渐进迁移**：规则先以 warning 模式引入，迁移完成后切换 error；已有 skill 默认豁免
5. **与 skills-cross-pollination 正交**：本 spec 需求 1（两句式）与前者需求 3（失败模式语义）取并集；需求 2（骨架）与前者需求 5（progressive disclosure）同层互补——前者管内容组织，后者管行数上限
6. **不修改冻结区 SKILL.md**：新增验证脚本失败时仅阻断新改动，不回溯重写 19 个已有 skill

### Phase 规划

| Phase | 需求 | 预期工作量 | 依赖 |
|---|---|---|---|
| Phase 1.1 | 需求 1 description 两句式强化 | S（≤1d） | 扩展既有 `validate-skill-descriptions.mjs` |
| Phase 1.2 | 需求 2 章节骨架统一 | S（≤1d） | 无 |
| Phase 1.3 | 需求 3 风格指南与模板 | M（≤3d） | 需求 1 + 2（汇总） |
| Phase 2.1 | 需求 4 Scripts as Black Box | M（≤3d） | 无（可并行 Phase 1） |
| Phase 3.1 | 需求 5 frontend-check agent | L（≤1w） | 需求 2（Deliverable 规范） |
| Phase 4.1 | 需求 6 Acceptance Scenario Eval | L（≤1w） | 需求 5（复用 Tier B 基础设施） |

---

## Architecture

### 模块总览

```
┌──────────────────────────────────────────────────────────────────┐
│                  Oz-Skills Inspiration Layer                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ Description  │  │ Skeleton     │  │ Style Guide  │            │
│  │ Validator    │  │ Validator    │  │ + Template   │            │
│  │ Extended (R1)│  │ (R2)         │  │ (R3)         │            │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘            │
│         │                 │                 │                    │
│         └─────────────────┴────────┬────────┘                    │
│                                    │ 汇总引用                    │
│                                    v                             │
│                         `.tinkerman/knowledge/skill-style-guide.md`  │
│                                                                  │
│  ┌──────────────┐                                                │
│  │ Scripts as   │   ← 独立纪律层，CLAUDE.md §2.8                  │
│  │ Blackbox (R4)│                                                │
│  └──────────────┘                                                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │   Frontend Check Agent (R5)  — Layer 4 of /forge review  │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                   │    │
│  │  │ Tier A  │  │ Tier B  │  │ Tier C  │                   │    │
│  │  │ Static  │  │ cmux    │  │ Chrome  │                   │    │
│  │  │ grep    │  │ browser │  │ DevTools│                   │    │
│  │  └─────────┘  └─────────┘  └─────────┘                   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                    │ 共用 cmux + MCP 基础设施     │
│                                    v                             │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │   Acceptance Scenario Eval (R6) — ship-time gate         │    │
│  │  parseScenarios → classify → runner(api|ui|cli) → verdict│    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│           Existing Forge Core (minimal extensions)               │
│  skill-description.ts | skill-length.ts | ship.ts | review.ts    │
└──────────────────────────────────────────────────────────────────┘
```

### 数据流（落地后的评审路径）

```
新 skill 被引入仓库
   │
   v
[CI: npm run check]
   ├─> scripts/validate-skill-descriptions.mjs     ← R1 新增：两句 + 祈使 + Use when 开头
   ├─> scripts/validate-skill-length.mjs           ← 既有（不变）
   ├─> scripts/validate-skill-skeleton.mjs         ← R2 新增：Prerequisites/Workflow/Deliverable
   └─> scripts/validate-scripts-help.mjs           ← R4 新增：user-facing 必带 --help
   │
   v
[作者查阅] .tinkerman/knowledge/skill-style-guide.md   ← R3：单一事实来源
   │
   v
用户运行 /forge review <topic>
   │
   v
[四层并行 Subagent 派发]
   ├─> Layer 1: spec-check      （既有）
   ├─> Layer 2: quality-check   （既有）
   ├─> Layer 3: security-check  （既有）
   └─> Layer 4: frontend-check  ← R5 新增
           ├─> Tier A: grep Vue3 模板（必跑）
           ├─> Tier B: cmux browser + axe-core（仅当 socket + workspace 都 ok）
           └─> Tier C: chrome-devtools MCP Core Web Vitals（仅当 MCP 可用）
   │
   v
Review 报告（含 Layer 4 段落）
   │
   v
用户运行 /forge ship
   │
   v
[三道既有门禁] Review + Test + Progress
   │
   v
[R6 可选第 4 道门禁：Acceptance Scenario Eval]
   ├─> spec 有 `acceptance_eval: true` 时自动触发
   ├─> 否则仅当 `--with-acceptance` 参数手动触发
   └─> 两种来源：显式 Scenarios 块 | 从 acceptance criteria 反向提取
   │
   v
交付（merge / PR / keep-branch / discard）
```

---

## 1. 需求 1：Description 两句式强化（扩展既有规则）

### 1.1 现状与修改点

**既有实现**：
- `src/skill-description.ts` 定义 `validateDescription(content)` 纯函数
- `scripts/validate-skill-descriptions.mjs` 内联镜像规则（避免依赖 `dist/`）
- 规则：非空 / ≤1024 / 含 "Use when" / 禁用营销、版本号、具体日期

**本需求增量**：
1. 新增 `src/skill-description-imperatives.ts`：祈使动词白名单
2. 扩展 `src/skill-description.ts`：新增 `countSentences` / `startsWithImperative` / `secondSentenceStartsWithUseWhen` / `validateDescriptionExtended`
3. 扩展 `scripts/validate-skill-descriptions.mjs`：镜像新规则
4. **迁移策略**：先 warning-only，全部 skill 改写完成后切换 error

### 1.2 关键数据结构

```typescript
// src/skill-description-imperatives.ts
export const IMPERATIVE_WHITELIST: readonly string[] = [
  "Build", "Audit", "Diagnose", "Execute", "Plan", "Review", "Ship",
  "Test", "Resume", "Orchestrate", "Capture", "Refactor", "Grill",
  "Decompose", "Decide", "Restart", "Fix", "Verify", "Accept",
  // 扩充入口但不允许任意词
];

// src/skill-description.ts（扩展）
export interface DescriptionValidationExtended extends DescriptionValidation {
  sentenceCount: number;
  firstSentenceStartsWithImperative: boolean;
  secondSentenceStartsWithUseWhen: boolean;
  // 向后兼容：保留 valid / errors / length / hasUseWhen 等既有字段
}

export function countSentences(text: string): number;
export function splitSentences(text: string): string[];
export function startsWithImperative(sentence: string, whitelist: readonly string[]): boolean;
export function validateDescriptionExtended(
  content: string,
  options?: { mode: "warning" | "error" }
): DescriptionValidationExtended;
```

### 1.3 边界情况

| 场景 | 处理 |
|---|---|
| description 含转义句号（`v1.0`） | 已有 FORBIDDEN_PATTERNS 命中版本号；`splitSentences` 不拆 |
| description 结尾无标点 | `countSentences` 仍识别最后一句；但 `valid` 失败并提示 |
| 祈使动词白名单不匹配 | 列出命中的首词 + 期望 whitelist，鼓励扩充而非硬性拒绝 |
| 中英混排首句 | 首词仍需 IMPERATIVE_WHITELIST 成员；中文 skill 允许英文动词开头+中文描述 |

### 1.4 迁移序列

```
Step 1: Extended validator 实装，warning 模式接入 npm run check
Step 2: tasks 阶段逐个修正 19 个 skill description（优先 forge-plan / forge-build / forge-ship / forge-review）
Step 3: 全部合规后切换 error 模式（修改一处常量 `ENFORCEMENT_MODE = "error"`）
Step 4: property test 覆盖新规则的组合场景
```

---

## 2. 需求 2：章节骨架统一

### 2.1 核心数据结构

```typescript
// src/skill-skeleton.ts
export type DeliverableCategory =
  | "decision"   // decide / review
  | "execution"  // build / refactor / fix
  | "delivery"   // ship
  | "diagnostic" // debug / grill
  | "query"      // status / resume / zoom-out（倾向于豁免）
  | "other";

export interface DeliverableFields {
  category: DeliverableCategory;
  fields: readonly string[];
}

export const DELIVERABLE_FIELD_MAP: Record<DeliverableCategory, readonly string[]> = {
  decision: ["Decision", "Rationale", "Evidence", "Next Action"],
  execution: ["Changed Files", "Tests Run", "Verification Output", "Commit Hash"],
  delivery: ["Delivery Target", "Gate Results", "Next Step Prompt"],
  diagnostic: ["Finding", "Root Cause", "Recommendation", "Confidence"],
  query: [],
  other: [],
};

export interface SkeletonCheck {
  filePath: string;
  hasPrerequisites: boolean;
  hasWorkflow: boolean;
  hasDeliverable: boolean;
  deliverableExempt: boolean;   // frontmatter: deliverable_exempt: true
  legacyExempt: boolean;        // frontmatter: skeleton_exempt_legacy: true
  valid: boolean;
  errors: string[];
}

export function parseSkeleton(content: string): SkeletonCheck;
export function renderSkeletonReport(checks: SkeletonCheck[]): string;
```

### 2.2 Prerequisites 章节格式

```markdown
## 2. Prerequisites

| # | Check | Block Condition | Route |
|---|-------|-----------------|-------|
| 1 | Spec Gate — `.tinkerman/specs/<topic>/spec.md` status | Not `locked` | → `/forge spec` |
| 2 | Plan Gate — `.tinkerman/plans/<topic>.md` status | Not `approved` | → `/forge plan` |

**Rejection Output**: `🚫 <skill> 前置检查未通过 — 命名：<检查> 证据：<文件状态> 建议：<路由> 重入：<条件>`。多项失败时列出所有。Autonomous 模式输出 JSON。
```

### 2.3 Deliverable 章节格式（按 category）

```markdown
## <N>. Deliverable

**Category**: execution

- **Changed Files**: `src/plan.ts`, `test/plan.property.test.ts`
- **Tests Run**: `vitest run test/plan.property.test.ts` → 42 passed
- **Verification Output**: `npm run check` → exit 0
- **Commit Hash**: `a1b2c3d`
```

豁免声明：

```yaml
---
name: forge-status
description: "..."
deliverable_exempt: true  # 工具类 skill，输出过于琐碎
---
```

未回溯的既有 skill 声明：

```yaml
---
name: forge-plan
description: "..."
skeleton_exempt_legacy: true  # 已有 skill，骨架回溯由 skill-document-optimization 推进
---
```

### 2.4 校验脚本（新增）

`scripts/validate-skill-skeleton.mjs`（风格对齐 `validate-skill-descriptions.mjs`）：

- 扫描 `skills/forge-*/SKILL.md`
- 对每个文件：
  - 既无 `deliverable_exempt: true` 也无 `skeleton_exempt_legacy: true` → 必须通过骨架校验，不通过则 **fail**
  - 仅含 `skeleton_exempt_legacy: true` → 输出 warning，不 fail
  - 含 `deliverable_exempt: true` → 跳过 Deliverable 检查，仍校验 Prerequisites + Workflow 段落
- 退出码：任一非豁免失败项 → 1；全通过 → 0

### 2.5 回溯策略（非本 spec 强制）

本需求**不**强制回溯 19 个 skill。但 tasks 阶段会为新建 skill 以及 5 个自愿回溯候选（forge-review、forge-debug、forge-learn、forge-plan、forge-refactor）提供改写清单。回溯动作由 `skill-document-optimization` spec 单独推进。

---

## 3. 需求 3：Style Guide + Template

### 3.1 文件结构

```
.tinkerman/knowledge/skill-style-guide.md   # 主文档（开放区）
templates/SKILL-TEMPLATE.md              # 可 cp 骨架
```

`skill-style-guide.md` frontmatter：

```yaml
---
style_guide_version: "1.0"
updated: 2026-05-08
related_specs: ["oz-skills-inspiration", "skills-cross-pollination"]
---
```

### 3.2 文档章节（顺序固定）

```
1. Overview（目的 / 面向谁 / 与 CLAUDE.md 关系）
2. Frontmatter 字段规范
   - name / description / disable-model-invocation / license
   - deliverable_exempt / skeleton_exempt_legacy / style_guide_version
3. SKILL.md 章节骨架（引用需求 2）
4. Description 两句式规则（引用需求 1）
5. 命名规范（kebab-case / 单 H1 Title Case / 章节编号）
6. references/ 用途边界（迁移判定 / 命名 / 引用语法）
7. scripts/ 用途边界（引用需求 4 的 Scripts as Blackbox）
8. 反模式清单（≥5 条）
9. 版本演进策略（semver / 大版本升级走 ADR）
10. 快速核对清单（≤10 条，给 PR 自检用）
```

### 3.3 模板示例（SKILL-TEMPLATE.md 片段）

```markdown
---
name: forge-example
description: "Describe concisely what this skill does. Use when <trigger conditions>."
disable-model-invocation: true
# deliverable_exempt: true  # 可选：工具类 skill 可豁免 Deliverable
# style_guide_version: "1.0" # 可选：标注遵循的指南版本
---

# /forge example — <Short Title>

> 触发方式 / 职责 / 输出路径（3 行简介）

## 1. Overview

<核心概念、核心原则、适用场景>

## 2. Prerequisites

| # | Check | Block Condition | Route |
|---|-------|-----------------|-------|
| 1 | <准入条件 1> | <阻断条件> | → <修复命令> |

## 3. Workflow

### Step 1: <步骤名>
<描述与示例>

### Step 2: ...

## 4. Deliverable

**Category**: <decision | execution | delivery | diagnostic>

- **<Field 1>**: <说明>
- **<Field 2>**: <说明>

## References

→ 详见 references/<filename>.md
```

### 3.4 版本演进

- 小版本（1.x）：新增字段 / 放宽规则 / 扩充反模式清单——兼容
- 大版本（2.x）：破坏性变更（如必填字段调整）——伴随 `.tinkerman/decisions/ADR-XXXX-skill-style-guide-v2.md`
- 每次变更追加到 `.tinkerman/knowledge/skill-style-guide-changelog.md`

### 3.5 `validateSkillTemplate` 纯函数

```typescript
// src/skill-template.ts
export interface TemplateValidation {
  filePath: string;
  styleGuideVersion: string;        // 从 skill frontmatter 读取；缺失视为 1.0
  missingSections: string[];
  valid: boolean;
  errors: string[];
}

export function validateSkillTemplate(
  filePath: string,
  content: string,
  requiredSections: readonly string[]
): TemplateValidation;
```

---

## 4. 需求 4：Scripts as Blackbox

### 4.1 纪律条款（CLAUDE.md 新增 §2.8）

```markdown
### 2.8 Scripts as Black Box（铁律）

> **原则**：scripts/ 目录中分类为 user-facing 的脚本必须先 `--help` 再调用，未尝试 `--help` 前不得 cat 源码。

**判定流程**：
1. agent 需要调用 scripts/<name> 时 → 先 `bash scripts/<name> --help`
2. --help 输出能决定用法 → 直接调用
3. --help 不足以决定用法 → 明确声明"需要查看源码"并标注原因
4. 脚本本身需要修改或扩展 → 允许读源码

**例外**：internal-only / one-off 类脚本（记录在 `scripts/.help-exempt`）无此约束。
```

### 4.2 脚本分类

每个脚本文件头添加注释：

```bash
#!/usr/bin/env bash
# category: user-facing   # 或 internal-only | one-off
```

`scripts/.help-exempt`（行分隔，支持 `# 注释`）：

```
# Internal-only: sourced by other scripts or hooks
scripts/check-frozen.sh       # called by hooks/hook-check-frozen.sh
scripts/auto-resume.sh        # hook-driven

# One-off: reserved for future pruning
```

### 4.3 分类判定标准

| 分类 | 判定依据 | 示例 |
|---|---|---|
| `user-facing` | 出现在 package.json scripts、CLAUDE.md、SKILL.md 的 Bash 示例；或被 `/forge` 命令引用 | `validate-skill-descriptions.mjs`, `init.sh`, `build-dist.sh` |
| `internal-only` | 仅被其他 scripts `source`、hook 调用或 CI workflow 引用 | `hook-check-frozen.sh`, `run-with-trim.sh` |
| `one-off` | 一次性迁移脚本 / 临时工具 | `append-baseline.mjs`（若标记） |

### 4.4 模块与校验脚本

```typescript
// src/script-help.ts
export type ScriptCategory = "user-facing" | "internal-only" | "one-off" | "unclear";

export interface ScriptAuditEntry {
  path: string;
  category: ScriptCategory;
  hasHelpBranch: boolean;
  helpOutputValid: boolean;
  errors: string[];
}

export function parseScriptCategory(fileContent: string): ScriptCategory;
export function parseHelpOutput(output: string): { valid: boolean; reason?: string };
export function parseHelpExempt(content: string): readonly string[];
export function auditScript(path: string, content: string, helpOutput?: string): ScriptAuditEntry;
```

`scripts/validate-scripts-help.mjs`：

- 扫描 `scripts/*.{sh,mjs,py}` + `scripts/.help-exempt`
- 对分类为 user-facing 的文件：
  - 执行 `bash|node scripts/<name> --help`
  - 捕获退出码与输出
  - 校验输出含 `Usage:` 字符串
- internal-only / one-off / 在 exempt 列表中 → 跳过
- 任一 user-facing 不合规 → fail

### 4.5 审计产物

首版审计产出 `.tinkerman/findings/scripts-help-audit.md`：

```markdown
# Scripts Help Audit — 2026-05-08

## user_facing_with_help

- scripts/validate-skill-descriptions.mjs  ✓
- scripts/validate-skill-length.mjs         ✓

## user_facing_missing_help

- scripts/init.sh          （需补齐 --help）
- scripts/build-dist.sh    （需补齐 --help）
- ...

## internal_only

- scripts/hook-check-frozen.sh  evidence: hooks/hooks.json 引用
- scripts/auto-resume.sh         evidence: .claude/settings.json 引用

## one_off

- （首版可能为空）

## unclear

- scripts/append-baseline.mjs   需要 tasks 阶段 review 后定性
```

### 4.6 补齐 --help 的脚本模板（bash）

```bash
#!/usr/bin/env bash
# category: user-facing

show_help() {
  cat <<'EOF'
Usage: bash scripts/<name>.sh [OPTIONS]

Description:
  <One-line purpose>

Arguments:
  <arg1>    <description>

Options:
  -h, --help    Show this help

Examples:
  bash scripts/<name>.sh <arg1>

Side Effects:
  <file-writes | network | git>
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  show_help
  exit 0
fi

# <rest of script>
```

---

## 5. 需求 5：Frontend-Check Agent

### 5.1 文件结构

```
agents/frontend-check.md                              # agent 定义（扁平，与既有 quality-check.md 并列）
skills/forge-review/references/frontend-check-patterns.md   # Tier A 静态扫描规则集
scripts/vendor/axe.min.js                             # axe-core 4.10.x，git-tracked
scripts/update-vendor-axe.sh                          # 升级脚本（需要网络）
.tinkerman/cache/login-state-<project>.json               # 登录态缓存，.gitignore 排除
```

### 5.2 Agent 定义骨架

```markdown
---
name: frontend-check
description: "Audit Vue3 frontend for WCAG accessibility, Core Web Vitals, router stability, and console warnings. Use when /forge review runs on a project with Vue or .vue files, when router applies a11y-check or responsive-check hints, or when user explicitly requests a frontend audit."
model: sonnet
allowedTools: "Bash(cmux browser:*), mcp_chrome-devtools_*, Read, Grep, Bash(control_bash_process:*)"
---

# Frontend-Check — Layer 4 Review Agent

## 1. Overview
<三档策略概述>

## 2. Prerequisites
| # | Check | Block Condition | Route |
|---|-------|-----------------|-------|
| 1 | Vue project detection | 无 package.json 含 vue 或 .vue 文件 | → skip |
| 2 | Tier B availability | `/tmp/cmux.sock` + `$CMUX_WORKSPACE_ID` | → degrade to A+C |
| 3 | Tier C availability | MCP `performance_start_trace` 探针 | → degrade to A+B |
| 4 | axe-core vendor | `scripts/vendor/axe.min.js` 存在 | → Tier B skip |

## 3. Workflow
### Step 1: Tier Probe
<探针逻辑>

### Step 2: Tier A Static Scan（必跑）
<Vue3 grep 规则应用>

### Step 3: Tier B Interactive Scan（条件跑）
<cmux browser 工作流>

### Step 4: Tier C Performance Trace（条件跑）
<chrome-devtools MCP 工作流>

### Step 5: Aggregate + Output

## 4. Deliverable
**Category**: decision
- **Tier Executed**: A / A+B / A+B+C
- **Tier Availability**: { cmux_workspace, cmux_installed, mcp_devtools }
- **P0/P1/P2/P3 Counts**: <统计>
- **WCAG Violations**: <axe-core 命中>
- **Core Web Vitals**: LCP / INP / CLS（Tier C 才有）
- **Console Warnings**: <运行时告警>
- **Screenshots**: <.tinkerman/reviews/assets/ 路径列表>

## References
→ skills/forge-review/references/frontend-check-patterns.md
```

### 5.3 Tier 探测逻辑

```typescript
// src/frontend-check.ts
export interface TierAvailability {
  a: true;                                  // Static 总是可用
  b: "preferred" | "degraded" | "unavailable";
  c: "available" | "unavailable";
  reasons: {
    cmuxSocket: boolean;
    cmuxWorkspaceEnv: boolean;
    cmuxBinary: boolean;
    mcpDevtools: boolean;
  };
}

export function detectTierAvailability(env: {
  socketExists: boolean;
  workspaceIdSet: boolean;
  cmuxBinaryExists: boolean;
  mcpDevtoolsResponsive: boolean;
}): TierAvailability;
```

判定表：

| cmuxSocket | cmuxWorkspaceEnv | cmuxBinary | Tier B |
|------------|-------------------|------------|--------|
| true | true | true | `preferred`（首选路径） |
| true | false | true | `degraded`（cmux outside workspace） |
| false | - | true | `degraded`（无 socket 连接） |
| - | - | false | `unavailable` |

### 5.4 Tier A — Vue3 静态规则集

`skills/forge-review/references/frontend-check-patterns.md` 每条规则：

```yaml
- id: vue-a11y-click-non-button
  pattern: '<(div|span|p|section|article)[^>]*@click'
  severity: P1
  wcag: "2.1.1 Keyboard"
  description: "非语义元素绑定 @click 但缺 role/tabindex"
  example_bad: '<div @click="handle">点击</div>'
  example_good: '<button @click="handle">点击</button>'
  false_positive_filter:
    - "role=\"button\""
    - "tabindex="

- id: vue-a11y-img-missing-alt
  pattern: '<img[^>]*(?!alt=)[^>]*>'
  severity: P1
  wcag: "1.1.1 Non-text Content"
  description: "img 缺 alt 属性"
  ...
```

纯函数：

```typescript
export interface Vue3Violation {
  ruleId: string;
  severity: "P0" | "P1" | "P2" | "P3";
  file: string;
  line: number;
  wcag: string;
  snippet: string;
}

export function scanVueTemplate(
  content: string,
  filePath: string,
  rules: readonly VueA11yRule[]
): Vue3Violation[];
```

### 5.5 Tier B — cmux 工作流脚本

```bash
# 伪代码（实际由 agent 按 Deliverable 输出）
control_bash_process start "npm run dev" -> terminal_id=TID

cmux browser open http://localhost:5173
SURFACE=$(cmux browser identify | jq -r '.focused_surface_id')

# 登录态处理（若缓存存在且未过期）
STATE_CACHE=".tinkerman/cache/login-state-${PROJECT}.json"
if [ -f "$STATE_CACHE" ]; then
  cmux browser $SURFACE state load "$STATE_CACHE"
fi

# 注入 axe-core
cmux browser $SURFACE addinitscript "$(cat scripts/vendor/axe.min.js)"
cmux browser $SURFACE reload --snapshot-after
cmux browser $SURFACE wait --function "window.axe !== undefined"

# 遍历关键页面
for URL in "${KEY_URLS[@]}"; do
  PAGE_NAME=$(echo "$URL" | basename)
  cmux browser $SURFACE navigate "$URL" --snapshot-after
  cmux browser $SURFACE wait --load-state complete --timeout-ms 15000
  cmux browser $SURFACE eval "JSON.stringify(await axe.run())" \
    > ".tinkerman/reviews/assets/axe-${PAGE_NAME}.json"
  cmux browser $SURFACE screenshot --out ".tinkerman/reviews/assets/${PAGE_NAME}.png"
  cmux browser $SURFACE console list > ".tinkerman/reviews/assets/console-${PAGE_NAME}.log"
  cmux browser $SURFACE errors list > ".tinkerman/reviews/assets/errors-${PAGE_NAME}.log"
done

# 必须执行（即使异常）
trap 'control_bash_process stop $TID' EXIT
```

### 5.6 Tier C — chrome-devtools MCP

```typescript
// 伪代码流程
await mcp.navigate_page({ url });
const trace = await mcp.performance_start_trace({ autoStop: true, reload: true });
const insights = await Promise.all([
  mcp.performance_analyze_insight({ insightSetId: trace.setId, insightName: "LCPBreakdown" }),
  mcp.performance_analyze_insight({ insightSetId: trace.setId, insightName: "CLSCulprits" }),
  mcp.performance_analyze_insight({ insightSetId: trace.setId, insightName: "RenderBlocking" }),
]);
return parseCoreWebVitals(insights);  // { lcp, inp, cls, fcp, ttfb, tbt }
```

### 5.7 登录态缓存策略

| 状态 | Agent 行为 |
|---|---|
| 无缓存 + 页面需登录 | 提示用户在 cmux browser 内登录一次，然后运行 `cmux browser $SURFACE state save .tinkerman/cache/login-state-<project>.json` |
| 缓存存在且未过期（通过 `cmux browser cookies get` 检测主要 session cookie） | 加载缓存，继续流程 |
| 缓存已过期 | 清理缓存，降级为"无缓存"分支 |
| 页面无鉴权 | 跳过登录态逻辑 |

`.gitignore` 追加：

```gitignore
# Forge frontend-check login state cache
.tinkerman/cache/
```

### 5.8 axe-core vendor 管理

- `scripts/vendor/axe.min.js` 作为 **git-tracked** 文件入库（不进 `.gitignore`）
- 版本 pin 到 4.10.x，锁定版本号在文件头注释
- `scripts/update-vendor-axe.sh --help`：

```bash
Usage: bash scripts/update-vendor-axe.sh [--version VERSION]

Description:
  Downloads axe-core minified bundle from unpkg.com and writes to scripts/vendor/axe.min.js.
  Pinned default: 4.10.x (latest patch).

Options:
  --version VERSION   Pin to specific version (e.g. 4.10.2)
  -h, --help          Show this help

Examples:
  bash scripts/update-vendor-axe.sh                # fetch latest 4.10.x
  bash scripts/update-vendor-axe.sh --version 4.10.2

Side Effects:
  - Writes scripts/vendor/axe.min.js
  - Requires network access to unpkg.com
  - Updates version comment in file header
```

- 失败输出：`Error: network required to fetch axe-core. Check connection or use --version to pin existing local version.`

### 5.9 Dev Server 生命周期

通过 `control_bash_process` 严格管理：

```typescript
// 伪代码
const terminalId = await control_bash_process.start("npm run dev", { cwd: project });
try {
  await runTierB(terminalId);
} finally {
  // 必须 stop，即使异常
  await control_bash_process.stop(terminalId);
}
// 5 分钟超时保护：Tier B 总耗时 > 5min 时主动 stop
```

### 5.10 Router Hint 映射

`skills/forge-router/references/behavior-hints.md` 中已有占位：

| Hint | 当前状态 | 本需求落地后 |
|---|---|---|
| `a11y-check` | placeholder | → frontend-check Tier B axe.run() |
| `responsive-check` | placeholder | → frontend-check Tier B viewport 切换 + snapshot |
| `visual-regression` | placeholder | → frontend-check Tier B screenshot diff（首版可略） |

---

## 6. 需求 6：Acceptance Scenario Eval

### 6.1 文件结构

```
skills/forge-accept/SKILL.md
skills/forge-accept/references/scenario-format.md
skills/forge-accept/references/runners.md
src/accept.ts                     # 纯函数核心
src/accept-driver.ts              # 执行器（curl / cmux / bash dispatch）
.tinkerman/acceptance/<topic>/<scenario-id>/  # 产物
```

### 6.2 核心类型

```typescript
// src/accept.ts
export type ScenarioSource = "explicit" | "derived";
export type ScenarioType = "api" | "ui" | "cli" | "mixed" | "unknown";
export type Verdict = "PASS" | "FAIL" | "SKIP" | "WARN";

export interface Scenario {
  id: string;
  given: string;
  when: string;
  then: string;
  source: ScenarioSource;
  type: ScenarioType;
  tags: readonly string[];              // @critical / @happy-path / @promote-derived
  confidence: number;                   // 0-1，explicit=1.0，derived 依赖提取置信度
  rawText: string;                      // 原文快照
}

export interface ScenarioArtifact {
  scenarioId: string;
  source: ScenarioSource;
  givenWhenThen: string;
  executedAt: string;
  verdict: Verdict;
  evidence: readonly string[];          // 相对路径列表
  failureReason?: string;               // FAIL / WARN 时必填
}

export interface AcceptanceRunResult {
  topic: string;
  scenarios: readonly ScenarioArtifact[];
  summary: {
    pass: number;
    fail: number;
    skip: number;
    warn: number;
    blocksShip: boolean;                // 按 spec frontmatter + 至少一个 FAIL 判定
  };
}
```

### 6.3 两种 scenario 来源解析

```typescript
// 显式：Gherkin `Scenario:` 块
export function parseExplicitScenarios(specContent: string): readonly Scenario[];

// 隐式：从 acceptance criteria WHEN/THEN 子句反向提取
export function deriveScenariosFromCriteria(
  criteria: readonly AcceptanceCriterion[]
): readonly Scenario[];

// 统一入口
export function parseScenariosFromSpec(specContent: string): readonly Scenario[];
```

**反向提取示例**：

```
输入（acceptance criterion）：
  WHEN user clicks "Submit" button, THE API SHALL return 200

提取结果：
  {
    id: "derived-req1-ac3",
    given: "",                        // 从 user story 推断或留空
    when: "user clicks Submit button",
    then: "API returns 200",
    source: "derived",
    type: "mixed",                    // UI action + API assertion
    confidence: 0.7,                  // derived 默认较低
  }
```

### 6.4 选择与排序

```typescript
export function selectScenariosForRun(
  scenarios: readonly Scenario[],
  options: {
    maxCount?: number;                // 默认 5
    explicitIds?: readonly string[];  // 用户 --scenarios 指定
    promoteDerived?: boolean;         // --promote-derived
  }
): readonly Scenario[];
```

排序规则（降序）：
1. `tags.includes("@critical")` → 最高
2. `tags.includes("@happy-path")`
3. `source === "explicit"`
4. `confidence`（derived 内部 tiebreaker）
5. 声明顺序

取前 `min(5, total)` 条，除非 `explicitIds` 显式指定。

### 6.5 类型识别

```typescript
export function classifyScenarioType(scenario: Scenario): ScenarioType;

// 识别规则（顺序匹配，首命中为准）
const API_KEYWORDS = /\b(request|POST|GET|PUT|DELETE|API|endpoint|curl|response|status code)\b/i;
const UI_KEYWORDS = /\b(click|fill|select|display|visible|页面|点击|显示)\b/i;
const CLI_KEYWORDS = /\b(run|command|execute|stdout|exit code|command-line)\b/i;
```

混合 scenario（同时命中 UI + API）标记为 `mixed`，顺序执行并汇总。

### 6.6 执行器分发

```typescript
// src/accept-driver.ts
export interface RunnerContext {
  projectRoot: string;
  topic: string;
  cmuxTier: TierAvailability;         // 复用需求 5 的探测
  devServerPort?: number;
}

export interface Runner {
  name: string;
  supports(scenario: Scenario): boolean;
  run(scenario: Scenario, ctx: RunnerContext): Promise<ScenarioArtifact>;
}

export const RUNNERS: readonly Runner[] = [
  apiRunner,    // curl-based
  uiRunner,     // cmux browser CLI
  cliRunner,    // bash
  mixedRunner,  // 顺序组合
];
```

**API Runner 示例**：

```typescript
// 从 Given/When 提取 endpoint/body，调 curl
async run(scenario, ctx) {
  const { endpoint, method, body } = parseApiFromGherkin(scenario);
  const cmd = `curl -s -w "\n%{http_code}" -X ${method} ${endpoint} -d '${body}'`;
  const output = await execBash(cmd);
  const { statusCode, responseBody } = parseCurlOutput(output);

  const artifact = {
    scenarioId: scenario.id,
    source: scenario.source,
    givenWhenThen: scenario.rawText,
    executedAt: new Date().toISOString(),
    verdict: evaluateAssertion(scenario.then, statusCode, responseBody),
    evidence: [`.tinkerman/acceptance/${ctx.topic}/${scenario.id}/response.json`],
    failureReason: verdict === "FAIL" ? buildFailureReason(...) : undefined,
  };
  await writeScenarioArtifacts(ctx, scenario, { output, statusCode, responseBody });
  return artifact;
}
```

**UI Runner**：复用需求 5 Tier B 的 dev server 生命周期管理与登录态缓存。

**CLI Runner**：直接执行 `Given` 子句中提取的命令，捕获 stdout/exit。

### 6.7 产出目录结构

```
.tinkerman/acceptance/<topic>/
├── summary.md                       # 入口汇总（Read this first）
├── scenario-001/
│   ├── script.sh                    # 可重放命令
│   ├── output.log                   # stdout+stderr
│   ├── screenshot-step-1.png        # UI scenario
│   ├── response-step-1.json         # API scenario
│   └── verdict.md                   # 结构化判定
├── scenario-002/
│   ...
└── ship-decision.md                 # blocks_ship 判定日志
```

### 6.8 汇总报告

`aggregateVerdicts` → 写入 `.tinkerman/reviews/<topic>-acceptance.md`：

```markdown
---
topic: <topic>
executed_at: <ISO>
spec_ref: .tinkerman/specs/<topic>/spec.md
acceptance_blocks_ship: false
---

# Acceptance Scenario Eval — <topic>

## Summary

| Metric | Count |
|--------|-------|
| Total | 5 |
| PASS  | 3 |
| FAIL  | 1 |
| SKIP  | 1 |
| WARN  | 0 |

**Blocks ship**: No（`acceptance_blocks_ship: false`）

## Source Distribution

- Explicit: 3
- Derived:  2

## Scenarios

### scenario-001 — @critical @happy-path
- **Given/When/Then**: ...
- **Verdict**: PASS
- **Evidence**: `.tinkerman/acceptance/<topic>/scenario-001/`

### scenario-002 — @derived
- **Given/When/Then**: ...
- **Verdict**: FAIL
- **Failure Reason**: API returned 500 instead of 200
- **Evidence**: `.tinkerman/acceptance/<topic>/scenario-002/`

...

## Evolution Markers

<!-- Evolution: 2026-05-08 | source: acceptance/<topic>/scenario-002 | target: forge-build#scenario-gap -->
Failed scenario reveals missing error handling in /users POST endpoint.
```

### 6.9 Ship Gate 集成

```typescript
// src/ship.ts 扩展
export interface AcceptanceGateResult {
  enabled: boolean;
  executed: boolean;
  verdict: "PASS" | "FAIL" | "SKIP";
  blocksShip: boolean;
  reportPath?: string;
}

export async function runAcceptanceGate(
  topic: string,
  specFrontmatter: SpecFrontmatter,
  cliFlags: { withAcceptance?: boolean; scenarios?: readonly string[]; promoteDerived?: boolean }
): Promise<AcceptanceGateResult>;
```

触发逻辑：

```
if spec.acceptance_eval === true OR cliFlags.withAcceptance:
  run scenarios
  if any FAIL AND spec.acceptance_blocks_ship === true:
    blocksShip = true  // 阻断 ship
  else:
    blocksShip = false // 仅警告
else:
  skip acceptance gate
```

### 6.10 Command 注册

`commands/forge.md` 增加：

```
/forge accept [scenario-id]     # 手动触发 acceptance eval
/forge ship --with-acceptance   # 强制带验收门禁 ship
/forge ship --promote-derived   # 让 derived scenarios 参与阻断判定
```

---

## Cross-Requirement Integration

### A. 需求 1 + 2 + 3 的级联关系

- **需求 1**（description）与**需求 2**（骨架）分别定义"frontmatter 规则"与"正文结构规则"
- **需求 3**（style guide）是这两套规则的**文档出口**
- 如果作者先读 style guide，可一站式理解所有规则；如果 CI 报 validator 失败，报错信息链接回 style guide 章节

### B. 需求 4 与需求 2 的联动

需求 2 的 Deliverable 中"**Verification Output**" 字段建议值为：`npm run check` → 通过 → 说明 validator 全绿，包括需求 4 的 `validate-scripts-help.mjs`。

### C. 需求 5 与需求 6 的复用

| 能力 | 定义处 | 复用处 |
|---|---|---|
| `detectTierAvailability` | 需求 5 | 需求 6 UI runner 判定能否跑 |
| cmux browser 工作流 | 需求 5 Tier B | 需求 6 UI scenario runner |
| dev server 生命周期管理 | 需求 5 | 需求 6 UI scenario |
| 登录态缓存 | 需求 5 | 需求 6 UI scenario |
| `.tinkerman/reviews/assets/` 约定 | 需求 5 | 需求 6 evidence 存放 |

### D. 与 skills-cross-pollination 的接点

| 项 | oz-skills | cross-pollination |
|---|---|---|
| description 规则 | 两句式+祈使动词（句法） | Use-when 失败模式（语义） |
| 处理方式 | 并集 — 新 skill 必须同时满足 | |
| Evolution marker | 需求 6 失败 scenario 产生 `target: forge-build#scenario-gap` | 需求 8 的通用机制 |

### E. 与 skill-document-optimization 的边界

- **本 spec**：定义骨架标准 + 强制新建 skill 遵循
- **skill-document-optimization spec**：按标准回溯 19 个现有 skill（内容精简 + 骨架对齐）
- 两 spec 落地顺序：**本 spec 先**（定义规范），后者**后**（按规范精修）

---

## Non-Functional Requirements

### N1. 性能

- `validate-skill-descriptions.mjs` / `validate-skill-skeleton.mjs` / `validate-scripts-help.mjs` 合并执行 < 3s（19 个 skill + 27 个 scripts 规模）
- Tier A 扫描 < 5s（全仓 `.vue` 文件）
- Tier B 单页面审计 < 30s
- Tier C 单页面 trace < 60s
- Acceptance eval 单 scenario < 120s；5 条 < 10min

### N2. 并发

- Review 四层 Agent 并行（既有模式扩充到 4）
- Scenario runner 可串行（避免 dev server / 登录态冲突）

### N3. 可测性

- 所有纯函数有 property-based test
- Tier 探测通过 env mock 单测
- Runner dispatch 通过 fake scenario + record-replay 测

### N4. 可观测

- `.tinkerman/reviews/<topic>.md` 的 Layer 4 段落结构化
- `.tinkerman/acceptance/<topic>/summary.md` 总览入口
- Evolution markers 自动写入，由 `/forge learn` 统一归集

---

## Testing Strategy

| 层 | 覆盖 |
|---|---|
| Unit | 纯函数：`countSentences` / `parseSkeleton` / `parseScriptCategory` / `detectTierAvailability` / `classifyScenarioType` 等 |
| Property | 描述校验、骨架判定、scenario 分类的输入分布覆盖 |
| Integration | `npm run check` 端到端跑 3 个 validator；Tier A 扫描 fixture `.vue` 文件 |
| E2E（手动） | Tier B 在 cmux workspace 内跑完整 review；需求 6 跑 MVP scenario |
| CI | `validate-skill-descriptions.mjs` + `validate-skill-skeleton.mjs` + `validate-scripts-help.mjs` 进入 `npm run check` |

---

## Open Questions（留给 tasks 阶段决策）

1. **description 迁移时点**：切换 error 模式的具体 trigger 是"19/19 skill 合规"还是"某一周期后"？
2. **skeleton_exempt_legacy 的失效期**：是否给 legacy 标记一个 sunset 日期（如 `sunset: 2026-12-31`）？
3. **frontend-check Tier A 规则集的初始版本**：本设计列了 8 条主规则，tasks 阶段是否需要扩充到 15+？
4. **acceptance eval 的并发**：scenarios 之间是否允许并行？首版保守串行，tasks 阶段决定。
5. **scripts/vendor/axe.min.js 的加密完整性**：是否写入 SHA256 校验？
