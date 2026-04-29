---
title: Dogfooding 观察记录
created: 2026-04-29
source: 首次使用 /forge 标准路径开发 structured-observability 功能
---

# Dogfooding 观察记录

## 发现 1：AI 在 build 阶段输出过于冗长

**日期**：2026-04-29
**阶段**：/forge build（标准路径）
**严重程度**：体验问题（非功能缺陷）

**现象**：AI 在执行代码修改时，每一步编辑都会输出解释性文字（如"现在添加 --log-format 和 --log-level 的验证"、"现在将 logSinkConfig 传入 SdkDriverConfig"），导致输出非常冗长。

**根因**：这是 Claude Code 的默认行为，不是 Forge SKILL 指示的。Forge 的 build SKILL 定义了流程步骤，但没有约束 AI 的输出风格。

**建议修复**：
- 在模板 `CLAUDE.md` 中添加输出风格约束，如："执行代码修改时保持简洁，不要逐步解释每个编辑操作。只在关键决策点说明理由。"
- 或在 `forge-build/SKILL.md` 中添加类似指令

## 发现 2：hooks/hooks.json 模板中 Bash matcher 引号解析问题

**日期**：2026-04-29
**阶段**：/forge build 启动时
**严重程度**：功能缺陷（已修复）

**现象**：PreToolUse Bash matcher 的 grep 正则中使用 `'"'"'` 技巧嵌入单引号，但 JSON 层的 `\"` 转义和 shell 层的引号交互导致解析失败。

**根因**：`hooks/hooks.json` 模板中的正则 `[^ '\"'\"'\"'\"']*` 在 JSON → shell 双层转义下不可用。

**修复**：已将正则改为白名单字符类 `[a-zA-Z0-9_.-]+`，与项目 `.claude/settings.json` 中已修复的版本保持一致。

## 发现 3：status.md 不支持多任务并行追踪

**日期**：2026-04-29
**阶段**：/forge build（并行 worktree 模式）
**严重程度**：架构限制

**现象**：用户在 3 个 worktree 中并行开发 3 个任务。前两个任务正常启动，第三个任务启动时 Forge 提示 `.forge/status.md` 中有未完成的旧任务（沙箱执行环境 v3.0），要求用户选择覆盖或先 abort。

**根因**：`.forge/status.md` 被设计为单任务状态快照（一个 phase、一个 tier、一个 task name），不支持同时追踪多个并行任务的状态。当多个 worktree 并行执行时，status.md 成为共享瓶颈。

**影响**：
- 并行开发时状态追踪互相覆盖
- `/forge resume` 只能恢复最后一个写入 status.md 的任务
- 用户需要手动管理并行任务的状态

**建议修复方向**：
- 方案 A：status.md 支持多任务条目（按 task name 或 worktree 分区）
- 方案 B：每个 worktree 维护独立的 status.md（worktree 内的 `.forge/status.md`）
- 方案 C：引入 `.forge/status/<task-name>.md` 多文件模式

## 发现 4：build 全量测试未使用项目 CI 检查命令

**日期**：2026-04-29
**阶段**：/forge build → CI 推送
**严重程度**：流程缺陷

**现象**：本地 `/forge build` 的 Final Validation 只跑了 AI 自行拼凑的部分命令（`npx tsc --noEmit`、部分 biome check），没有运行项目定义的完整 CI 命令 `npm run check`。推送后 CI 报错，因为漏了 biome 对 test 文件的检查、typedoc 生成、dist 同步校验、readme metrics 检查。

**根因**：
- forge-build SKILL.md 说"运行全量测试确认无回归"，但没有指定从哪里获取全量测试命令
- forge-test SKILL.md 的 7 项清单逐项列出 typecheck/lint/test，但没有引导 AI 读取 `package.json` 的 `scripts.check` 字段
- `.forge/config.md` 中没有声明项目的 CI 检查命令
- AI 只能自己猜测和拼凑命令，结果不完整

