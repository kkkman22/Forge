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

在标准路径和全量路径下，build 启动前**必须通过两道门禁**：

| 门禁 | 检查内容 | 阻断条件 |
|------|---------|---------|
| **Spec 门禁** | `.forge/specs/` 中是否有锁定的规格 | `status` 不是 `"locked"`（标准路径无 Spec 时豁免，见下方） |
| **Plan 门禁** | `.forge/plans/` 中是否有批准的计划 | `status` 不是 `"approved"` |

**检查逻辑**：

1. 扫描 `.forge/specs/` 下所有 `spec.md` 文件，读取 YAML frontmatter。
2. 扫描 `.forge/plans/` 下所有 `.md` 文件，读取 YAML frontmatter。
3. 检查与当前任务相关的 spec 和 plan 的 `status` 字段。

**Spec 门禁豁免**：如果 Plan 文档中标注了 `spec_ref: "none（基于用户需求描述）"`，说明标准路径下用户选择了无 Spec 模式，Spec 门禁自动豁免，仅检查 Plan 门禁。

**两道门禁必须同时通过**（豁免情况除外）。任一不通过，阻断 build 并输出具体原因：

```
🚫 Build 阻断

❌ Spec 未锁定：当前状态为 "draft"，需要先运行 /forge spec 完成锁定
❌ Plan 未批准：当前状态为 "draft"，需要先运行 /forge plan 获得批准

请按提示完成前置步骤后重新运行 /forge build。
```

**轻量路径例外**：轻量路径不要求锁定的 Spec 和批准的 Plan，直接执行 build。

---

## 3. 三条执行路径

### 3.1 轻量路径（Light）

适用于影响文件 ≤ 1 且改动 ≤ 20 行的小任务。

**流程**：

1. 直接修改代码，不启动 Subagent。
2. **每两步暂停确认**——修改两个位置后暂停，向用户展示变更内容，等待确认后继续。
3. 修改完成后运行验证命令。
4. 提交变更。

**暂停确认格式**：

```
📝 已完成 2 步修改：

1. `src/utils/format.ts` 第 42 行：修复日期格式化逻辑
2. `src/utils/format.ts` 第 58 行：更新相关的类型定义

继续？(y/n)
```

**无门禁要求**：轻量路径跳过 Spec 和 Plan 门禁检查。

### 3.2 标准路径（Standard）

适用于有明确需求或现成 Spec 的中等任务。

**流程**：

1. 读取 `.forge/plans/<topic>.md` 中的任务列表。
2. 对每个原子任务，先执行 **Closure-First 探针**（2 Probe + 1 Verify），再启动 TDD 循环。
3. 对每个原子任务，启动一个 **Subagent** 执行 TDD 循环：
   - **RED**：写失败的测试，运行确认失败。
   - **GREEN**：写最少代码让测试通过，运行确认通过。
   - **REFACTOR**：重构代码，运行确认测试仍然通过。
3. 每个任务完成后：
   - 更新 `.forge/progress/<topic>.md`（标记任务完成、记录时间）。
   - 执行原子提交（使用 plan 中定义的 commit message）。
4. 所有任务完成后，运行全量测试确认无回归。

**Subagent 隔离的意义**：每个 Subagent 拥有新鲜上下文，不会被之前任务的残留信息干扰。任务之间的依赖通过文件系统（代码变更）传递，而非上下文传递。

**Subagent 状态处理协议**：

每个 Subagent 完成后报告以下四种状态之一，主 Agent 按协议处理：

| 状态 | 含义 | 处理方式 |
|------|------|---------|
| **DONE** | 任务完成，测试通过 | 进入评审步骤，然后标记完成 |
| **DONE_WITH_CONCERNS** | 任务完成但有疑虑 | 阅读疑虑内容。如果涉及正确性或范围 → 先解决再评审。如果是观察性建议 → 记录到 findings，继续评审 |
| **NEEDS_CONTEXT** | 缺少必要信息 | 提供缺失的上下文，重新派发同一任务 |
| **BLOCKED** | 无法完成 | 评估阻塞原因：1) 上下文不足 → 补充上下文重新派发；2) 任务过大 → 拆分为更小的子任务；3) Plan 本身有问题 → 向用户报告 |

