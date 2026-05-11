# PoC Topics: DAG vs Agent Teams

## A: 添加一个新的 CLI flag
**Complexity**: simple
**Topic**: 在 Forge CLI 中添加 `--json-output` flag，影响现有 `--output-format` 选项。需要决定是替代还是补充现有选项，以及输出格式（stream-json vs pretty-json）。

## B: 重构 config 系统
**Complexity**: medium
**Topic**: 把 `.forge/config.md` 的 YAML frontmatter 拆成多个独立文件（`config/` 目录），保留向后兼容。涉及迁移策略、验证逻辑重写、现有 SKILL 的 config 读取方式。

## C: 引入 plugin 系统
**Complexity**: complex
**Topic**: 为 Forge 设计 plugin 机制，允许第三方扩展 skill/agent/hook，同时保持 `.forge/` 状态一致性。需要设计 plugin API surface、沙箱隔离、生命周期管理、冲突解决策略。