**修复**：
- 在 `.forge/config.md` 中新增 `ci_check_command` 字段和 CI 检查命令章节
- 在 `templates/config.md` 模板中新增 `ci_check_command` 字段
- 后续应在 forge-build 和 forge-test SKILL.md 中引用 config.md 的 CI 命令

## 发现 5：Agent Team 在一次性并行场景中不可靠

**日期**：2026-04-29
**阶段**：/forge review（Agent Team 模式）
**严重程度**：架构缺陷

**现象**：使用 Agent Team 模式运行三层评审时，Team shutdown 协议阻塞导致会话卡死。切换到独立 Subagent 并行执行后问题消失。

**根因**：
- Team 生命周期与 Agent 生命周期不匹配：shutdown 协议要求严格的 create → message → wait → shutdown → delete 链，任何一环超时就阻塞
- Team 运行时状态（消息队列、agent 连接）存储在内存中，不持久化到磁盘，会话中断后无法恢复
- Claude Code 官方文档明确列出 "No session resumption" 为已知限制，相关 GitHub issues 全部 Open 且部分 STALE

**官方已知限制（截至 2026-04-29）**：
- `/resume` 和 `/rewind` 不恢复 in-process teammates
- Shutdown can be slow（需等待当前请求完成）
- 一个 lead 同时只能管理一个 team
- Task status can lag（teammates 有时不标记任务完成）
- v2.1.47-v2.1.59 的内存 GC 优化过度清理了 team membership 记录（#29271）
- Context compaction 后 team config 丢失（#23620）

**决策**：
- Forge 三个 Agent Team 使用场景全部迁移到独立 Subagent 并行模式
- Agent Teams 功能延后到 v3.0，等 Claude Code 官方解决基础可靠性问题后重新评估
- 已记录到 ROADMAP.md 中期和长期规划

## 发现 6：Context Window 压力导致长会话超时

**日期**：2026-04-29
**阶段**：/forge ship（合并确认）
**严重程度**：容量问题

**现象**：在完成 build + review 后，会话在询问"合并到 main？"时断开。不是技术性阻塞，而是 context window 积累过大导致 API 响应变慢或超时。

**上下文积累分析**：

| 操作 | 上下文消耗 | 是否可优化 |
|------|-----------|-----------|
| 读取 spec 3 个文件 | ~300 行 | ✅ 可摘要化 |
| Explore agent 全量探索代码库 | 大量文件路径和代码片段 | ✅ 应返回摘要而非全量 |
| 读取 src/logger/ 5 个文件 | ~150 行 | ⚠️ 按需读取 |
| 读取 sdk-driver.ts 多个片段 | ~200 行 | ⚠️ 按需读取 |
| 第一次 review: Agent Team（结果丢失） | 大量 | ✅ 已决定迁移到 Subagent |
| 第二次 review: 3 个独立 Agent 并行 | 3 份完整评审报告 | ✅ 应只保留 findings |
| 多轮测试输出 (vitest) | 每次 ~50-100 行 | ✅ 应只保留失败用例 |
| 多次 git diff / status | 中等 | ✅ 应限制输出长度 |
| 多次文件编辑 | 中等 | ⚠️ 不可避免 |

**根因**：缺乏系统性的上下文预算管理。当前 SKILL 定义了流程步骤，但没有约束每个步骤的上下文消耗上限。

**改进方向**：见发现 7（上下文预算管理框架）。

## 发现 7：需要系统性的上下文预算管理框架

**日期**：2026-04-29
**阶段**：跨阶段
**严重程度**：架构改进

**现象**：长会话中 context window 积累过快，导致 API 响应变慢、context compaction 触发频繁、甚至会话超时。

**分析**：当前信息在 context 中的生命周期没有明确分类。所有工具输出、agent 返回结果、命令输出都以全量形式留在 context 中，无论后续是否还需要引用。

**信息生命周期分类**：

