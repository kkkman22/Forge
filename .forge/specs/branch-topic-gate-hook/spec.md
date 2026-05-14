---
status: draft
created: "2026-05-14"
topic: branch-topic-gate-hook
---

# Spec: Branch Topic Gate Hook

## 概述

`src/branch-lifecycle.ts` 已提供 5 个完整的纯函数（`checkBranchTopicGate` / `detectUnshippedBranches` / `detectStaleBranches` / `checkCommitTopicMatch` / `recordPendingDelivery`），但仅在 forge-build 和 forge-ship 中被调用。本 spec 把分支与任务一致性校验作为统一 hook 普及到 plan/review/test/debug/learn 等所有可能修改项目状态的 skill 启动处，避免"在错分支上运行 review"这类隐性故障。

不新增纯函数，仅新增统一调度入口 `runBranchGate(phase, ...)`。

## 动机

当前分支一致性检查的覆盖范围不完整：

| Skill | 是否检查 branch.topic == status.current_task | 影响 |
|-------|---------------------------------------------|------|
| forge-build | ✅ 已检查（§2 Branch Gate） | — |
| forge-ship | ✅ 已检查（Option 3 保留分支记录） | — |
| forge-plan | ❌ 不检查 | 在错分支上写 plan，与 spec 错位 |
| forge-review | ❌ 不检查 | 在错分支上跑 review，看到错误 diff |
| forge-test | ❌ 不检查 | 在错分支上跑 test，结果误导 |
| forge-debug | ❌ 不检查 | 在错分支上分析，根因定位错位 |
| forge-learn | ❌ 不检查 | 在错分支上提取经验，归属错乱 |

`commands/forge.md` 已有"全局分支保护规则"——禁止在 main 上修改文件——但这是粗粒度（仅区分 main vs 非 main），细粒度的 branch.topic vs current_task 一致性目前散落在 build/ship 两个 skill 中。

后果：
- 用户在功能分支 A 上做完 build，切到分支 B 直接跑 `/forge review`，review 看到的是 B 的代码 + A 的 status，结果误判
- conflict-resolver-hook spec 中提到"build hook 在 rebase 后接管"，但缺乏统一的 branch 一致性校验作为前置
- failure-sink 沉淀的失败 episode 缺少 branch 来源元数据（episode 不知道这次失败发生在哪个 branch.topic）

## 核心设计原则

- **不新增纯函数**：5 个核心函数已就绪，本 spec 仅做调度普及
- **Hook 作为前置闸门**：每个接入 skill 在 SKILL.md §1.5（Pre-flight）增加一行 `runBranchGate` 调用
- **失配处理分级**：硬阻断（修改文件类）vs 软警告（只读分析类），不同 skill 不同策略
- **autonomous 模式自动处理**：autonomous 失配时尝试自动 git checkout 到正确分支；失败则 advisory + skip
- **interactive 模式询问用户**：失配时显示清晰中文提示，三选项：切到正确分支 / 强制继续 / 中止
- **不重复 main 分支保护**：commands/forge.md 已有的全局规则不动，本 spec 是细粒度补充
- **频率控制**：同一 phase 同一会话只校验一次，phase 切换时重置

## 统一入口契约

```ts
// src/branch-gate.ts （新增，调度层）

export type BranchGateSkill =
  | "plan" | "build" | "review" | "test" | "ship" | "debug" | "learn"

export type BranchGateMode = "autonomous" | "interactive"

export type BranchGateSeverity = "block" | "warn"

export type BranchGateResult =
  | { kind: "passed" }
  | { kind: "skipped"; reason: "already_checked_this_phase" | "no_current_task" }
  | { kind: "blocked"; reasons: string[]; suggestedBranch: string }
  | { kind: "warned"; reasons: string[]; suggestedBranch: string }
  | { kind: "auto_fixed"; previousBranch: string; newBranch: string }

export interface BranchGateInput {
  skill: BranchGateSkill
  mode: BranchGateMode
  currentBranch: string                   // git rev-parse --abbrev-ref HEAD
  currentTask: string | null              // 从 .forge/status.md 读取
  pendingDeliveries: PendingDeliveryRecord[]
  alreadyCheckedThisPhase: boolean
  severityOverride?: BranchGateSeverity   // skill 默认严重度的覆盖
}

/** 统一调度入口，纯函数。所有 skill 启动 §1.5 调用。 */
export function runBranchGate(input: BranchGateInput): BranchGateResult

/** 默认严重度映射（数据驱动，可被 input.severityOverride 覆盖） */
export const DEFAULT_SEVERITY: Record<BranchGateSkill, BranchGateSeverity>

/** 渲染 interactive 模式的中文提示 */
export function renderBranchGatePrompt(result: BranchGateResult): string

/** 渲染 autonomous 模式的 advisory 文本 */
export function renderBranchGateAdvisory(result: BranchGateResult): string
```

