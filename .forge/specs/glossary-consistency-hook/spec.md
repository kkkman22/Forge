---
<<<<<<< HEAD
status: locked
contract_legacy: true
=======
status: draft
>>>>>>> origin/main
created: "2026-05-14"
topic: glossary-consistency-hook
---

# Spec: Glossary 一致性 Hook

## 概述

将散落在三个 skill（forge-decide / forge-grill / forge-spec）中的 glossary 冲突检测逻辑收口到 `src/glossary-hook.ts`，提供统一的 `runGlossaryCheck(phase, content, glossary)` 入口和统一的 prompt 模板。新增 plan / review / learn 三个 skill 的自动接入点。`src/glossary.ts` 的核心纯函数（`detectConflict` / `mergeTerm` / `archiveTerm`）零修改。

## 动机

`src/glossary.ts` 已经是成熟的纯函数库，但调用方式不统一：

| 调用点 | 包装函数 | 触发时机 | Prompt 渲染函数 |
|--------|----------|----------|-----------------|
| forge-decide | `checkDecideGlossaryConflicts(candidateTerms, glossary)` (`src/decide.ts`) | Round 1 启动前 | `renderDecideGlossaryConflictPrompt` |
| forge-grill | `checkGrillGlossaryConflicts(tree, glossary, now)` (`src/grill.ts`) | 每次 applyAnswer 后 | `renderGrillConflictPrompt` |
| forge-spec | `detectGlossaryMiss` (spec 内联实现) | Step 7 Glossary-miss 扫描 | spec 内联 |
| forge-learn | `extractSessionTermCandidates` / `mergeTerm` / `archiveTerm` | learn 阶段术语回写 | 无（写盘） |

问题：
- 三个 wrapper 重复包装同一个 `detectConflict`，输入参数 schema 各不相同（candidateTerms[] vs DecisionTree vs spec content）
- 三个 prompt 渲染函数内容近似（"⚠️ Glossary conflict detected (N): ..."）但格式不一致
- forge-plan / forge-review / forge-build 实际也需要 glossary 一致性（plan task naming / review naming consistency / build commit message）但目前**没有任何检查**
- 后果：术语漂移在编码后期才被发现，返工成本高；新 skill 集成 glossary 检查需要重新实现 wrapper

## 核心设计原则

- **零修改 glossary.ts**：核心 `detectConflict` / `mergeTerm` / `archiveTerm` 不动
- **统一输入 normalizer**：hook 内部把 phase-specific 输入（candidateTerms / DecisionTree / spec content / plan content）归一化为 `TermCandidate[]`
- **统一 prompt 模板**：单一 `renderGlossaryConflictPrompt(result, phase)` 负责所有 phase 的提示渲染
- **现有调用方平滑迁移**：保留 `checkDecideGlossaryConflicts` / `checkGrillGlossaryConflicts` 为薄 wrapper，内部转发到 hook
- **频率控制**：同一 phase 同一会话同一 candidate set 不重复警告（避免循环）
- **autonomous 模式不阻塞**：autonomous 模式下冲突写 advisory，learn 阶段批量处理；interactive 模式询问用户保留/替换/新增别名

## 统一契约

```ts
// src/glossary-hook.ts （新增）

export type GlossaryCheckPhase =
  | "spec" | "decide" | "grill" | "plan" | "review" | "learn" | "build"

export type GlossaryCheckMode = "autonomous" | "interactive"

export type GlossaryConflictResolution =
  | "keep_existing" | "replace_existing" | "add_alias" | "skip"

export type GlossaryCheckResult = {
  phase: GlossaryCheckPhase
  hasConflict: boolean
  conflicts: GlossaryConflict[]   // 已存在类型
  newCandidates: TermCandidate[]  // 已存在类型
  shouldBlock: boolean            // 由 phase + mode 决定
}

export interface GlossaryCheckInput {
  phase: GlossaryCheckPhase
  mode: GlossaryCheckMode
  /** 归一化前的原始输入（按 phase 不同结构不同）。
   *  hook 内部根据 phase 调用对应 normalizer。 */
  rawInput:
    | { kind: "candidates"; terms: TermCandidate[] }                  // decide
    | { kind: "decision_tree"; tree: DecisionTree }                   // grill
    | { kind: "spec_content"; markdown: string }                      // spec
    | { kind: "plan_content"; tasks: AtomicTask[] | LightweightTask[] } // plan
    | { kind: "review_findings"; findings: ReviewFinding[] }          // review
    | { kind: "session"; data: SessionData }                          // learn
    | { kind: "commit_message"; message: string }                     // build
  glossary: Glossary
  now: Date
  alreadyChecked: Set<string>  // 已检查过的 candidate hash 集合
}

/** 统一调度入口，纯函数。 */
export function runGlossaryCheck(input: GlossaryCheckInput): GlossaryCheckResult

/** 统一 prompt 模板，所有 phase 共用。 */
export function renderGlossaryConflictPrompt(
  result: GlossaryCheckResult,
  mode: GlossaryCheckMode,
): string

/** Autonomous 模式 advisory 渲染。 */
export function renderGlossaryAdvisory(result: GlossaryCheckResult): string

/** 阻断策略表：phase × mode → shouldBlock */
export const GLOSSARY_BLOCK_POLICY: Record<GlossaryCheckPhase, Record<GlossaryCheckMode, boolean>>

/** 候选 hash（用于频率控制） */
export function hashCandidates(candidates: TermCandidate[]): string
```

