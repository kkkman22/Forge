# Evidence — R5: agent 加载验证

**Date:** 2026-07-09
**Status:** PASS (4 automated tests)

## 验证对象

24 个 agent 角色在 ZCode 下可被发现并加载，不依赖 `CLAUDE_AGENTS_DIR` 非标准变量。

## 回归覆盖（自动化）

`test/agent-load-zcode.test.ts` — 4 tests pass：

| 断言 | 状态 |
|---|---|
| agent 数量 == 24（排除 README） | ✅ |
| 每个 agent 含 YAML frontmatter | ✅ |
| 每个 frontmatter 含 name + description | ✅ |
| 发现不依赖 CLAUDE_AGENTS_DIR env（删除后仍 24） | ✅ |

运行命令：`npx vitest run test/agent-load-zcode.test.ts`

## 关键设计修正（对 v2 §7.3）

v2 §7.3 提"`CLAUDE_AGENTS_DIR` 6 处需 cwd 回退验证"。**核查发现**：`check-agent-links.mjs` 里的 `CLAUDE_AGENTS_DIR` 是**本地 const**（`join(ROOT, ".claude", "agents")`，ROOT 由 `import.meta.dirname` 推导），**不是 env 读取**。v2 所述"6 处"指 const 命名，非 env 依赖。真实风险是"ZCode 是否识别插件 `agents` 字段"——经 plugin manifest，已确认（下）。

## ZCode 识别插件 agents 字段（机制依据）

zcode-guide `zcode-configuration-guide` SKILL §"Plugins"：
> Component fields: `commands`, `skills`, `hooks`, `mcpServers`, `agents` (each may be a directory name, an array, or inline).

→ `agents` 是 plugin manifest 的 component field。Forge 插件 `agents/` 目录被 ZCode 经 manifest 发现并加载，**不经 env 变量**。24 个角色全部可加载。

## 现有 CI 覆盖（补充）

- `scripts/lint-agents.mjs`：每个 agent 断言有 frontmatter + name/description（NO_FRONTMATTER / MISSING_name 错误）。
- `scripts/check-agent-links.mjs`：断言 `.claude/agents/` symlink 全部有效 + 统计 count。

本 P1 的 `agent-load-zcode.test.ts` 补强了"== 24"的显式数量断言 + "不依赖 env"的文档化断言。
