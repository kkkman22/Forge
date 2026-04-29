---
name: forge-build
description: "执行引擎。按计划以 TDD 方式逐任务实现代码，通过 Subagent 隔离和原子提交保证质量。"
disable-model-invocation: true
---

# /forge build — 执行引擎

> **触发方式**：标准路径的第二步，全量路径的第四步，轻量路径的第一步，或用户直接输入 `/forge build`
> **职责**：按计划以 TDD 方式逐任务实现代码，通过 Subagent 隔离和原子提交保证实现质量
> **输出路径**：`.forge/progress/<topic>.md`（实时进度）+ 项目代码变更

---

## 1. 概述

`/forge build` 是 Forge 工作流的核心执行阶段——把计划变成代码。它根据路由档位选择三条执行路径之一，对每个任务强制执行 TDD 铁律，并通过原子提交保证每一步都可回溯。

**核心原则**：测试先于代码，验证先于声明。没有运行过的测试 = 不存在的测试。说"应该可以了"等于说"我没验证"。

---

## 2. 前置检查

在标准路径和全量路径下，build 启动前**必须逐条通过以下前置检查**。任一条件不满足时，不得继续 build。

### 检查清单

| # | 检查条目 | 验证方法 | 阻断条件 | 不通过时的路由 |
|---|---------|---------|---------|--------------|
| 1 | **Spec 门禁** | 扫描 `.forge/specs/` 下所有 `spec.md` 的 YAML `status` | `status` 不是 `"locked"`（标准路径无 Spec 时豁免） | → `/forge spec` |
| 2 | **Plan 门禁** | 扫描 `.forge/plans/` 下所有 `.md` 的 YAML `status` | `status` 不是 `"approved"` | → `/forge plan` |
| 3 | **`.forge/` 目录结构完整性** | 检查 `.forge/` 及其 `specs/`、`plans/`、`progress/` 子目录 | 目录缺失 | → `forge init` |
| 4 | **分支门禁** | `git branch --show-current` 与 topic 期望分支比对 | 不在 `feature/<topic>` 或 `forge/<topic>` 上 | → 自动切换（见 §2.1） |

**Spec 门禁豁免**：Plan 标注 `spec_ref: "none（基于用户需求描述）"` 时，仅检查 Plan 门禁和目录结构。

**拒绝输出格式**（Canonical Example — Spec 未锁定）：

```
🚫 Build 前置检查未通过

命中检查：Spec 门禁
证据：.forge/specs/user-notification/spec.md 的 status 为 "draft"
建议路由：/forge spec — 先完成规格的 Review 和 Lock 流程
重入条件：spec.md 的 status 变为 "locked" 后，重新运行 /forge build
```

其他场景替换字段：Plan 未批准 → 证据改为 plan status；目录不完整 → 证据改为缺失目录；多项不通过 → 逐条列出所有失败检查。

**Autonomous 模式**返回 JSON：`{"success":false,"summary":"Build 前置检查未通过：<检查>","evidence":"<证据>","suggested_route":"<路由>","reentry_condition":"<重入条件>"}`

### §2.1 分支门禁（检查 #4）

**目的**：防止多功能开发时代码提交到错误分支。

**检查流程**：

1. 获取当前分支：`git branch --show-current`
2. 确定期望分支：`feature/<topic>` 或 `forge/<topic>`（均接受）
3. 比对并决策：

| 当前分支 | 期望分支状态 | 操作 |
|---------|------------|------|
| 已在 `feature/<topic>` 或 `forge/<topic>` | — | ✅ 通过 |
| 在其他分支上 | 已存在 | `git checkout <branch>` |
| 在其他分支上 | 不存在 | `git checkout -b feature/<topic>` |

**自动切换前提**：工作树必须干净。不干净时阻断，提示先 `git stash` 或 `git commit`。

**输出格式**（Canonical Example — 分支切换）：

```
🔀 分支切换
当前分支：main
期望分支：feature/ship-delivery-unification
操作：已自动切换到 feature/ship-delivery-unification
继续 build...
```

