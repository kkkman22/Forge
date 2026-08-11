---
feature: agency-borrow-03-agent-persona-template
layout: tasks
created: 2026-06-23
spec_ref: ".forge/specs/agency-borrow-03-agent-persona-template/requirements.md"
---

# Tasks

## Task 1: 创建 AGENT-TEMPLATE.md

- [ ] 1.1 在 `templates/` 新建 `AGENT-TEMPLATE.md`,含 5 标准 section + `vibe` 示例
- [ ] 1.2 在模板顶部说明与 SKILL-TEMPLATE 的边界(D1)

**Verify-By**: bash — `test -f templates/AGENT-TEMPLATE.md && grep -c '## Identity\|## Mission\|## Critical Rules\|## Deliverables\|## Communication Style' templates/AGENT-TEMPLATE.md` 输出 5
**关联需求**: R1

## Task 2: 关键 agent 添加 vibe

- [ ] 2.1 `agents/spec-check.md` 添加 `vibe`(spec #1 确立源后,改源)
- [ ] 2.2 `agents/quality-check.md` 添加 `vibe`
- [ ] 2.3 `agents/security-check.md` 添加 `vibe`
- [ ] 2.4 `agents/forge-review.md` 添加 `vibe`(若该 agent 在源中;否则先经 spec #1 回流)

**Verify-By**: bash — `grep -l '^vibe:' agents/spec-check.md agents/quality-check.md agents/security-check.md | wc -l` 输出 ≥3
**关联需求**: R2

## Task 3: 铁律内嵌到 Critical Rules

- [ ] 3.1 `spec-check`/`quality-check`/`security-check` 的 Critical Rules 加 §3.1 引用 + 落地
- [ ] 3.2 `quality-check`/`security-check` 加 §2.3 验证精神(要求作者证据)
- [ ] 3.3 `forge-review` 加 §3.3 P0/P1 阻断规则引用

**Verify-By**: bash — `grep -l '§3.1' agents/spec-check.md agents/quality-check.md agents/security-check.md | wc -l` 输出 3
**关联需求**: R3

## Task 4: 回归验证

- [ ] 4.1 `npm run check` 通过(含 spec #2 lint 校验 section)
- [ ] 4.2 `/forge review` 端到端,确认 review 行为不回归

**Verify-By**: bash + manual
**关联需求**: 全部