**绝不**忽略 Subagent 的升级请求。如果 Subagent 说它被阻塞了，一定有什么需要改变。

**Subagent 指令构造**：

为每个 Subagent 构造精确的指令，包含：

1. **Closure-First 探针结果**：探针阶段收集的上下文（仓库结构、相关代码位置）
2. **任务描述**：从 Plan 中提取的完整任务文本
3. **文件上下文**：任务涉及的现有文件内容
4. **知识回流**：从 `instincts.md` 和 `known-failures.md` 匹配的相关模式（见 `/forge learn` §6.2）
5. **TDD 要求**：明确的 RED → GREEN → REFACTOR 步骤
6. **验证命令**：任务完成后必须运行的命令
7. **完成前自检**：TDD 完成后、报告状态前，执行轻量自检（见下方）
8. **禁止事项**：不要修改任务范围外的文件，不要跳过测试

**Subagent 调用方式**：

使用 Agent tool 调用 Subagent，利用 `skills` 预加载注入领域知识：

```
Agent(
  prompt="<构造的指令>",
  skills=["forge-test"],
  permissionMode="acceptEdits",
  maxTurns=20
)
```

预加载 `forge-test` skill 让 Subagent 自动拥有测试引擎的完整知识（7 项完成前验证清单、验证铁律），无需在 prompt 中重复描述 TDD 规则。

**Subagent 完成前自检（轻量评审）**：

每个 Subagent 在 TDD 循环完成后、报告状态前，**必须执行以下自检**：

| 自检项 | 检查内容 | 不通过时的处理 |
|--------|---------|--------------|
| **Spec 场景对照** | 当前任务对应的 Spec 场景是否都有测试覆盖 | 补充缺失的测试，重新走 RED→GREEN |
| **安全快扫** | 是否有硬编码密钥、未参数化的 SQL、缺失的鉴权检查 | 立即修复，不等到 `/forge review` |
| **范围检查** | 是否修改了任务范围外的文件 | 撤销范围外的修改 |

**自检输出格式**（附在 Subagent 状态报告中）：

```
📋 任务自检
✅ Spec 场景：S1、S2 均有测试覆盖
✅ 安全快扫：无硬编码密钥、无注入风险
✅ 范围检查：仅修改了 plan 中指定的文件

状态：DONE
```

**为什么不做完整的两阶段评审？** 完整评审（spec compliance + code quality 两轮独立 Subagent）每个任务增加 2 次 Subagent 调用，5 个任务就是 10 次额外调用，token 和时间成本过高。轻量自检在 Subagent 内部完成，零额外调用，能拦截 80% 的明显问题（缺失测试、安全漏洞、范围溢出）。剩余的深度评审由 `/forge review` 阶段的 Agent Team 统一处理。

### 3.3 全量路径（Full）

适用于涉及新服务、新数据库、认证体系变更或需求模糊的复杂任务。

**阶段一：并行研究（Agent Team）**

1. 以 Agent Team 模式启动多个研究者，并行调查：
   - 现有代码架构和依赖关系
   - 相关的第三方库和 API
   - 潜在的技术风险和兼容性问题
2. 研究发现汇总到 `.forge/findings/<topic>.md`。
3. 研究者之间共享发现、相互补充。

**阶段二：分模块实现（Subagent）**

1. 基于研究发现和 Plan，将任务按模块分组。
2. 对每个模块启动一个 Subagent 执行 TDD 循环。
3. **可选 Git Worktree**：当模块改动存在重叠时，为每个模块创建独立的 Git Worktree，实现文件系统级隔离。
4. 模块完成后合并 Worktree，解决冲突。

