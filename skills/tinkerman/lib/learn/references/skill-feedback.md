---
updated: 2026-08-11
---
# SKILL Feedback Detection — 详细规范

> 从 `../instructions.md §4` 拆分。SKILL 主文件只保留一行摘要指针。

五维度提取后，检测 SKILL.md 指导是否有不适用的场景。

## Signal Types

| Signal | Meaning | Example |
|--------|---------|---------|
| TDD legitimately skipped | Certain tasks are not suited for strict TDD | Pure documentation, config changes, data migration |
| Subagent self-check inapplicable | Meaningless in specific scenarios | Delta check for non-brownfield projects |
| Routing suggestion overridden | AI complexity judgment inaccurate | AI suggests full but user chooses standard |
| Review layer mismatch | Certain review dimensions inapplicable | Accessibility check for pure backend projects |

## Handling Rule

不适用的场景记录到 `.tinkerman/knowledge/skill-feedback.md`（含涉及命令、场景、建议、频次）。同一类反馈频次 ≥ 3 时提醒用户审阅 SKILL.md。

**不自动修改** SKILL.md——只记录和提醒。
