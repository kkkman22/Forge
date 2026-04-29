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