**Git Worktree 使用条件**：

- 两个或以上模块修改同一文件 → 使用 Worktree
- 模块之间无文件重叠 → 不需要 Worktree，直接在主分支执行

---

## 3.4 Closure-First 探针（2 Probe + 1 Verify）

每个原子任务在进入 TDD 循环之前，**必须先执行 Closure-First 探针**。这个机制借鉴自 Vibe-Skills 的反死寂设计——避免 AI 在错误假设上浪费大量 token。

**探针执行方式**：对于标准路径和全量路径，探针可以通过 `explore` agent 执行，利用其只读搜索能力快速验证代码库状态。调用方式：`Agent(prompt="<探针指令>", skills=[], permissionMode="default", maxTurns=5)`，使用 `explore` agent 类型。

**探针合约**：在每个任务的前 3 个动作中完成：

| 步骤 | 动作 | 目的 | 示例 |
|------|------|------|------|
| **Probe #1（快速扫描）** | 检查任务涉及的文件和目录是否存在 | 确认仓库结构与 Plan 假设一致 | `ls src/services/` 或检查目标文件是否存在 |
| **Probe #2（定向搜索）** | 搜索任务相关的关键词、函数名、接口名 | 定位实际的代码入口点和依赖关系 | 搜索 `export.*Handler`、`interface.*Service` |
| **Verify #1（最小验证）** | 运行最窄范围的验证命令 | 确认当前代码库状态是健康的 | `npx vitest run --grep "相关模块"` 或 `npx tsc --noEmit` |

**探针输出格式**：

```
🔍 Closure-First 探针（Task 3：添加导出 API 路由）

Probe #1：✅ src/routes/ 目录存在，已有 users.ts、orders.ts
Probe #2：✅ 找到 exportService（src/services/export.ts:15），找到路由注册模式（src/routes/index.ts:8）
Verify #1：✅ 现有测试全部通过（38/38）

探针通过，进入 TDD 循环。
```

**探针失败时的处理**：

- Probe #1 失败（文件/目录不存在）→ 检查 Plan 是否过时，向用户报告差异
- Probe #2 失败（找不到相关代码）→ 扩大搜索范围，如果仍然找不到，标记 NEEDS_CONTEXT
- Verify #1 失败（现有测试不通过）→ 先修复现有问题再开始新任务，避免在不稳定基础上构建

**轻量路径例外**：轻量路径的改动足够小，跳过 Closure-First 探针。

---

## 4. TDD 铁律

**RED → GREEN → REFACTOR**，这是不可协商的执行顺序。

**违反这条规则的字面意思就是违反这条规则的精神。**

### 4.1 正确顺序

```
1. RED    — 写一个失败的测试，运行确认它确实失败
2. GREEN  — 写最少的代码让测试通过，运行确认通过
3. REFACTOR — 重构代码（改善结构，不改变行为），运行确认测试仍然通过
```

**什么时候用 TDD？永远。** 新功能、Bug 修复、重构、行为变更——全部。

想着"就这一次跳过 TDD"？停下来。这是合理化。

### 4.2 违规处理

**如果代码先于测试编写**：

```
🚫 TDD 违规：检测到代码先于测试编写

已写的代码将被删除。请从测试开始：
1. 先写一个描述预期行为的测试
2. 运行测试，确认它失败（RED）
3. 然后写最少的代码让测试通过（GREEN）
```

这不是建议，是强制执行。**删除意味着删除**：

- 不要保留已写的代码作为"参考"
- 不要在写测试时"参考"已删除的代码
- 不要看它
- 从测试开始，重新实现。句号。

先写代码再补测试 = 测试在迁就代码，而不是代码在满足需求。

### 4.3 每步都要运行

- RED 阶段：运行测试，确认失败。不运行 = 不知道测试是否真的在测试你想测的东西。
- GREEN 阶段：运行测试，确认通过。不运行 = 不知道代码是否真的解决了问题。
- REFACTOR 阶段：运行测试，确认仍然通过。不运行 = 不知道重构是否引入了回归。

