---
updated: 2026-08-11
---
# Prohibited Content List

> Extracted from forge-plan SKILL.md Section 4.

计划中**严禁出现**以下占位符内容。出现任何一项，自检不通过，必须替换为具体内容。

| Prohibited Content | Description |
|---------|------|
| `TBD` | To be determined—if you don't know, research first |
| `TODO` | To do—no TODOs allowed in planning phase |
| `待定` | Chinese version of TBD |
| `后续补充` | Equivalent to not writing anything |
| `类似 Task N` | Each task must be independently complete |
| `添加适当的错误处理` | Write specific error handling code |

## Scanning Rules

1. Perform case-insensitive text scan across the entire plan, matching exact text and common variants (e.g. `tbd`, `Todo`, `TODO:`, `// TODO`).
2. When a match is found, locate the specific task and line, require replacement with concrete content.
3. **lightweight format**: scan scope is task descriptions and Design Reference fields (excluding code blocks). **full format**: scan entire document (including code blocks).
