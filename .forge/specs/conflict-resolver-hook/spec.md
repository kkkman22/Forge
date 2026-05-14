---
status: draft
created: "2026-05-14"
topic: conflict-resolver-hook
---

# Spec: fix-conflicts hook 化为跨阶段冲突处理能力

## 概述

将 `forge-fix-conflicts` 从"用户主动调用的辅助命令"升级为 git merge / rebase 操作产生 `.forge/` 冲突时的自动触发器。核心三区分类逻辑抽离到 `src/conflict-resolver.ts` 纯函数库，由 build / ship 等阶段的 git 操作 hook 自动调用，同时保留 `/forge fix-conflicts` 显式入口供手动调用。

## 动机

当前 `forge-fix-conflicts` 锁定在"用户主动运行 `/forge fix-conflicts`"路径上，导致以下盲区：

- **ship 阶段冲突**：`ship_merge` effect 在 merge 失败时直接 `merge --abort`，丢失三区分类能力，用户需手动解决再重新跑 ship
- **build 中途 rebase**：工程师在功能分支上 `git rebase main` 同步时遇到 `.forge/` 冲突，必须中断 build 流程切到 fix-conflicts，再切回 build
- **Forge Loop worktree 合并**：多 worktree 并行后合并主仓库时同样遇到冲突，无人接管
- **逻辑封装在 SKILL.md**：三区分类规则、frozen 拒绝流程、guarded 合并策略以 Markdown 描述存在，难以被其他阶段复用，也难以做契约测试

冲突的发生不分阶段，处理逻辑应是跨阶段共享的能力，而不是一个阶段独占的 skill。

## 核心设计原则

- **核心逻辑纯函数化**：三区分类、frozen 拒绝判定、guarded 语义合并规则全部抽到 `src/conflict-resolver.ts`，无 IO、可单元测试
- **触发点多元化**：build / ship / Forge Loop / 显式调用四个入口共享同一处理流程
- **零回归保证**：现有 `/forge fix-conflicts` 显式入口和行为完全保留，新增能力不破坏已有路径
- **frozen 拒绝绝对优先**：任何触发点遇到 frozen 文件冲突，必须走"3 选项确认"流程，**不允许**自动模式静默处理（保护冻结契约）
- **三态结果回流**：每次冲突处理结束后产出结构化结果（resolved / refused / aborted），由触发方决定后续行为

## 架构概览

### 模块拆分

```
src/conflict-resolver.ts    （新增，纯函数核心）
  - classifyConflictZone(path, statusContent) → "frozen" | "guarded" | "open" | "source"
  - applyGuardedMerge(path, type, ours, theirs) → MergeResult
  - buildFrozenRefusalPrompt(paths) → string
  - validateConflictResolution(checkResult) → ValidationGate
  - parseConflictedPaths(gitOutput) → string[]

skills/forge-fix-conflicts/SKILL.md      （瘦身保留）
  - 仅描述显式调用语义和用户交互
  - 三区规则、合并策略全部移到 references/ 引用 conflict-resolver.ts 契约

src/ship.ts                 （改造）
  - ship_merge effect 在 merge 失败时调用 conflict-resolver

src/build-git-hook.ts        （新增，build 阶段 git 操作 hook）
  - 包装 git rebase / pull / merge，捕获冲突自动触发 conflict-resolver
```

### 触发点汇总

| 触发点 | 阶段 | 自动 vs 交互 | 失败回退 |
|--------|------|--------------|---------|
| `ship_merge` effect 失败 | ship | autonomous: 自动尝试；interactive: 询问 | conflict-resolver 失败 → `merge --abort` 退回，提示用户 |
| build 阶段 git rebase / pull / merge 冲突 | build / 任何编辑阶段 | 自动尝试 | 失败 → 暂停阶段，提示用户手动介入 |
| Forge Loop worktree 合并冲突 | Forge Loop | 自动尝试（autonomous mode） | 失败 → run 进入 `aborted` 状态，写 stash |
| `/forge fix-conflicts` 显式调用 | 任意（用户主动） | 交互式 | 用户选择 abort / manual |

