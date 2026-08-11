---
status: approved
feature: claude-2-1-163-infra-hardening
layout: tasks
created: 2026-06-05
spec_ref: ".forge/specs/claude-2-1-163-infra-hardening/requirements.md"
---
# 实现计划：Claude Code 2.1.163 基础设施加固

## 概述

本计划按 Forge TDD 铁律执行：每个实现任务先写失败测试（RED），再实现最小代码（GREEN），最后做局部重构（REFACTOR）。任务顺序优先降低平台兼容风险：先版本门禁和诊断，再 Stop additionalContext，再 session/path 安全，最后 MCP 后台进程回收。

## Tasks

- [ ] 1. 建立 Claude Code 版本能力门禁
  - [ ]* 1.1 编写 semver 与版本解析测试（RED）
    - 新增 `test/compatibility.property.test.ts`
    - 覆盖 `parseClaudeVersion()` 从 `claude --version` 文本中提取版本
    - 覆盖 `compareSemver()` numeric ordering、传递性、反对称性
    - 覆盖低于最低版本、高于上限、未知版本的 verdict
    - **Validates: Requirements 1.3, 1.4, 1.7, 1.8**

  - [ ] 1.2 实现 `src/compatibility.ts`（GREEN）
    - 定义 `ClaudeVersionRange`、`ClaudeVersionCheck`、`VersionVerdict`
    - 实现 `parseClaudeVersion()`、`compareSemver()`、`checkClaudeVersion()`
    - 默认 capability matrix 包含 v2.1.163 新能力
    - **Requirements: 1.1, 1.2, 1.3, 1.4, 1.8**

  - [ ]* 1.3 编写 bootstrap/doctor 版本诊断测试（RED）
    - 扩展 `test/contract/session-start-hook.test.ts` 或新增 `test/bootstrap-compatibility.test.ts`
    - 模拟低版本、未知版本、高版本输出
    - 断言低版本包含 current/minimum/approved version 诊断
    - **Validates: Requirements 1.3, 1.4, 1.7**

  - [ ] 1.4 接入 `scripts/bootstrap-check.mjs` 和 `forge-doctor`（GREEN）
    - SessionStart 增加 Claude version soft/hard diagnostic
    - `forge-doctor --json` 输出 version block
    - 保持异常 fail-open，不破坏已有 bootstrap 提示
    - **Requirements: 1.3, 1.4, 1.5, 1.7**

  - [ ] 1.5 更新插件 manifest 与兼容性文档（REFACTOR）
    - 在 `.claude-plugin/plugin.json` 或兼容配置位置声明 managed version settings
    - 更新 `docs/claude-code-compatibility.md` v2.1.163 能力矩阵
    - **Requirements: 1.1, 1.2, 1.6, 7.1**

- [ ] 2. 实现 Stop/SubagentStop additionalContext 反馈
  - [ ]* 2.1 编写 Stop context 决策单元测试（RED）
    - 新增 `test/stop-additional-context.test.ts`
    - 覆盖 missing verification、incomplete tasks、auto advance gap、subagent failure、无事可做
    - 断言 additional context 非空且长度受限
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

  - [ ] 2.2 实现 `scripts/stop-additional-context.mjs`（GREEN）
    - 从 hook stdin 读取 event、session、agent 信息
    - 读取 `.forge/status.md`、`.forge/progress/`、最近 review/test/ship 证据
    - 输出 `hookSpecificOutput.additionalContext` JSON
    - 不满足条件时静默 exit 0
    - **Requirements: 2.1, 2.2, 2.3, 2.4, 2.7**

  - [ ]* 2.3 编写 hook schema contract tests（RED）
    - 扩展 `test/contract.test.ts`
    - 校验 `hooks/hooks.json` 注册 Stop/SubagentStop additional context hook
    - 校验 hook 输出 JSON schema
    - **Validates: Requirements 2.6, 2.8**

  - [ ] 2.4 更新 `hooks/hooks.json`（GREEN）
    - Stop 增加 structured context hook
    - SubagentStop 增加 structured context hook
    - 低版本 fallback 保留现有 stdout 提醒
    - **Requirements: 2.6, 2.7, 2.8**

- [ ] 3. 扩展插件健康诊断
  - [ ]* 3.1 编写 doctor JSON schema tests（RED）
    - 新增 `test/forge-doctor.test.ts` 或扩展现有 plugin manifest tests
    - 临时项目 fixture 覆盖 manifest/hooks/commands/bin/MCP pass/warn/fail
    - 断言 `--json` 包含 `status/message/fixHint`
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

  - [ ] 3.2 将 `forge-doctor` 迁移或扩展为结构化诊断（GREEN）
    - 保留 shell bin 入口，可委托到 `scripts/forge-doctor.mjs`
    - 检查 plugin manifest、commands、hooks、bin、MCP smoke、version consistency
    - 文本输出保持简洁，JSON 输出完整
    - **Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

  - [ ] 3.3 增加 plugin enabled 人工核对提示（REFACTOR）
    - 无法自动证明时输出 soft diagnostic
    - docs 说明如何用 `/plugin list --enabled/--disabled` 对照
    - **Requirements: 3.7, 3.8**

