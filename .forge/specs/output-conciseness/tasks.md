---
feature: output-conciseness
layout: tasks
created: 2026-04-29
spec_ref: ".forge/specs/output-conciseness/requirements.md"
---

# Tasks

## Task 1: Add §2.6 输出简洁性 to templates/CLAUDE.md

- [x] 1.1 Insert the §2.6 "输出简洁性" section after §2.5 上下文刷新纪律 and before the `---` separator preceding §3 评审纪律 in `templates/CLAUDE.md`. The section must include: principle statement, 禁止的输出模式 table with 5 pattern types, Before/After examples, 保留的输出 list (8 categories), Decision_Point 输出许可 (5 scenarios + template + example), and 优先级 statement.

## Task 2: Add §2.6 输出简洁性 to project CLAUDE.md

- [x] 2.1 Insert the same §2.6 "输出简洁性" section into the project-level `CLAUDE.md`, at the same position (after §2.5, before §3). Content must be semantically identical to the template version — no template variables to resolve since the rules themselves are project-agnostic.

## Task 3: Add §6.6 and failure mode #6 to forge-build SKILL.md

- [x] 3.1 Add §6.6 "输出简洁性" after §6.5 三次换路 in `skills/forge-build/SKILL.md`. The section references CLAUDE.md §2.6, reminds that code edit operations must follow conciseness constraints, and clarifies that all SKILL-defined structured outputs are exempt.
- [x] 3.2 Add "失败模式 6：逐步解说代码编辑操作" after 失败模式 5 and before the "反射触发器" section. The entry must follow the existing format: 错误行为, 为什么这是错的, 正确做法 — and reference CLAUDE.md §2.6.

## Task 4: Cross-reference verification

- [x] 4.1 Verify that §2.6 content in `templates/CLAUDE.md` and `CLAUDE.md` is semantically identical. Verify that `skills/forge-build/SKILL.md` §6.6 correctly references §2.6. Verify section numbering is consistent and no existing content was disrupted.
