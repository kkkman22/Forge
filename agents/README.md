# agents/ — Agent 唯一真相源

> **本目录是 Forge 所有 subagent 定义的唯一源(ADR-0010)。**

## 约定

- 所有 agent 定义(`*.md`,带 YAML frontmatter)在此目录维护。
- `.claude/agents/*.md` 全部是指向本目录的 symlink(`→ ../../agents/<name>.md`)。
- 修改 agent 时,**只改本目录的文件**,symlink 自动反映。
- `.codex/` 是本地生成物(被 gitignore),不纳入统一。

## 新增 agent

1. 在本目录创建 `<name>.md`(参照 `templates/AGENT-TEMPLATE.md`)。
2. 创建 symlink:`ln -s ../../agents/<name>.md .claude/agents/<name>.md`。
3. 运行 `node scripts/check-agent-links.mjs` 验证。
4. 运行 `node scripts/check-agent-originality.mjs agents/<name>.md` 查重。

## 门禁

- `check-agent-links.mjs`:校验 `.claude/agents/` 全部是有效 symlink。
- `lint-agents.mjs`:校验 frontmatter 字段与 section。
- `check-agent-originality.mjs`:查重,防"换皮"重复 agent。

三者均接入 `npm run check`。

## 参考

- ADR-0010:统一架构(symlink 而非 convert)
- ADR-0009:源语言定为中文
- spec: `.forge/specs/agency-borrow-*`
