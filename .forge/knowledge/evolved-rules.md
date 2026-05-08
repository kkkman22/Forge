---
updated: "2026-05-08"
rule_count: 2
max_rules: 15
---

# Error-Prevention Rules

Rules distilled by `/forge learn` from accumulated project knowledge.
Each rule prevents a specific, documented error pattern.

<!-- Rule format:
### R{N}: {title}

**Content**: {concise rule statement}
**Prevents**: {specific error this rule prevents}
**Source**: {knowledge file and entry that triggered this rule}
**Added**: {YYYY-MM-DD}
**Confidence**: {0.3-0.9}
**Last_triggered**: {YYYY-MM-DD}
-->

### R1: Forge Phase Auto-Advance

**Content**: Plan 批准后的阶段（build → review → test → ship → learn）成功完成后，必须**立即调用** `Skill(skill="forge", args="<next>")` 进入下一阶段。禁止输出任何确认提示（"是否继续？"、"继续build吗？"、"Ready to proceed?"等）。唯一输出格式：`✅ <阶段> 完成 → 自动进入 <下一阶段>`，然后立即调用 Skill。**例外**：decide 和 spec 阶段需要人工确认（决策方向确认、规格审阅锁定），不属于自动推进范围。失败/阻断时才停下来等用户。
**Prevents**: 模型在阶段间添加额外确认步骤，违反 CLAUDE.md §2.7 铁律
**Source**: 用户反馈 — glm-5.1 模型在 plan 批准后仍询问"是否 build"
**Added**: 2026-05-08
**Confidence**: 0.9
**Last_triggered**: 2026-05-08

### R2: Plan Tasks Are All Mandatory

**Content**: Plan 批准后，所有任务必须全部完成，无论其 priority 标记（P0/P1/P2/P3）。Priority 仅决定执行顺序（高优先），不表示"可跳过"或"留到后续"。禁止输出"建议后续再做"、"P2 可以推迟"等跳过话术。如果任务不应该做，它就不应该出现在 Plan 中——Plan 批准即合同，全部执行。
**Prevents**: 模型在 build 阶段只完成 P0/P1 任务，跳过 P2+ 任务
**Source**: 用户反馈 — build 阶段 AI 只做 P0/P1，P2 回复"建议后续再做"
**Added**: 2026-05-08
**Confidence**: 0.9
**Last_triggered**: 2026-05-08