**如果测试在 RED 阶段就通过了**——测试写错了。修正测试，确保它因为正确的原因失败，然后再继续。

### 4.4 Good/Bad 示例

**Good — 测试描述行为，名称清晰，测一件事**：

```typescript
test('retries failed operations 3 times before giving up', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };
  const result = await retryOperation(operation);
  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```

**Bad — 名称模糊，mock 过重，测试实现而非行为**：

```typescript
test('retry works', async () => {
  const mock = jest.fn()
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce('ok');
  await retry(mock);
  expect(mock).toHaveBeenCalledTimes(2); // 测试调用次数，不是行为
});
```

### 4.5 TDD 反合理化

| 借口 | 现实 |
|------|------|
| "这个太简单了不需要测试" | 简单的东西测试也简单，写一个 |
| "我先写代码理清思路再补测试" | 删掉代码，从测试开始理清思路 |
| "这是私有方法，不需要测试" | 通过公共接口测试它的行为 |
| "时间不够了" | 不写测试的返工时间更长 |
| "这只是原型" | 原型也需要验证假设，测试就是验证 |
| "测试框架还没配好" | 先配好测试框架，这是前置条件 |

---

## 5. 失败处理

### 5.1 连续失败升级

**同一修复连续失败 3 次 → 停止当前任务，切换到 debugger agent**。

计数规则：

- 每次修复尝试失败，计数器 +1。
- 修复成功，计数器归零。
- 计数器达到 3，触发升级。

**升级行为**：

当连续失败 3 次时，不再用通用 Subagent 继续尝试，而是切换到专门的 `debugger` agent 进行根因分析：

```
Agent(
  prompt="<失败上下文：3 次尝试的失败原因 + 相关代码位置 + 错误信息>",
  skills=["forge-test"],
  permissionMode="acceptEdits",
  maxTurns=15
)
```

使用 `debugger` agent 类型。debugger agent 专注于：
1. 完整读取错误信息（不只是第一行）
2. 一次只测一个假设
3. 用最小改动修复
4. 如果 debugger 也失败（再 3 次），向用户报告并建议手动介入

**升级输出**：

```
🚫 连续失败 3 次：同一修复已尝试 3 次仍未成功

切换到 debugger agent 进行根因分析。

失败记录：
  尝试 1：<失败原因>
  尝试 2：<失败原因>
  尝试 3：<失败原因>

🔍 Debugger 正在分析根因...
```

**为什么是 3 次？** 第一次失败可能是笔误，第二次可能是遗漏，第三次说明你的方向可能就是错的。继续在错误方向上努力只会浪费时间。切换到 debugger agent 用不同的思路分析问题。

### 5.2 测试失败处理

当测试在 GREEN 阶段仍然失败：

1. 检查测试本身是否正确（测试可能有 bug）。
2. 检查实现是否遗漏了某个条件。
3. 如果是测试问题，修正测试后重新走 RED → GREEN。
4. 如果是实现问题，修正实现后重新运行测试。

---

## 6. 执行纪律

以下五条纪律是 build 阶段的硬性约束，不可违反：

### 6.0 反漂移执行护栏

在执行过程中，以下行为被明确禁止：

| 禁止行为 | 说明 |
|---------|------|
| **优化代理信号而放弃冻结目标** | 不得为了提高测试覆盖率数字而写无意义的测试，忽略 Spec 中的核心场景 |
| **将验证材料吸收为产品真理** | 不得将测试用例中的示例数据、mock 值硬编码为产品逻辑 |
| **将有限修复重新标记为通用完成** | 不得在只修复了一个边界条件时声称"全部完成" |
| **静默降级** | 不得在主路径失败时悄悄切换到降级方案而不告知用户 |
| **伪成功** | 不得吞掉错误、输出模板化的通过结果、或在主路径失败时假装成功 |
| **修改冻结文件** | 不得在 build 阶段修改已锁定的 Spec 或已批准的 Plan（见 `.forge/config.md` 保护分区） |

