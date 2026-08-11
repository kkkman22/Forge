---
feature: forge-init-env-optimization
layout: tasks
created: 2026-05-30
spec_ref: ".forge/specs/forge-init-env-optimization/requirements.md"
---

# Tasks

## Task 1: forge init 模板新增环境变量（§48, §54, §68）

- [ ] 1.1 定位 `forge init` 的 settings.json 模板或生成逻辑
- [ ] 1.2 添加 `ENABLE_PROMPT_CACHING_1H: "true"` 到 env 部分
- [ ] 1.3 添加 `MCP_CONNECTION_NONBLOCKING: "true"` 到 env 部分
- [ ] 1.4 添加 `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "true"` 到 env 部分
- [ ] 1.5 实现不覆盖已有值的逻辑

**Verify-By**: bash — 运行 `forge init` 后 `grep -c 'PROMPT_CACHING\|NONBLOCKING\|ENV_SCRUB' .claude/settings.json` 输出 3
**关联需求**: R2, R3, R4

## Task 2: MCP alwaysLoad 配置（§40）

- [ ] 2.1 在 `plugin.json` 的 `mcpServers.forge-context` 中添加 `"alwaysLoad": true`
- [ ] 2.2 验证 Claude Code 支持 alwaysLoad 字段（如不支持则静默忽略）
- [ ] 2.3 在 `forge init` 输出中说明 alwaysLoad 的用途

**Verify-By**: bash — `grep 'alwaysLoad' .claude-plugin/plugin.json`
**关联需求**: R1

## Task 3: forge init 输出汇总

- [ ] 3.1 在 `forge init` 完成后输出配置汇总表（Markdown 格式）
- [ ] 3.2 包含 4 项配置的名称、值和用途说明

**Verify-By**: manual — 运行 `forge init` 查看输出
**关联需求**: R5

## Task 4: 回归验证

- [ ] 4.1 `npm run check` 通过
- [ ] 4.2 已有 settings.json 不被覆盖（仅添加缺失项）
- [ ] 4.3 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 保持不变

**Verify-By**: bash + manual
**关联需求**: R5