| 类别 | 定义 | 示例 | 处理策略 |
|------|------|------|---------|
| **持久引用** | 整个会话期间需要反复引用 | Plan 任务列表、当前任务描述、关键接口签名 | 保留在 context，Restatement 时刷新 |
| **阶段引用** | 当前阶段需要，阶段结束后不再需要 | TDD 循环中的测试输出、Closure-First 探针结果 | 阶段结束后由 Restatement 摘要替代 |
| **一次性消费** | 读取后立即使用，不需要再次引用 | Explore agent 的文件列表、git diff 全量输出、vitest 通过用例详情 | 使用后应被摘要替代或丢弃 |
| **写入即丢弃** | 结果已持久化到文件，context 中不需要保留 | Review 报告（已写入 .forge/reviews/）、Progress 更新（已写入 .forge/progress/） | 写入文件后 context 中只保留确认信息 |

**具体优化措施**：

### 7.1 Explore Agent 结果摘要化

**当前**：Explore agent 返回全量文件路径、代码片段、依赖关系图。
**改进**：返回结构化摘要：
```
📍 代码库探索结果（摘要）
  入口点：src/routes/export.ts:15 (exportHandler)
  依赖链：exportHandler → exportService → fileStorage
  相关测试：test/services/export.test.ts（38 个用例）
  关键接口：ExportOptions (src/types/export.ts:8)
```
**预估节省**：每次探索从 ~2000 tokens 降到 ~200 tokens。

### 7.2 Review 报告 Context 裁剪

**当前**：3 个评审者的完整输出（含分析过程）全部留在 context。
**改进**：
- 评审者完整输出写入 `.forge/reviews/<topic>.md`
- Context 中只保留 findings 列表（严重度 + 文件 + 一句话描述）
- 分析过程、证据链、置信度推理过程不留在 context
```
📋 评审结果摘要（详见 .forge/reviews/export.md）
  P0: 0 | P1: 1 | P2: 2 | P3: 1
  P1: src/routes/export.ts:42 — 缺少鉴权中间件
  P2: src/services/export.ts — 重复日期校验逻辑
  P2: src/jobs/async-export.ts — 缺少边界测试
  P3: src/jobs/async-export.ts — 建议添加 JSDoc
```
**预估节省**：从 ~3000 tokens（3 个评审者 × ~1000）降到 ~300 tokens。

### 7.3 测试输出裁剪

**当前**：vitest 输出包含所有通过和失败的用例详情。
**改进**：
- 全部通过时：只保留 `✓ 38 tests passed (0 failed, 0 skipped)`
- 有失败时：只保留失败用例的名称、断言错误、文件位置
- 通过用例的详情不留在 context
**预估节省**：每次测试运行从 ~500 tokens 降到 ~50-100 tokens。

### 7.4 Git Diff 输出限制

**当前**：git diff 全量输出，大变更可能产生数千行。
**改进**：
- 超过 50 行时：只展示文件列表 + 每文件变更行数统计
- 需要看具体 diff 时：按文件逐个查看
**预估节省**：大变更从 ~2000+ tokens 降到 ~200 tokens。

### 7.5 Subagent 结果摘要协议

**当前**：Subagent 返回完整的执行日志（TDD 过程、所有工具调用、中间状态）。
**改进**：定义 Subagent 返回格式：
```
状态：DONE
任务：Task 3 — 添加导出 API 路由
变更文件：src/routes/export.ts, test/routes/export.test.ts
测试结果：✓ 5 tests passed
Commit：feat(export): add export API route
自检：✅ Spec 场景覆盖 | ✅ 安全快扫 | ✅ 范围检查
```
主 Agent 只接收这个摘要，不接收完整执行日志。
**预估节省**：每个 Subagent 从 ~1500 tokens 降到 ~150 tokens。

**总预估**：一个 5 任务的标准路径 build + review 会话，上下文消耗可从 ~15000 tokens 降到 ~5000 tokens，减少约 65%。

## 发现 8：缺少系统性的错误恢复策略

**日期**：2026-04-29
**阶段**：跨阶段
**严重程度**：架构改进

**现象**：会话中断后，已完成的工作（commit、文件修改、progress 更新）散落在不同的持久化层，缺乏统一的恢复机制来识别和继续。

**当前恢复能力分析**：