其他场景：分支不存在 → 输出"分支创建"并 `checkout -b`；跨功能分支 → 输出 ⚠️ 警告；工作树不干净 → 🚫 阻断并建议 stash/commit。

**轻量路径例外**：跳过检查 #1 和 #2，但仍需通过 #3 和 #4。

---

## 3. 三条执行路径

### 3.1 轻量路径（Light）

适用于影响文件 ≤ 1 且改动 ≤ 20 行的小任务。

1. 直接修改代码，不启动 Subagent。
2. **每两步暂停确认**——修改两个位置后暂停，展示变更，等待确认。
3. 修改完成后运行验证命令。
4. 提交变更。

**无门禁要求**：跳过 Spec 和 Plan 门禁。**无 Restatement**：改动足够小，不存在注意力衰减问题。

### 3.2 标准路径（Standard）

适用于有明确需求或现成 Spec 的中等任务。

**流程**：

1. 读取 `.forge/plans/<topic>.md` 任务列表，检测 `format` 字段。
2. 对每个原子任务，执行 **Closure-First 探针**（§3.4），然后启动 **Subagent** 执行 TDD 循环（RED → GREEN → REFACTOR）。
3. 每个任务完成后：更新 progress、执行原子提交（Plan 定义的 commit message）。
4. 所有任务完成后，执行 **Final Validation**（§3.5）。

**Restatement Checkpoint（上下文刷新）**：

Restatement 是编排循环的**强制步骤**，不是可选优化。跳过 Restatement 等于允许注意力衰减侵蚀执行质量。

- **计数器初始化**：build 开始时，初始化为 N（N = config.md `restatement_interval`，默认 3，范围 2–10。缺失则用默认值，不阻断）。
- **计数器检查**：派发下一个 Subagent 前，计数器归零时执行 Checkpoint，然后再进入探针。
- **计数器递减**：每个任务完成后（progress 更新 + 原子提交之后）减 1。

**Checkpoint 执行步骤**：

1. **重读状态**：重读 `.forge/progress/<topic>.md` 和 `.forge/status.md`
2. **刷新知识**：重读 `.forge/knowledge/instincts.md`
3. **追加摘要**：在上下文尾部追加 5 区块摘要（不修改 System Prompt）
4. **写入中间日志**：更新 `.forge/knowledge/sessions/<date>-<topic>-interim.md`
5. **重置计数器**：重置为 N

**Restatement 摘要格式**（5 个必需区块）：

```
━━━ 📋 Restatement Checkpoint（Task N/M 完成后）━━━

📊 进度：已完成 N/M 个任务
  ✅ <已完成的任务列表>
  🔜 <下一个任务>（下一步）
  ⏸️ <未开始的任务列表>

🎯 下一步：Task X — <完整标题和文件路径>

⚠️ 执行纪律重申：
  • TDD 铁律：RED → GREEN → REFACTOR，不可跳过任何阶段
  • 原子提交：一个任务一个 commit，不合并
  • 验证铁律：[Command] → [Output] → [Claim]，不接受"应该可以了"
  • Subagent 状态必须检查：DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
  • Closure-First 探针：每个任务前必须执行 2 Probe + 1 Verify

🧠 活跃的行为提示：
  • <从 status.md hints 字段提取的当前活跃提示>

📚 匹配的直觉模式：
  • <从 instincts.md 匹配的模式，附 confidence>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**异常触发的 Restatement**：Subagent 返回 BLOCKED / NEEDS_CONTEXT / DONE_WITH_CONCERNS 时，**立即**执行 Checkpoint（不重置周期计数器）。摘要增加异常区块：

```
🚨 异常状态：Subagent 返回 <状态>
  任务：Task N — <标题>
  原因：<报告的原因>
  处理：BLOCKED → 评估原因 | NEEDS_CONTEXT → 补充重派 | DONE_WITH_CONCERNS → 阅读判断
