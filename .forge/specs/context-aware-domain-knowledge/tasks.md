---
feature: context-aware-domain-knowledge
layout: tasks
created: 2026-06-03
spec_ref: ".forge/specs/context-aware-domain-knowledge/requirements.md"
---

# Tasks

## Task 1: 升级 glossary.md 格式

- [ ] 1.1 在 `.forge/glossary.md` 的 frontmatter（`---` 块）中，确认 `schema_version` 字段存在。将 `schema_version` 从 `1` 升级为 `2`。
- [ ] 1.2 在 glossary.md 的术语条目中，选择 3-5 个高频术语（如 Spec / Plan / Vertical Slice / Subagent / Restatement Checkpoint）升级为增强格式。每个条目追加 **避免**、**关系**、**歧义记录** 字段（按实际内容填写，不留空字段）。其余条目保持旧格式不变。

## Task 2: grill/instructions.md 追加实时维护规则

- [ ] 2.1 在 `skills/forge/lib/grill/instructions.md` §3 Core Loop 的 Constraints 列表（"Glossary conflicts must be detected..." 条目）之后，追加实时维护规则。内容包括 5 种场景（新术语/模糊术语/否定同义词/术语边界/新关系）的对应操作和"不要耦合到实现细节"原则。
- [ ] 2.2 在 §4 Output 的 4 段格式之后追加第 5 段 `## Glossary Updates`（变更列表格式：`+ 新术语` / `~ 更新术语` / `! 歧义记录`，无变更则 `none`）。

## Task 3: 增强 checkGrillGlossaryConflicts

- [ ] 3.1 在 `src/grill.ts` 中，扩展 `GrillConflictCheckResult` 的 `conflicts` 数组元素类型为 `GlossaryConflict`（含 type/term/detail/suggestion 4 字段）。type 联合类型扩展为 `"synonym" | "avoided_term" | "semantic_mismatch" | "relation_violation"`。
- [ ] 3.2 在 `checkGrillGlossaryConflicts` 函数体中，在现有同义词检测循环后追加 3 个检测分支：禁用词检测（匹配 glossary 条目的 **避免** 字段内容）、语义矛盾检测（用户答案中的术语描述与 glossary 定义比较）、关系验证（用户描述的关系与 **关系** 字段比较）。
- [ ] 3.3 更新 `renderGrillConflictPrompt` 函数，为新增的 3 种 conflict type 生成对应的用户可见 prompt 文本。

## Task 4: 更新 decide §3.0 引用

- [ ] 4.1 在 `skills/forge/lib/decide/instructions.md` §3.0 Glossary alignment check 段落中，将 "如返回非空冲突" 的描述更新为 "如返回非空冲突（含同义词、禁用词、语义矛盾、关系验证 4 种类型）"。

## Task 5: 交叉验证

- [ ] 5.1 验证升级后的 glossary.md 被 `skills/forge/lib/grill/instructions.md` 的 `checkGrillGlossaryConflicts` 正确解析（新增字段为可选，旧条目不受影响）。验证 `src/grill.ts` 的类型变更不破坏 `extractNewGlossaryCandidates` 的行为。验证 decide §3.0 的 `checkDecideGlossaryConflicts` 调用不因函数签名变更而报错。