如果 Spec 中有反漂移声明（主目标 / 非目标代理信号 / 验证材料角色），执行过程中必须以主目标为唯一判定标准，不得偏向非目标代理信号。

**状态文件保护**：Build 阶段必须遵守 `.forge/config.md` 中定义的文件保护分区：
- 🔒 冻结区文件（locked spec、approved plan、config.md）不可修改
- 🛡️ 受保护区文件（progress、reviews、knowledge）只可追加
- 🟢 开放区文件（status、decisions、findings、debug）可自由修改

违反保护分区的操作应被立即阻断并报告给用户。

### 6.1 先测试后代码

每个功能点必须先有失败的测试，再有让测试通过的代码。没有例外。

### 6.2 原子提交

每个完成的任务对应一个原子提交。提交信息使用 Plan 中定义的 commit message。不要把多个任务的变更混在一个提交里。

### 6.3 验证后才能声明完成

任务完成的标准是**验证命令运行通过**，不是"我觉得写完了"。

**P5 证据链格式**（每次声明完成前必须使用）：

所有完成声明必须遵循 `[Command] → [Output] → [Claim]` 格式。禁止跳过任何一环。

```
[Command] npx vitest run --grep "NotificationService"
[Output]  ✓ 12 tests passed (0 failed, 0 skipped)
[Claim]   NotificationService 所有测试通过，Task 1 完成
```

**验证门函数**（每次声明完成前必须执行）：

```
1. 识别：什么命令能证明这个任务完成了？
2. 运行：执行完整命令（新鲜的、完整的）
3. 阅读：完整输出，检查退出码，计数失败项
4. 验证：输出是否确认了完成？
   - 如果否：陈述实际状态和证据
   - 如果是：带着证据声明完成
5. 然后才能：标记任务完成

跳过任何一步 = 在撒谎，不是在验证
```

**禁止的声明**：

| 声明 | 问题 |
|------|------|
| "应该可以了" | 你运行了吗？ |
| "看起来没问题" | 测试通过了吗？ |
| "和之前一样的逻辑" | 你验证了吗？ |
| "Subagent 说完成了" | 你独立验证了吗？ |
| "Lint 通过了所以没问题" | Lint ≠ 测试 ≠ 构建 |

**唯一接受的完成证据**：验证命令的实际输出。

### 6.4 不要说"应该可以"

这条单独列出来是因为它太常见了。"应该可以"是最危险的四个字——它意味着你没有验证，但你假装验证了。

如果你不确定，运行测试。如果测试通过，你就确定了。如果测试失败，你就知道哪里有问题。

### 6.5 三次换路（Three-Strikes Rule）

同一个问题用同一种方法修了 3 次还没修好？换一种方法。

- 第 1 次失败：可能是细节问题，继续尝试。
- 第 2 次失败：仔细检查，可能遗漏了什么。
- 第 3 次失败：**停下来**。你的方向可能是错的。进入 `/forge debug` 做结构化分析。

---

## 7. 状态更新

### 7.1 Progress 更新

每个任务完成后，更新 `.forge/progress/<topic>.md`：

```markdown
---
topic: "<主题>"
plan_ref: ".forge/plans/<topic>.md"
updated: "YYYY-MM-DD HH:mm"
---

## 已完成

- [x] Task 1：创建通知服务核心接口（3 min）— 2025-01-15 14:30
- [x] Task 2：实现异步导出判定（3 min）— 2025-01-15 14:35

## 进行中

- [ ] Task 3：添加导出 API 路由（4 min）

## 阻塞

（无）
```

### 7.2 Phase 更新

**每个命令完成后**，更新 `.forge/status.md` 的 `phase` 字段为命令序列中的下一个命令。这确保 `/forge status` 和 `/forge resume` 能准确反映当前阶段。