```

**Token 成本约束**：单次 Checkpoint ≤1,500 tokens。10 个任务（N=3）总开销 ≤ 总 Token 的 10%。

**Subagent 隔离**：每个 Subagent 拥有新鲜上下文，依赖通过文件系统传递。

**Subagent 状态处理协议**：

| 状态 | 处理方式 |
|------|---------|
| **DONE** | 进入评审步骤，然后标记完成 |
| **DONE_WITH_CONCERNS** | 阅读疑虑。正确性/范围问题 → 先解决再评审。观察性建议 → 记录 findings，继续 |
| **NEEDS_CONTEXT** | 提供缺失上下文，重新派发 |
| **BLOCKED** | 评估：1) 上下文不足 → 补充重派；2) 任务过大 → 拆分；3) Plan 问题 → 报告用户 |

**绝不**忽略 Subagent 的升级请求。

**Subagent 指令构造**：为每个 Subagent 包含：(1) Closure-First 探针结果 (2) 任务描述 (3) 文件上下文 (4) 知识回流（instincts/known-failures 匹配） (5) TDD 要求 (6) 验证命令 (7) 完成前自检 (8) 禁止事项（不改范围外文件，不跳测试） (9) 失败重试 Restatement。

**Lightweight 格式**：Plan `format: "lightweight"` 时，额外注入 Design Reference 上下文（读取 `designReference` 指向的章节，提取接口定义和正确性属性）。如有 `propertyRef`，必须编写属性测试。

**Subagent 调用方式**：`Agent(prompt="<指令>", skills=["forge-test"], permissionMode="acceptEdits", maxTurns=20)`

预加载 `forge-test` skill 让 Subagent 自动拥有测试引擎完整知识。

**Subagent 完成前自检**：

| 自检项 | 不通过时的处理 |
|--------|--------------|
| Spec 场景覆盖 | 补充测试，重走 RED→GREEN |
| 安全快扫（硬编码密钥/注入/鉴权） | 立即修复 |
| 范围检查（仅修改指定文件） | 撤销范围外修改 |

**自检输出**：`📋 任务自检 ✅/❌ Spec 场景 ✅/❌ 安全快扫 ✅/❌ 范围检查 → 状态：DONE`

### 3.3 全量路径（Full）

适用于涉及新服务、新数据库、认证体系变更或需求模糊的复杂任务。

**阶段一：并行研究**

通过 Agent tool 并行启动多个研究 Subagent（架构/依赖/风险），用 `Promise.allSettled` 等待。研究发现合并到 `.forge/findings/<topic>.md`。

**阶段一不使用 Restatement**：由独立 Subagent 并行执行，主 Agent 只等汇总。

**阶段二：分模块实现**

1. 基于研究发现和 Plan，将任务按模块分组。
2. 对每个模块启动 Subagent 执行 TDD 循环。
3. **可选 Git Worktree**：模块改动有文件重叠时使用，无重叠则直接在主分支执行。
4. 所有模块完成后执行 Final Validation（§3.5）。

**Restatement Checkpoint**：阶段二的分模块实现使用与 §3.2 **完全相同**的 Restatement 机制（计数器初始化、检查、Checkpoint 步骤、摘要格式、异常触发、轻量路径排除）。阶段二开始时初始化计数器。

---

## 3.4 Closure-First 探针（2 Probe + 1 Verify）

每个原子任务进入 TDD 循环前，**必须先执行 Closure-First 探针**。借鉴 Vibe-Skills 反死寂设计——避免 AI 在错误假设上浪费 token。

**探针执行方式**：使用 `explore` agent（`Agent(prompt="<探针指令>", subagent_type="explore")`）。

| 步骤 | 动作 | 目的 |
|------|------|------|
| **Probe #1** | 检查文件/目录是否存在 | 确认仓库结构与 Plan 假设一致 |
| **Probe #2** | 搜索相关关键词、函数名、接口名 | 定位代码入口点和依赖关系 |
| **Verify #1** | 运行最窄范围验证命令 | 确认当前代码库状态健康 |

**探针输出**：`🔍 Closure-First 探针（Task N） Probe #1：✅/❌ <结果> Probe #2：✅/❌ <结果> Verify #1：✅/❌ <结果> → 探针通过/失败`

