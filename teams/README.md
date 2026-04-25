# teams/ — Agent Team 参考配置

> **重要**：这些 JSON 文件是 SKILL.md 的参考材料，**不是** Claude Code 原生的团队配置。

Claude Code 的 Agent Team 配置在运行时自动生成到 `~/.claude/teams/`，由 Claude Code 管理，不应手动编辑。

本目录下的文件用于：
1. 作为 SKILL.md 中 Agent Team 成员定义的参考文档
2. 供 `contract.test.ts` 验证 agent 文件与团队配置的一致性
3. 供 `init.sh` 复制到项目的 `.claude/teams/` 作为参考（非 Claude Code 原生配置）

实际的 Agent Team 创建通过自然语言指令完成，队友类型引用 `.claude/agents/` 下的 subagent 定义文件。
详见 [Claude Code Agent Teams 文档](https://code.claude.com/docs/zh-CN/agent-teams)。
