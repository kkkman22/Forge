---
feature: review-adversarial-stance
layout: tasks
created: 2026-06-04
spec_ref: ".forge/specs/review-adversarial-stance/requirements.md"
---

# Tasks

## Task 1: spec-check.md 追加 Adversarial Stance

- [ ] 1.1 在 `.claude/agents/spec-check.md` Identity 章节末尾（分隔线前）追加 `## Adversarial Stance（铁律）` 子章节
- [ ] 1.2 写入"不信任 implementer 报告"声明 + ≥3 条禁止 + ≥4 条必须 + 铁律结尾

## Task 2: quality-check.md 追加 Adversarial Stance

- [ ] 2.1 在 `.claude/agents/quality-check.md` Identity 章节末尾追加 `## Adversarial Stance（铁律）` 子章节
- [ ] 2.2 写入"不信任自审结论"声明 + ≥3 条禁止 + ≥3 条必须 + 铁律结尾

## Task 3: security-check.md 追加 Adversarial Stance

- [ ] 3.1 在安全审查 agent 的 Identity 章节末尾追加 `## Adversarial Stance（铁律）` 章节
- [ ] 3.2 写入"假设最坏情况"声明 + ≥3 条禁止 + ≥4 条必须

## Task 4: review/instructions.md 追加 Independent Verification

- [ ] 4.1 在 `skills/forge/lib/review/instructions.md` 新增 `## Independent Verification（铁律）` 章节
- [ ] 4.2 写入 4 条独立验证规则 + 高风险信号判定

## Task 5: 验证

- [ ] 5.1 确认追加内容与现有 Identity / Check Items 不重复
- [ ] 5.2 确认追加不改变 Output Format、Check Method 等核心逻辑
- [ ] 5.3 运行 `npm run check` 全量测试通过