**失败处理**：Probe #1 失败 → 检查 Plan 是否过时；Probe #2 失败 → 扩大搜索或 NEEDS_CONTEXT；Verify #1 失败 → 先修复现有问题。

**轻量路径例外**：跳过探针。

---

## 3.5 Final Validation

所有任务完成后执行全量验证：

1. 读取 `.forge/config.md` 的 `ci_check_command` 字段。
2. **非空** → 原样执行该命令（禁止替换、省略或拆分）。
3. **为空/缺失** → 按 `verify_commands` 列表执行；若也为空，回退到 AI 自动检测。
4. 使用 P5 证据链格式报告：`[Command] → [Output] → [Claim]`。

---

## 4. TDD 铁律

→ 遵循 CLAUDE.md §2.1 TDD 强制（RED → GREEN → REFACTOR 不可跳过）

**Build 阶段补充**：

- **Subagent 内 TDD**：每个 Subagent 独立执行完整 TDD 循环。代码先于测试 → 删除代码，从测试重新开始。不保留、不参考、不看已删代码。
- **每步都要运行**：RED 确认失败、GREEN 确认通过、REFACTOR 确认无回归。RED 阶段测试就通过了 = 测试写错了。
- **测试在迁就代码 ≠ 代码在满足需求**。先写代码再补测试就是前者。

---

## 5. 失败处理

### 5.1 连续失败升级

→ 遵循 CLAUDE.md §2.4 三次换路

**升级行为**：连续失败 3 次后切换到 `debugger` agent 进行根因分析（`Agent(prompt="<失败上下文>", subagent_type="general-purpose", permissionMode="acceptEdits", maxTurns=15)`）。debugger 专注：(1) 完整读取错误信息 (2) 一次一个假设 (3) 最小改动修复 (4) 再失败 3 次则报告用户。

**升级输出**：`🚫 连续失败 3 次 → 切换 debugger agent。尝试 1/2/3：<原因>`

### 5.2 测试失败处理

GREEN 阶段测试仍失败：(1) 检查测试本身是否有 bug (2) 检查实现是否遗漏条件 (3) 测试问题 → 修正后重走 RED→GREEN (4) 实现问题 → 修正后重跑。

---

## 6. 执行纪律

以下纪律是 build 阶段硬性约束：

### 6.0 反漂移执行护栏

| 禁止行为 | 说明 |
|---------|------|
| 优化代理信号而放弃冻结目标 | 不得为覆盖率数字写无意义测试，忽略 Spec 核心场景 |
| 将验证材料吸收为产品真理 | 不得将测试示例数据硬编码为产品逻辑 |
| 将有限修复重新标记为通用完成 | 不得只修一个边界条件就声称"全部完成" |
| 静默降级 | 主路径失败时不得悄悄切换降级方案而不告知用户 |
| 伪成功 | 不得吞掉错误、输出模板化通过结果、或假装成功 |
| 修改冻结文件 | 不得在 build 阶段修改 locked Spec 或 approved Plan |

如果 Spec 有反漂移声明（主目标/非目标代理信号/验证材料角色），以主目标为唯一判定标准。

**状态文件保护**：遵守 `.forge/config.md` 保护分区——🔒冻结区不可改、🛡️受保护区只可追加、🟢开放区可自由修改。违反则立即阻断并报告。

### 6.1 先测试后代码

→ 遵循 CLAUDE.md §2.1 TDD 强制

### 6.2 原子提交

每个任务一个 commit，使用 Plan 定义的 commit message。不混多任务变更。

### 6.3 验证后才能声明完成

→ 遵循 CLAUDE.md §2.3 验证铁律

**P5 证据链**：`[Command] → [Output] → [Claim]`。禁止跳过任何一环。

**验证门函数**：识别 → 运行 → 阅读 → 验证 → 然后标记完成。跳过任何一步 = 在撒谎。

**唯一接受的完成证据**：验证命令的实际输出。不接受"应该可以了"、"看起来没问题"、"Subagent 说完成了"。

### 6.4 三次换路

→ 遵循 CLAUDE.md §2.4 三次换路

### 6.5 输出简洁性