### 7.3 验证命令健康度追踪

每个任务的 TDD 循环和 Closure-First 探针中都会运行验证命令（如 `npx vitest run`、`npx tsc --noEmit`、`npm run lint`）。Build 阶段**必须记录每个验证命令的执行结果**到 `.forge/knowledge/tool-health.md`。

**记录格式**：

```markdown
---
updated: "YYYY-MM-DD"
---

## 验证命令记录

### npx vitest run

- 总执行：15
- 成功：13
- 失败：2
- 成功率：87%
- 最近失败原因：模块导入路径错误（2025-01-15）
- 状态：🟢 健康

### npx tsc --noEmit

- 总执行：10
- 成功：10
- 失败：0
- 成功率：100%
- 状态：🟢 健康
```

**健康度判定**：

| 成功率 | 状态 | 处理 |
|--------|------|------|
| ≥ 80% | 🟢 健康 | 正常使用 |
| 50%-79% | 🟡 退化 | 在下次 `/forge plan` 的知识回流中注入警告 |
| < 50% | 🔴 不健康 | 在下次 `/forge plan` 中建议替代命令或先修复环境 |

**退化警告注入**：当某个验证命令处于 🟡 退化或 🔴 不健康状态时，`/forge plan` 的 Research 阶段自动注入警告：

```markdown
## Research Findings

### 来自工具健康度

⚠️ `npx vitest run` 近期成功率仅 60%（🟡 退化）
  最近失败原因：模块导入路径错误
  建议：在 Plan 中为涉及测试的任务预留额外时间，或先修复测试环境
```

**反循环保护**：同一个命令的同一个失败原因只记录一次（按 `命令 + 失败原因摘要` 去重），避免重复计数。

| 当前命令完成 | phase 更新为 | 说明 |
|-------------|-------------|------|
| `/forge decide` | `spec` | 全量路径：决策完成，进入规格 |
| `/forge spec` | `plan` | 全量路径：规格锁定，进入规划 |
| `/forge plan` | `build` | 标准/全量：计划批准，进入执行 |
| `/forge build` | `review` | 所有路径：执行完成，进入评审 |
| `/forge review` | `test`（标准/全量）或 `completed`（轻量） | 轻量路径无 test 阶段 |
| `/forge test` | `ship` | 标准/全量：验证通过，进入交付 |
| `/forge ship` | `learn`（全量）或 `completed`（标准） | 标准路径无 learn 阶段 |
| `/forge learn` | `completed` | 全量路径：知识沉淀完成 |

**更新格式**：

```yaml
---
current_task: "<不变>"
tier: "<不变>"
phase: "<下一个命令>"
updated: "YYYY-MM-DD HH:mm"
---
```

---

## 8. 执行流程

### 完整流程图

```
用户输入 /forge build
        │
        ▼
  ┌─────────────┐
  │  路径判定    │  轻量 / 标准 / 全量？
  └──────┬──────┘
         │
    ┌────┼────────────┐
    │    │             │
    ▼    ▼             ▼
  轻量  标准          全量
    │    │             │
    │    ▼             ▼
    │  ┌──────┐   ┌──────────┐
    │  │门禁   │   │  门禁     │
    │  │检查   │   │  检查     │
    │  └──┬───┘   └────┬─────┘
    │     │ 通过       │ 通过
    │     ▼            ▼
    │  ┌──────┐   ┌──────────┐
    │  │Subagt│   │阶段一     │
    │  │逐任务│   │Agent Team │
    │  │TDD   │   │并行研究   │
    │  └──┬───┘   └────┬─────┘
    │     │            ▼
    │     │       ┌──────────┐
    │     │       │阶段二     │
    │     │       │Subagent   │
    │     │       │分模块实现  │
    │     │       └────┬─────┘
    │     │            │
    ▼     ▼            ▼
  ┌─────────────────────┐
  │  更新 progress       │
  │  原子提交            │
  │  全量测试            │
  └──────────┬──────────┘
             │
             ▼
        下一步：/forge review
```