## 阻断策略

| Phase | Interactive | Autonomous |
|-------|-------------|------------|
| spec | block（必须澄清） | advisory + 标注 spec frontmatter `pending_glossary_advisories: [...]` |
| decide | block | advisory（critic round 检查） |
| grill | block | 不应触发（grill 自身在 autonomous 不跑） |
| plan | warn | advisory |
| review | warn | advisory |
| learn | block（术语回写需明确决策） | 累积到 evolution-report，不阻塞 |
| build | warn（commit message 提示） | advisory |

## 输入 Normalizer 详解

### `kind: "candidates"` (decide)
直接使用 `terms` 字段，不做转换。

### `kind: "decision_tree"` (grill)
调用 `extractNewGlossaryCandidates(tree, glossary)`（`src/grill.ts` 已有）提取候选。

### `kind: "spec_content"` (spec)
扫描 spec markdown 中的术语（H2 标题 + 加粗短语 + 引号包裹的名词），生成候选。复用 forge-spec 现有 `detectGlossaryMiss` 的扫描逻辑（提升为 `src/glossary-extractor.ts` 模块）。

### `kind: "plan_content"` (plan)
扫描 plan 中的 task title + description，提取名词短语作为候选。task 命名时强制对齐 canonical term。

### `kind: "review_findings"` (review)
扫描 review 报告中 finding description 的命名一致性（同一概念使用不同名称即冲突）。

### `kind: "session"` (learn)
调用 `extractSessionTermCandidates(sessionData, glossary)`（`src/learn.ts` 已有）。

### `kind: "commit_message"` (build)
扫描 commit subject + body 的术语一致性，避免 `ship feature x` vs `ship feat-x` 漂移。

## 接入点矩阵

| Skill | 当前状态 | 改造后行为 |
|-------|----------|------------|
| forge-decide | `checkDecideGlossaryConflicts` 直接调用 | 改为调用 `runGlossaryCheck({ phase: "decide", ... })`，wrapper 保留 |
| forge-grill | `checkGrillGlossaryConflicts` 直接调用 | 同上 |
| forge-spec | Step 7 内联扫描 | 改为 hook 调用，Step 7 简化为 1 行 |
| forge-plan | 无检查 | Step 3 Task Breakdown 后自动 hook 调用 |
| forge-review | 无检查 | Layer 2 命名一致性子项触发 hook |
| forge-learn | 内联调用 `extractSessionTermCandidates` | 改为 hook 调用 |
| forge-build | 无检查 | commit 前自动 hook 调用（可选，由 config 决定） |

## 频率控制

每个会话维护 `glossaryCheckedHashes: Set<string>`：
- key: `<phase>:<hashCandidates(candidates)>`
- 同一 phase 同一 candidate set 已检查过 → 直接返回 cached result（仍调用 hook 但不重复 prompt）
- phase 切换或 candidate set 变化 → 重新检查
- learn 阶段写回 glossary 后，hash 集合清零

## 双模式行为

### Autonomous 模式

冲突写入 `.forge/findings/glossary-advisory-<phase>-<topic>.md`：

```markdown
---
phase: <phase>
topic: <topic>
triggered_at: <ISO>
conflicts: [...]
---

# Glossary Advisory: <phase>

本次 autonomous 执行检测到术语冲突 N 处。建议在交互模式下运行
`/forge learn --review-glossary` 进行人工裁定。

## 冲突清单
- "<term>": existing = "...", proposed = "..."
- ...

## 候选新术语
- <term> (frequency: N)
- ...
```

spec frontmatter 同步加 `pending_glossary_advisories: [path1, path2]` 字段。

### Interactive 模式

中文 prompt（统一模板）：

```
⚠️ 检测到术语冲突 (<N>)：

  - "<term>"
    现有定义: <existing.definition>
    新候选: <candidate.definition>
    候选场景: <来源 phase>

请选择处理：
  1. 保留现有
  2. 替换为新定义
  3. 新增为别名
  4. 跳过（保留歧义）
```