`runBranchGate` 内部组合调用现有的 `checkBranchTopicGate` / `detectUnshippedBranches` / `detectStaleBranches`，输出统一的 `BranchGateResult`。**不重新实现分类逻辑**。

## 默认严重度映射

| Skill | severity | 理由 |
|-------|----------|------|
| plan | warn | plan 主要是规划文档，错分支风险中等 |
| build | block | 已有的硬阻断逻辑保留 |
| review | block | review 看到错 diff 直接误判 |
| test | block | test 结果错误会误导后续 ship |
| ship | block | 已有 |
| debug | warn | debug 是诊断性质，可能跨分支查问题 |
| learn | warn | learn 是回顾性质，但仍需要正确归属 |

`severityOverride` 用于 forge-debug 跨分支调试这种合法场景（用户显式 `--cross-branch`）。

## 双模式行为

### Autonomous 模式

| 失配类型 | 行为 |
|----------|------|
| branch.topic 不匹配 + suggestedBranch 存在且 clean | 自动 `git checkout suggestedBranch`，emit `auto_fixed` |
| branch.topic 不匹配 + 工作树 dirty | advisory + skip skill |
| branch 不在 feature/forge format | advisory + skip skill |
| 检测到 unshipped branches（其他分支未交付） | advisory（写 `.forge/status.md` 提示），不阻塞 |

advisory 写入 `.forge/findings/branch-gate-advisory-<timestamp>.md`，包含完整 reasons 列表。

### Interactive 模式

| 失配类型 | 提示与选项 |
|----------|------------|
| branch.topic 不匹配 | 中文提示 3 选项：切到 `<suggestedBranch>` / 强制继续（覆盖 severity） / 中止 skill |
| branch 格式异常 | 中文提示：当前分支不符合 feature/forge 格式，建议先创建合规分支 |
| unshipped branches | 中文提示：列出未交付分支，询问是否先处理 |

## 接入点矩阵

每个接入 skill 在 SKILL.md §1.5 增加：

```markdown
### Pre-flight: Branch Gate

调用 `runBranchGate({ skill: "<skill_name>", mode, currentBranch, currentTask, pendingDeliveries, alreadyCheckedThisPhase: status.alreadyCheckedThisPhase })`：
- `passed` / `skipped` → 继续后续 §
- `auto_fixed` → 输出 `✅ 已自动切换到 <newBranch>` 后继续
- `blocked` → 中止 skill，按 mode 输出对应提示
- `warned` → 输出警告但继续
```

接入清单与改动量：

| Skill | SKILL.md 新增 LoC | 现状 |
|-------|-------------------|------|
| forge-plan | ~5 | 不检查 |
| forge-review | ~5 | 不检查 |
| forge-test | ~5 | 不检查 |
| forge-debug | ~5 | 不检查 |
| forge-learn | ~5 | 不检查 |
| forge-build | ~3（替换现有逻辑） | 已检查，逻辑迁移到 hook |
| forge-ship | ~3（替换现有逻辑） | 已检查，逻辑迁移到 hook |

## 频率控制

- 同一 phase 同一会话最多 1 次（通过 `status.md` 字段 `branchGateCheckedPhases: ["plan", "build"]` 跟踪）
- phase 切换时（status.phase 改变）字段清零
- 用户手动 `/forge` 子命令调用同 phase 时不再重复（避免冗余 git 调用）

## 与 conflict-resolver-hook 的协同

| 场景 | conflict-resolver | branch-gate |
|------|-------------------|-------------|
| build 中途 rebase 同步 main 后 | 处理 .forge/ 冲突 | 在 conflict-resolver 完成后立即跑 branch-gate（rebase 可能改变分支状态） |
| ship Merge 失败回退 | 处理冲突或 abort | abort 后跑 branch-gate 确认仍在合法分支 |

调用顺序：先 conflict-resolver（如有冲突），再 branch-gate（验证后续状态）。

## 与 failure-sink 的协同