## Conflict Resolver 核心契约

### 函数：`classifyConflictZone`

```ts
function classifyConflictZone(
  path: string,
  statusContent: string,
): "frozen" | "guarded" | "open" | "source"
```

- **参数**：冲突文件路径、当前 `.forge/status.md` 内容（用于读取 frozen 文件清单）
- **返回值**：四种区域之一
  - `frozen` — `.forge/specs/*.md` 且 status 标记 locked / approved
  - `guarded` — `.forge/progress/*.md` / `instincts/known-failures` / `ADR-*.md` / `reviews/*.md`
  - `open` — `.forge/` 下其他文件（findings / debug 等）
  - `source` — `.forge/` 之外的源码文件，留给用户手动解决
- **纯函数**：相同输入相同输出，无 IO

### 函数：`applyGuardedMerge`

```ts
type GuardedFileType = "progress" | "known-failures" | "adr" | "reviews"
function applyGuardedMerge(
  type: GuardedFileType,
  ours: string,
  theirs: string,
): MergeResult
```

合并规则（与现有 forge-fix-conflicts 一致）：

| 类型 | 策略 |
|------|------|
| `progress` | task_id 维度合并：completed > pending |
| `known-failures` | confidence=max，count=sum |
| `adr` | 重新分配 ID 序列 |
| `reviews` | append 双方 findings，按 (layer, severity) 排序 |

返回 `{ merged: string, conflicts: ConflictHint[] }`，merged 为合并后内容，conflicts 用于回退判定。

### 函数：`buildFrozenRefusalPrompt`

```ts
function buildFrozenRefusalPrompt(paths: string[]): string
```

为 frozen 区冲突生成中文 3 选项提示：
- 手动解决（保留 worktree/index 状态）
- 解锁后合并（status 改为 draft + 写解锁日志 + 三方合并）
- 中止合并（`git merge --abort` / `git rebase --abort`）

### 函数：`validateConflictResolution`

```ts
function validateConflictResolution(
  checkAttempts: CheckAttempt[],
): ValidationGate
```

应用 Three-Strike 规则：
- 同一文件再次修改 = 新尝试
- 未修改文件重跑 = 同一次尝试
- 连续 3 次失败 → 触发 `/forge debug`

返回 `{ passed: boolean, attemptCount: number, escalateToDebug: boolean }`。

## 触发点改造

### 1. ship_merge effect 改造

```
现状：
  ship_merge:
    checkout main → merge branch
    on failure: merge --abort

改造后：
  ship_merge:
    checkout main → merge branch
    on conflict:
      paths = parseConflictedPaths(stderr)
      result = resolveConflicts(paths, mode)
      if result.allResolved:
        commit merge
      else if result.frozenRefused:
        merge --abort + 提示用户
      else if result.escalateToDebug:
        merge --abort + 触发 /forge debug
      else:
        merge --abort + 透传错误
```

**模式分流**：
- `autonomous`：直接调用 conflict-resolver，frozen 区也走 abort（不允许静默修改 locked spec）
- `interactive`：调用 conflict-resolver，frozen 区走 3 选项交互

### 2. build 阶段 git 操作 hook

新增 `src/build-git-hook.ts`：

```
buildGitHook.runWithConflictHandling(operation: "rebase" | "pull" | "merge", args):
  执行 git operation
  捕获 stderr 含 "CONFLICT"
  调用 resolveConflicts(parsedPaths, mode)
  按结果决定：
    - 全部解决 → 继续 build
    - frozen 拒绝 → 暂停 build，emit notice
    - 升级 debug → 切换到 /forge debug
```

应用场景：用户在 build 中途同步 main，或 Forge Loop 自动 rebase 时。

### 3. Forge Loop worktree 合并

`src/run-manager.ts` 的 worktree 合并路径接入 conflict-resolver，autonomous 模式下：
- 全部解决 → 继续合并
- frozen 拒绝 / 升级 debug → run 状态 `aborted`，stash 保留

### 4. 显式 `/forge fix-conflicts` 命令

保留现有交互式行为，SKILL.md 主体瘦身：