## 文件影响

### 新增

- `src/glossary-hook.ts` — 调度层（约 200 LoC）
- `src/glossary-extractor.ts` — 通用 candidate 提取（合并 spec / plan / review / build 的扫描逻辑）
- `test/glossary-hook.test.ts` — 单元测试覆盖所有 phase / mode 组合
- `test/glossary-hook.property.test.ts` — PBT：normalizer 幂等性、阻断策略完备性、hash 稳定性
- `test/glossary-hook-skill-integration.test.ts` — 7 个 skill 接入点的契约测试

### 修改

- `src/index.ts` — barrel 导出
- `src/decide.ts` — `checkDecideGlossaryConflicts` 改为 hook wrapper（保留签名）
- `src/grill.ts` — `checkGrillGlossaryConflicts` 改为 hook wrapper
- `src/learn.ts` — `extractSessionTermCandidates` 提升为 normalizer 内部使用
- `skills/forge-spec/SKILL.md` — Step 7 简化为单行 hook 调用
- `skills/forge-decide/SKILL.md` — 标注内部使用 hook
- `skills/forge-grill/SKILL.md` — 同上
- `skills/forge-plan/SKILL.md` — Step 3 后增加 hook 调用
- `skills/forge-review/SKILL.md` — Layer 2 增加命名一致性子项
- `skills/forge-learn/SKILL.md` — 术语回写章节引用 hook
- `skills/forge-build/SKILL.md` — commit 章节增加可选 hook（config 控制）

### 不变

- `src/glossary.ts` 核心纯函数零修改
- `.forge/glossary.md` 文件格式不变
- 现有 wrapper 函数签名不变（薄包装转发）

## 边界与约束

- **不强制更新 glossary**：hook 仅检测和提示，是否更新 glossary 由 learn / 用户决策
- **不修改术语 canonical 形式**：拼写归一化（大小写 / 空格）由 normalizer 内部处理，不污染原始输入
- **autonomous 模式 advisory 必须可读**：advisory 文件包含完整冲突列表 + 候选 + 处理建议
- **频率控制不跨会话持久化**：避免 resume 后误判已检查
- **不替代 glossary 自身的 lint**：knowledge-integrity 中已有 glossary lint，不重复检查

## 验收标准

1. forge-decide Round 1 启动前调用 hook → conflicts 存在 → interactive block / autonomous advisory
2. forge-grill 每次 applyAnswer 后调用 hook → 行为与现状一致（向后兼容）
3. forge-spec Step 7 改用 hook → 检测到 spec 中术语漂移 → 提示用户更正
4. forge-plan Step 3 后调用 hook → task title 使用非 canonical term → warn + 建议 canonical 替换
5. forge-review Layer 2 调用 hook → 同一概念在多 finding 中使用不同名称 → warn
6. forge-learn 调用 hook → session 中新术语候选 → block 等用户决策；autonomous 累积到 evolution-report
7. forge-build commit 前 hook（如启用）→ commit message 含术语漂移 → warn 提示但不阻塞 commit
8. 同一 phase 同一 candidate set 第二次调用 → 频率控制返回 cached result，不再 prompt
9. spec frontmatter 含 `pending_glossary_advisories` → 下游 plan 启动时显示 advisory 列表
10. 现有 `test/decide-glossary-conflict.test.ts` 和 `test/grill-glossary-conflict.test.ts` 零回归

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Normalizer 提取候选不准 | 误报或漏报 | 各 phase 复用现有提取逻辑（spec/grill/learn 已有），不发明新规则 |
| 阻断策略表过于严格 | UX 退化（频繁 prompt） | 频率控制 + autonomous advisory + 用户可在 config 关闭某 phase 检查 |
| commit_message 检查噪音过大 | 用户禁用整个 hook | 默认对 build 关闭，由 config `glossary_check_on_commit: true` 启用 |
| 与 knowledge-integrity 重复 lint | 性能浪费 | 明确边界：hook = 触发时检测；integrity = 后台周期 lint |
| autonomous advisory 文件增长 | 目录膨胀 | learn 阶段消费后自动归档到 archive/ |

## 实施顺序

1. **调度层**：实现 `src/glossary-hook.ts` + `src/glossary-extractor.ts` + 单元测试 + PBT
2. **Decide / Grill 迁移**：把 wrapper 改为 hook 转发，验证零回归
3. **Spec / Learn 迁移**：用 hook 替换内联实现
4. **Plan 接入**：Step 3 Task Breakdown 后调用
5. **Review 接入**：Layer 2 命名一致性子项
6. **Build 接入**：commit hook（可选）
7. **频率控制 + 状态文件联动**：会话级 hash 集合管理
8. **文档对齐**：7 个 SKILL.md 同步更新