→ 遵循 CLAUDE.md §2.6 输出简洁性

本 SKILL 定义的所有结构化输出（TDD 标记、探针结果、Restatement 摘要、P5 证据链、进度更新）不受简洁性约束影响。

---

## 7. 状态更新

### 7.1 Progress 更新

每个任务完成后更新 `.forge/progress/<topic>.md`，标记已完成/进行中/阻塞任务。

### 7.2 中间会话日志

每次 Restatement Checkpoint 同步更新 `.forge/knowledge/sessions/<date>-<topic>-interim.md`（≤15 行，包含进度快照、关键发现、活跃约束、异常记录）。每次覆盖同一文件（不累积）。`/forge learn` 或 build 全部完成后删除。`/forge resume` 优先读取此文件恢复上下文。

### 7.3 Phase 更新

每个命令完成后更新 `.forge/status.md` 的 `phase` 字段为序列中下一个命令。

### 7.4 验证命令健康度追踪

Build 阶段记录每个验证命令的执行结果到 `.forge/knowledge/tool-health.md`。

**健康度判定**：≥80% → 🟢 健康；50%-79% → 🟡 退化（在下次 plan 知识回流中注入警告）；<50% → 🔴 不健康（建议替代命令或先修环境）。

**反循环保护**：同一命令的同一失败原因只记录一次。

### Phase 转换表

| 当前命令完成 | phase 更新为 |
|-------------|-------------|
| `/forge plan` | `build` |
| `/forge build` | `review` |
| `/forge review` | `test`（标准/全量）或 `completed`（轻量） |
| `/forge test` | `ship` |
| `/forge ship` | `learn`（全量）或 `completed`（标准） |
| `/forge learn` | `completed` |

---

## 8. 执行流程

1. **路径判定**：轻量（≤1 文件，≤20 行）/ 标准（有 Spec） / 全量（新服务/数据库/认证/需求模糊）
2. **前置门禁检查**（标准/全量）：Spec 锁定 + Plan 批准 + 目录完整 + 分支正确
3. **初始化 Restatement 计数器**（标准/全量）：设为 N（默认 3）
4. **循环**：Closure-First 探针 → Subagent TDD → 检查状态 → 更新 progress → 原子提交 → 计数器 -1
5. **全量路径额外**：阶段一并行研究 → 阶段二分模块实现
6. **Final Validation**：ci_check_command 或 verify_commands
7. **删除 interim 日志**
8. → `/forge review`

**失败升级**：同一修复连续失败 3 次 → 计数器 +1 → 达到 3 → 停止 → 进入 `/forge debug`

---

## 9. 边界情况处理

| 场景 | 处理方式 |
|------|---------|
| Spec 未锁定 | 使用 §2 拒绝输出格式，路由到 `/forge spec` |
| Plan 未批准 | 使用 §2 拒绝输出格式，路由到 `/forge plan` |
| Spec + Plan 都未就绪 | §2 多项检查不通过格式，逐条列出 |
| Subagent 执行超时 | 终止 Subagent → progress 标记阻塞 → 提示 `/forge resume` |
| Git Worktree 合并冲突 | 暂停合并 → 列出冲突文件 → 等待手动解决 |
| 无 `.forge/` 目录 | §2 拒绝输出格式，路由到 `forge init` |

---

## 10. 示例

**标准路径执行**：

```
$ /forge build

🔍 前置检查...
✅ Spec 已锁定 / Plan 已批准

📋 开始执行计划（5 个任务）

━━━ Task 1/5：创建通知服务核心接口 ━━━
🔴 RED — 写失败的测试 → FAIL ✓（预期失败）
🟢 GREEN — 写最少代码让测试通过 → PASS ✓
🔵 REFACTOR — 重构 → PASS ✓（无回归）
✅ Task 1 完成 → 提交 → 进度：1/5
```

---

## 已知 AI 失败模式