### 失败升级流程

```
  修复尝试
     │
     ▼
  ┌──────┐    成功
  │ 结果？├──────────→ 计数器归零，继续
  └──┬───┘
     │ 失败
     ▼
  计数器 +1
     │
     ▼
  ┌──────────┐
  │ 计数 ≥ 3？│
  └──┬───┬───┘
     │   │
  否 │   │ 是
     ▼   ▼
  继续  🚫 停止
  尝试  进入 /forge debug
```

---

## 9. 边界情况处理

### 9.1 Spec 未锁定

```
🚫 Build 阻断：规格未锁定

当前任务的规格状态为 "draft"，需要先锁定规格才能开始 build。
请运行 /forge spec 完成规格的 Review 和 Lock 流程。

规格路径：.forge/specs/<feature>/spec.md
当前状态：draft
```

### 9.2 Plan 未批准

```
🚫 Build 阻断：计划未批准

当前任务的计划状态为 "draft"，需要先获得批准才能开始 build。
请运行 /forge plan 完成计划的审阅和批准流程。

计划路径：.forge/plans/<topic>.md
当前状态：draft
```

### 9.3 Spec 和 Plan 都未就绪

```
🚫 Build 阻断

❌ Spec 未锁定：当前状态为 "draft"，需要先运行 /forge spec 完成锁定
❌ Plan 未批准：当前状态为 "draft"，需要先运行 /forge plan 获得批准

请按提示完成前置步骤后重新运行 /forge build。
```

### 9.4 Subagent 执行超时

如果 Subagent 在执行某个任务时超时：

1. 终止该 Subagent。
2. 将当前任务状态记录到 progress（标记为"阻塞"）。
3. 提示用户可以通过 `/forge resume` 恢复。

### 9.5 Git Worktree 合并冲突

如果全量路径的 Worktree 合并出现冲突：

1. 暂停合并。
2. 列出冲突文件。
3. 等待开发者手动解决冲突后继续。

### 9.6 无 `.forge/` 目录

```
⚠️ 未检测到 .forge/ 目录。请先运行 forge init 初始化项目。
```

---

## 10. 示例

### 示例 1：标准路径执行

```
$ /forge build

🔍 前置检查...
✅ Spec 已锁定：.forge/specs/user-notification/spec.md
✅ Plan 已批准：.forge/plans/user-notification.md

📋 开始执行计划（5 个任务）

━━━ Task 1/5：创建通知服务核心接口（3 min）━━━

🔴 RED — 写失败的测试
  文件：src/services/notification.test.ts
  运行：npx vitest run --grep "NotificationService"
  结果：FAIL ✓（预期失败）

🟢 GREEN — 写最少代码让测试通过
  文件：src/services/notification.ts
  运行：npx vitest run --grep "NotificationService"
  结果：PASS ✓

🔵 REFACTOR — 重构
  提取接口到 src/types/notification.ts
  运行：npx vitest run
  结果：PASS ✓（无回归）

✅ Task 1 完成
  提交：feat(notification): add core service interface
  进度：1/5

━━━ Task 2/5：实现异步导出判定（3 min）━━━
...
```

### 示例 2：连续失败升级

```
━━━ Task 3/5：添加导出 API 路由（4 min）━━━

🔴 RED — 写失败的测试
  结果：FAIL ✓（预期失败）

🟢 GREEN — 尝试 1
  结果：FAIL ✗（测试仍然失败）
  原因：路由未正确注册

🟢 GREEN — 尝试 2
  结果：FAIL ✗（测试仍然失败）
  原因：中间件顺序错误

🟢 GREEN — 尝试 3
  结果：FAIL ✗（测试仍然失败）
  原因：请求体解析失败

🚫 连续失败 3 次：同一修复已尝试 3 次仍未成功

停止当前任务，进入调试模式。
运行 /forge debug 进行结构化根因分析。
```
