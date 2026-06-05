# CSO Description Gate

所有新增或修改的 agent definition（`.claude/agents/*.md`）和 skill instructions（`skills/forge/lib/*/instructions.md`），其 `description` 字段必须：

1. 以 "Use when" 开头
2. 仅包含触发条件（在什么场景下使用）
3. 不包含角色描述、工作流总结或能力清单

**Why**: LLM 会直接跟随 description 的摘要而不读取完整内容（superpowers CSO 发现）。description 总结流程 = LLM 跳过流程。