| # | 失败模式 | 错误行为 | 正确做法 |
|---|---------|---------|---------|
| 1 | TDD RED 阶段写实现 | "顺手"把实现也写了 | RED 只写测试，已写实现则删除重来 |
| 2 | 跳过测试标记完成 | 没运行测试就说"任务完成" | 执行验证门函数，P5 证据链声明完成 |
| 3 | 多任务混在一个 commit | 把两三个任务变更合为一个提交 | 一个任务一个 commit，用 Plan 定义的 message |
| 4 | 不读 plan 就写代码 | 凭记忆直接开始写代码 | Build 开始时完整读取 Plan，每个任务前重读描述 |
| 5 | 顺手改范围外代码 | 看到"不太好"的代码就顺手改了 | 只改 Plan 指定范围，范围外问题记录到 findings |
| 6 | 逐步解说代码编辑 | 每个操作前输出预告和解释 | 沉默执行，仅在 Decision_Point 输出简要说明 |
| 7 | 自行拼凑验证命令 | 不用 ci_check_command 而自己拼部分命令 | 原样执行 config.md 的 ci_check_command，不替换省略 |

---

## 上下文预算管理

### 分类与裁剪策略

| 信息源 | 生命周期 | 裁剪策略 |
|--------|---------|---------|
| Explore Agent 结果 | Ephemeral | Explore_Summarizer：结构化摘要（入口点+依赖链+测试+接口），≤300 tokens |
| Subagent 执行结果 | Ephemeral | Subagent_Summary_Protocol：提取状态/任务/变更/测试/commit/自检，≤200 tokens |
| 测试运行输出 | Ephemeral | 全通过单行摘要（≤150 tokens），有失败仅保留失败详情 |
| Git Diff/Status | Ephemeral | diff >50 行文件级摘要，status >30 文件分类摘要 |
| Plan 任务列表 | Persistent | 保留在 context，Restatement 时刷新 |
| 当前任务描述 | Persistent | 保留在 context，Restatement 时刷新 |
| TDD 循环输出 | Phase-scoped | 当前阶段保留，Restatement 时摘要替代 |
| Progress 更新 | Write-and-discard | 写入后只保留确认信息 |

### 裁剪执行时机

1. Explore Agent 返回后 → 立即转换为摘要
2. Subagent 返回后 → 立即提取摘要，丢弃执行日志
3. 测试运行后 → 立即应用 Test_Output_Trimmer
4. Git 操作后 → 超阈值时立即应用 Git_Output_Limiter
5. Write-and-discard 后 → 用确认信息替代全量内容

---

## 反射触发器

以下情境是**推理触发器**——遇到时停下来问自己一个问题，根据答案决定下一步。不机械执行阈值判断，结合上下文做判断。

| 触发情境 | 问自己 | interactive 处理 | autonomous 处理 |
|---------|--------|-----------------|----------------|
| 往已经很长的文件追加代码 | 文件是否在承担太多职责？新代码与核心职责一致吗？ | 向用户说明文件职责范围，询问是否拆分 | 记录到 findings（路径+职责+拆分建议），继续执行 |
| 给方法很多的类加方法 | 这个类是否变成上帝类？新方法和核心抽象一致吗？ | 展示方法列表和新方法用途，询问是否提取 | 记录到 findings（类名+方法概要+提取建议），继续 |
| 加 `if (特殊情况)` 分支 | 这在处理合法业务规则，还是给设计缺陷打补丁？ | 说明分支原因，询问是否用策略/多态替代 | 记录到 findings（位置+情况+替代方案），继续 |
| copy-paste 代码 | 背后是否有可抽取的共同抽象？修改需要改几处？ | 展示重复代码，询问是否提取共享函数 | 记录到 findings（位置+内容+抽取建议），继续 |
| 给函数加第 4+ 个参数 | 参数是否可归组？函数是否承担太多职责？ | 展示签名和新参数，询问是否引入参数对象 | 记录到 findings（签名+用途+归组建议），继续 |
| 新写万能工具类 | 函数间有内聚性吗？是否应分散到领域模块？ | 说明函数列表，询问是否按领域分散 | 记录到 findings（类名+函数+归属建议），继续 |

**关键原则**：反射触发器触发**思考**，不触发**行动**。autonomous 模式下不自行拆分——记录观察，继续执行。