| 持久化层 | 中断后状态 | 当前恢复能力 | 缺口 |
|---------|-----------|-------------|------|
| Git commits | ✅ 已提交的变更安全 | `/forge resume` 不检查 git log | 无法从 commit 推断任务完成状态 |
| 未提交的文件修改 | ⚠️ 在工作目录中，但未 commit | 无恢复机制 | 可能丢失，需要 `git stash` 或重做 |
| `.forge/progress/<topic>.md` | ✅ 已写入的进度安全 | `/forge resume` 读取 progress | 如果 commit 后 progress 更新前中断，状态不一致 |
| `.forge/status.md` | ✅ 已写入的状态安全 | `/forge resume` 读取 status | 如果 progress 更新后 status 更新前中断，phase 不准确 |
| Subagent 执行中的中间状态 | ❌ 完全丢失 | 无恢复机制 | Subagent 的 TDD 中间状态（RED 通过但 GREEN 未完成）无法恢复 |
| Restatement interim 日志 | ✅ 已写入的日志安全 | `/forge resume` 优先读取 interim | 如果 Restatement 写入前中断，日志可能过时 |

**中断点分类与恢复策略**：

### 8.1 任务完成但未提交（最常见）

**场景**：Subagent 完成 TDD 循环，测试通过，但 commit 前会话中断。
**检测方法**：`git status` 显示有未提交的变更，且变更文件与当前任务 Plan 中的文件匹配。
**恢复策略**：
1. `/forge resume` 检测到未提交变更
2. 运行验证命令确认变更是否有效
3. 如果验证通过 → 提示用户确认后提交
4. 如果验证失败 → 提示用户选择保留或丢弃

### 8.2 已提交但 Progress 未更新

**场景**：commit 成功，但 progress.md 更新前中断。
**检测方法**：比较 git log 中的 commit message 与 Plan 中的任务列表，找到已提交但 progress 未标记完成的任务。
**恢复策略**：
1. `/forge resume` 扫描 git log，匹配 Plan 中的 commit message 模式
2. 自动将匹配的任务标记为已完成
3. 更新 progress.md

### 8.3 Progress 已更新但 Phase 未推进

**场景**：所有任务完成，progress 已更新，但 status.md 的 phase 未推进到下一阶段。
**检测方法**：progress 中所有任务标记完成，但 status.md 的 phase 仍在当前阶段。
**恢复策略**：
1. `/forge resume` 检测到 progress 全部完成但 phase 未推进
2. 自动推进 phase 到下一阶段
3. 提示用户继续下一阶段

### 8.4 Subagent 执行中中断（最难恢复）

**场景**：Subagent 正在执行 TDD 循环，RED 阶段测试已写但 GREEN 阶段未完成。
**检测方法**：存在新增的测试文件但对应的实现文件不完整或不存在。
**恢复策略**：
1. `/forge resume` 检测到不完整的 TDD 状态
2. 选项 A：从 RED 阶段重新开始（保留已写的测试，重新进入 GREEN）
3. 选项 B：丢弃不完整的变更，从头开始该任务
4. 由用户选择

### 8.5 恢复优先级链

```
/forge resume 增强版恢复流程：

1. 读取 status.md → 确定任务和阶段
2. 读取 interim 日志 → 获取最新执行上下文（如果存在）
3. 扫描 git log → 匹配已完成但未标记的任务
4. 检查 git status → 检测未提交的变更
5. 比对 progress vs git log → 修复状态不一致
6. 检查 phase vs progress → 修复阶段不一致
7. 输出恢复报告 → 展示检测到的不一致和修复建议
8. 用户确认 → 执行修复并继续
```

**实现建议**：
- 短期：在 `/forge resume` 中增加 git log 扫描和状态一致性检查
- 中期：在 `/forge build` 的原子提交步骤中，将 commit + progress 更新 + phase 推进作为一个事务性操作（先 commit，再更新 progress，最后更新 status，每步都有 checkpoint）
- 长期：引入 WAL（Write-Ahead Log）模式，在执行操作前先写入意图日志，中断后从意图日志恢复