`runBranchGate` 返回 `blocked` 时，driver 层可选地向 failure-sink emit 一条新 trigger（待 failure-sink-trigger-expansion spec 增加 `branch_gate_blocked`）。本 spec **不强制**该 trigger，由后续观察决定是否需要。

## 文件影响

### 新增

- `src/branch-gate.ts` — 调度层（约 150 LoC，含 4 个 export 函数 + 严重度映射）
- `test/branch-gate.test.ts` — 单元测试覆盖所有 result kinds
- `test/branch-gate.property.test.ts` — PBT：频率控制不变量、严重度映射完备性、auto_fixed 幂等性
- `test/branch-gate-skill-integration.test.ts` — 7 个 skill 接入点的契约测试

### 修改

- `src/index.ts` — barrel 导出 branch-gate.ts 公共 API
- `skills/forge-plan/SKILL.md` — §1.5 Pre-flight 增加 branch gate
- `skills/forge-review/SKILL.md` — 同上
- `skills/forge-test/SKILL.md` — 同上
- `skills/forge-debug/SKILL.md` — 同上
- `skills/forge-learn/SKILL.md` — 同上
- `skills/forge-build/SKILL.md` — §2 Branch Gate 改为引用统一 hook（语义不变）
- `skills/forge-ship/SKILL.md` — 同上

### 不变

- `src/branch-lifecycle.ts` — 5 个核心纯函数零修改
- `commands/forge.md` 全局 main 保护规则零修改
- 现有 forge-build / forge-ship 的 branch 检查行为零回归

## 边界与约束

- **不替代全局 main 保护**：commands/forge.md §"全局分支保护规则"是粗粒度第一道闸门，本 hook 是细粒度第二道
- **不主动创建分支**：autonomous 模式下若 suggestedBranch 不存在，不自动创建，仅 advisory
- **不修改 git 配置**：hook 只读 git state + 可选 checkout，不动 git config / hooks / submodules
- **dirty 工作树永不自动 checkout**：保护未提交工作不丢失
- **跨 worktree 不普及**：Forge Loop worktree 已有独立分支隔离，hook 不在 worktree 内部跑

## 验收标准

1. forge-plan 在分支 `feature/A` 上调用，但 `.forge/status.md` 的 current_task = `B` → autonomous 模式 advisory + skip；interactive 模式提示用户
2. forge-review 在错分支 → block，autonomous 写 advisory，interactive 显示中文 3 选项
3. forge-build / forge-ship 现有 branch 检查行为零回归（已有测试通过）
4. 同一 phase 同一会话第二次调用 `runBranchGate` → 返回 `skipped: already_checked_this_phase`
5. autonomous 模式 + clean tree + suggestedBranch 存在 → 自动 checkout，emit `auto_fixed`
6. autonomous 模式 + dirty tree → advisory + skip，不强制 checkout
7. forge-debug 用户传入 `--cross-branch` → severityOverride: warn，跨分支调试合法
8. unshipped branches 检测到 → autonomous advisory；interactive 询问
9. branch 不在 feature/forge format → 所有 skill 都 block（强制约定）
10. failure-sink 沉淀的 episode 现在可读取 branch.topic 元数据（通过 driver 层在 emit 时附加）

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 跨 phase 误清频率字段 | 重复跑 branch gate | phase 切换通过事件驱动（status.phase 变化触发清零），不依赖时间窗口 |
| autonomous 自动 checkout 误切 | 用户工作流被打断 | dirty tree 永不 checkout；advisory 中始终列出 previousBranch 便于用户回退 |
| 严重度映射对某 skill 不合理 | UX 退化或误阻断 | 提供 `severityOverride` 参数让用户在调用时覆盖 |
| 7 个 skill 同时接入引入大改 | 实施复杂 | 分批接入：先 review/test/plan（高风险只读），再 debug/learn（中风险） |
| 与全局 main 保护重复触发 | 用户看到两次警告 | runBranchGate 在 currentBranch == main/master 时直接返回 `passed`，让全局保护处理 |

## 实施顺序

1. **调度层**：实现 `src/branch-gate.ts` + 单元测试 + PBT
2. **Build / Ship 迁移**：把现有 build/ship 的 branch 检查逻辑改为调用 hook，行为零回归
3. **Review / Test 接入**：高风险只读 skill 先接入，验证 block 路径
4. **Plan 接入**：warn 路径验证
5. **Debug / Learn 接入**：含 severityOverride 路径
6. **频率控制接入 status.md**：phase 字段联动测试
7. **文档对齐**：7 个 SKILL.md §1.5 同步更新