```markdown
# /forge fix-conflicts — 显式冲突处理入口

> 触发：用户主动调用
> 委托：内部使用 src/conflict-resolver.ts 处理逻辑

## 行为
1. 扫描当前冲突路径
2. 调用 resolveConflicts(paths, "interactive")
3. 渲染结果到对话框

详细规则见 references/zone-classification.md（链接到 conflict-resolver 契约）
```

## 双模式行为

| 模式 | frozen 区 | guarded 区 | open 区 | source 区 |
|------|-----------|------------|---------|-----------|
| autonomous | abort merge + 提示用户 | 自动语义合并 | accept ours | 留给用户 |
| interactive | 3 选项交互 | 自动语义合并 + 报告 | accept ours | 留给用户 |

## resolveConflicts 顶层函数

```ts
type ResolveMode = "autonomous" | "interactive"
type ResolveResult = {
  allResolved: boolean,
  frozenRefused: boolean,
  escalateToDebug: boolean,
  resolvedPaths: string[],
  refusedPaths: string[],
  validationGate: ValidationGate,
}

async function resolveConflicts(
  paths: string[],
  mode: ResolveMode,
  context: { statusContent, repoRoot, runCheckCommand },
): Promise<ResolveResult>
```

入口函数串联 classifyConflictZone → 按区域分流 → applyGuardedMerge → 写盘 → validateConflictResolution → 返回结果。所有触发点统一调用此函数。

## 文件影响

### 新增

- `src/conflict-resolver.ts` — 核心纯函数库（classify / applyGuardedMerge / buildFrozenRefusalPrompt / validateConflictResolution / resolveConflicts）
- `src/build-git-hook.ts` — build 阶段 git 操作 hook 包装
- `test/conflict-resolver.test.ts` — 单元测试覆盖所有纯函数
- `test/conflict-resolver.property.test.ts` — PBT：分类一致性、合并 round-trip、Three-Strike 不变量
- `test/ship-merge-conflict.test.ts` — ship_merge 自动触发 conflict-resolver 的契约测试
- `test/build-git-hook.test.ts` — build 阶段 git hook 触发的契约测试

### 修改

- `src/ship.ts` — `ship_merge` effect 接入 conflict-resolver，移除直接 abort
- `src/run-manager.ts` — Forge Loop worktree 合并路径接入 conflict-resolver
- `skills/forge-fix-conflicts/SKILL.md` — 主体瘦身，仅描述显式调用语义
- `skills/forge-fix-conflicts/references/zone-classification.md` — 改为引用 conflict-resolver 契约
- `skills/forge-fix-conflicts/references/guarded-merge-rules.md` — 同上
- `skills/forge-fix-conflicts/references/frozen-refusal-flow.md` — 同上
- `skills/forge-ship/SKILL.md` — §3 Four Delivery Options 中 Merge to main 增加冲突自动处理说明
- `skills/forge-ship/references/delivery-options.md` — Option 1 Merge 描述更新
- `skills/forge-build/SKILL.md` — 新增"git 同步操作"章节，说明 rebase/pull 自动接入 conflict-resolver

### 不变

- `commands/forge-fix-conflicts.md` — 显式命令入口完全保留
- `forge-fix-conflicts` skill 在主包中保留（不下线，仅瘦身）
- 现有 `test/fix-conflicts-frozen-refuse.test.ts` / `test/fix-conflicts-three-strike.test.ts` — 改为对 conflict-resolver 测试，行为契约不变

## 边界与约束

- **frozen 区不可绕过**：任何模式下，frozen 区冲突都不能自动写入。autonomous 模式下直接 abort + 通知用户；不存在"自动解锁后合并"的路径
- **conflict-resolver 不修改 status.md**：仅读取 frozen 清单，不写入任何 forge 状态。状态变更由调用方负责
- **三态结果约定**：`allResolved` / `frozenRefused` / `escalateToDebug` 三个标志互斥（同一时刻只有一个为 true）
- **不替代 forge-debug**：Three-Strike 升级仍走 `/forge debug`，conflict-resolver 不直接做诊断
- **不处理源码冲突**：`source` 区文件的冲突保留 git 标记交给用户手动解决，conflict-resolver 不动它们
- **向后兼容**：`/forge fix-conflicts` 显式调用的所有现有行为完全保留