- [ ] 4. 建立 session id 一致性 helper 与契约测试
  - [ ]* 4.1 编写 session id resolver property tests（RED）
    - 新增 `test/session-id.property.test.ts`
    - 任意 hook/env/legacy/pid 输入组合都返回非空 scoped key
    - 冲突组合产生 mismatch warn
    - **Validates: Requirements 4.1, 4.2, 4.5, 4.6**

  - [ ] 4.2 实现 `src/session-id.ts`（GREEN）
    - 实现 `resolveSessionId()` 和 `sessionScopedKey()`
    - 优先级：hook `session_id` → `CLAUDE_CODE_SESSION_ID` → `CLAUDE_SESSION_ID` → pid fallback
    - **Requirements: 4.1, 4.2, 4.6**

  - [ ]* 4.3 编写 resume session consistency contract test（RED）
    - 模拟 hook stdin、Bash env、MCP env 一致与不一致
    - 断言 deprecation lock/cache namespace 一致或产生 warn
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.7**

  - [ ] 4.4 接入 scripts/MCP/cmux 诊断路径（GREEN）
    - Bash 脚本优先读取 `CLAUDE_CODE_SESSION_ID`
    - MCP server stderr 或 diagnostic tool 暴露 session id source
    - cmux mirror 避免 resume 后重复 startup notification
    - **Requirements: 4.3, 4.4, 4.7**

  - [ ] 4.5 更新兼容性文档（REFACTOR）
    - 记录 v2.1.163 session id 一致性依赖
    - 说明低版本 fallback 风险
    - **Requirements: 4.8, 7.1**

- [ ] 5. 加固权限路径等价表达
  - [ ]* 5.1 编写 path canonicalization property tests（RED）
    - 新增 `test/path-equivalence.property.test.ts`
    - 生成 `~`、`$HOME`、`${HOME}`、相对路径、重复 slash、`..` 等输入
    - 断言同一真实路径 canonical 后等价
    - **Validates: Requirements 5.1, 5.3, 5.5**

  - [ ]* 5.2 编写 Bash path extractor tests（RED）
    - 覆盖 quoted path、shell variable path、subshell、backtick、高风险无法解析片段
    - 断言不执行 shell，仅提取路径信号
    - **Validates: Requirements 5.2, 5.6, 5.7**

  - [ ] 5.3 实现 `src/path-equivalence.ts`（GREEN）
    - 实现 `canonicalizePathExpression()`、`extractPathExpressionsFromBash()`、`pathsEquivalent()`
    - 支持注入 fake realpath resolver 便于测试 symlink
    - **Requirements: 5.1, 5.2, 5.5, 5.6**

  - [ ] 5.4 接入 sandbox/frozen-zone/Bash deny 检查（GREEN）
    - 更新 `src/sandbox-policy.ts` / `src/sandbox-phased.ts` 或 hook wrapper
    - frozen-zone 写操作阻断绝对/相对/symlink 等价路径
    - MCP `forge_exec` deny pattern 使用 canonical path 信号
    - **Requirements: 5.3, 5.4, 5.7**

  - [ ] 5.5 更新安全文档（REFACTOR）
    - 说明 Forge 路径等价规则不替代 Claude 原生权限系统
    - **Requirements: 5.8, 7.1**

- [ ] 6. 加固 MCP `forge_exec` 后台进程回收
  - [ ]* 6.1 编写 executor cleanup 单元测试（RED）
    - 新增 `test/mcp/forge-exec-cleanup.test.ts`
    - mock spawn/process tree，覆盖 timeout、normal exit with background child、cleanup error
    - 断言 SIGTERM → grace → SIGKILL 顺序
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**

  - [ ]* 6.2 编写 MCP integration cleanup tests（RED）
    - 扩展 `test/mcp/server.integration.test.ts`
    - 覆盖 `sh -c 'sleep 999 &'`、`sh -c 'sleep 999 & echo done'`、stdin EOF during running command
    - 断言 server 不挂死且不遗留本次 executor 创建的子进程
    - **Validates: Requirements 6.3, 6.4, 6.6, 6.7**

  - [ ] 6.3 实现 `execCommandTracked()`（GREEN）
    - 用独立 process group 启动 shell
    - 注册 root pid/pgid
    - timeout 或正常退出后调用 process-tree cleanup
    - 保留 stdout/stderr 行为
    - **Requirements: 6.1, 6.2, 6.3, 6.5, 6.7, 6.8**

  - [ ] 6.4 接入 MCP server shutdown cleanup（GREEN）
    - stdin EOF/SIGTERM/SIGINT 时等待 registry cleanup
    - 超时后 stderr 诊断并退出
    - **Requirements: 6.4, 6.8**

  - [ ] 6.5 回归验证 trimming 与 failure passthrough（REFACTOR）
    - 确认失败输出完整，不被 cleanup 摘要截断
    - 更新现有 `test/mcp/forge-exec.test.ts`
    - **Requirements: 6.8**

- [ ] 7. 文档、dist 同步与知识沉淀
  - [ ] 7.1 更新 `docs/claude-code-compatibility.md`
    - 增加 v2.1.163 六类能力、最低版本、低版本降级策略
    - **Requirements: 7.1**

  - [ ] 7.2 更新 `forge-doctor --help` 和相关 docs
    - help 文案包含 version/plugin/MCP/session diagnostics
    - **Requirements: 7.2**

  - [ ] 7.3 更新 CHANGELOG
    - 增加 Claude Code 2.1.163 infrastructure hardening 条目
    - **Requirements: 7.5**

  - [ ] 7.4 dist 同步
    - 若修改 `src/**/*.ts`，运行 `npm run dist:resync`
    - **Requirements: 7.6**

  - [ ] 7.5 运行全量验证
    - `npm run check`
    - `npm run docs`
    - `bash scripts/build-dist.sh`
    - **Requirements: 7.3, 7.6**

  - [ ] 7.6 `/forge learn` 知识沉淀
    - 记录“平台 changelog 转化为项目防回归规格”的经验
    - **Requirements: 7.4**