## 验收标准

1. `git rebase main` 在功能分支上产生 `.forge/progress/<topic>.md` 冲突 → build hook 自动调用 conflict-resolver → 按 task_id 合并 → build 继续
2. `/forge ship` 选 Merge to main 遇到 `.forge/reviews/<topic>.md` 冲突 → ship_merge 自动调用 conflict-resolver → append 双方 findings → 完成 merge
3. ship 选 Merge 遇到 `.forge/specs/<topic>/spec.md`（locked）冲突 → autonomous 模式下 `merge --abort` 并提示用户；interactive 模式下渲染 3 选项
4. Forge Loop worktree 合并遇到 frozen 区冲突 → run 状态 `aborted`，工作 stash 保留
5. `/forge fix-conflicts` 显式调用行为与现状完全一致
6. 同一冲突文件连续 3 次合并失败 → conflict-resolver 返回 `escalateToDebug: true`，触发方暂停并切换到 `/forge debug`
7. `npm run check` 在 conflict-resolver 完成后被自动调用作为验证门禁
8. `conflict-resolver` 所有纯函数有单元测试覆盖，分类规则、合并规则、Three-Strike 不变量有 PBT 覆盖
9. ship_merge 旧路径（无冲突）行为不变，零回归
10. SKILL.md 主体行数减少（forge-fix-conflicts 瘦身后 SKILL.md ≤ 100 行，逻辑链接到 references）

## 与现有路线图的关系

完成 ROADMAP v2.6 中"`forge-fix-conflicts` 整合评估"的部分：

- **结论变更**：不下线 `forge-fix-conflicts` skill，但核心逻辑独立化、跨阶段复用
- **配合本次 spec 完成的工作**：`refactor-fix-into-build-mode` spec 把 refactor / fix 合入 build，本 spec 把 fix-conflicts 升级为通用能力。两个 spec 完成后，主包 skill 减 2（refactor + fix），保留 fix-conflicts 但能力扩展到全阶段

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| build 阶段 git hook 与现有 git 操作冲突 | 工作流被意外中断 | hook 仅包装明确的同步操作（rebase/pull/merge），不拦截 commit / push |
| autonomous 模式下 frozen 区 abort 后用户不知所措 | UX 退化 | abort 时输出明确的下一步提示：手动解决 / 解锁 / `/forge fix-conflicts` 交互模式 |
| conflict-resolver 抽象化过早 | 模块边界不清 | 先复制现有 fix-conflicts 逻辑到 conflict-resolver，再让 fix-conflicts SKILL.md 引用，分两步走 |
| Three-Strike 计数器跨阶段共享语义不清 | 误升级 debug | 每个触发点维护独立计数器，conflict-resolver 仅返回单次调用的尝试数 |
| ship_merge 自动处理冲突后用户失去 review 机会 | 静默 merge 错误 | autonomous 模式下处理结果写到 `.forge/ship/<topic>-merge-conflict-log.md`，post-push verify 时回看 |

## 实施顺序建议

1. **抽取核心**：复制 forge-fix-conflicts 的三区分类、合并规则、frozen 拒绝逻辑到 `src/conflict-resolver.ts`，纯函数化
2. **单元 + PBT**：为 conflict-resolver 写完整测试，与现有 `test/fix-conflicts-*.test.ts` 行为对齐
3. **fix-conflicts skill 接入**：让现有 `/forge fix-conflicts` 命令切换到 conflict-resolver，验证零回归
4. **ship_merge 接入**：改造 `ship_merge` effect，autonomous + interactive 模式分别测试
5. **build hook 接入**：新增 `src/build-git-hook.ts`，包装 rebase/pull/merge
6. **Forge Loop 接入**：worktree 合并路径接入
7. **SKILL.md 瘦身**：fix-conflicts SKILL.md 改为引用 conflict-resolver 契约，主体行数大幅缩减
8. **文档对齐**：commands / docs 更新触发点描述
