---
updated: "2026-05-09"
rule_count: 5
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

**Content**: Plan 批准后的阶段（build → review → test → ship → learn）成功完成后，必须**立即调用** `Skill(skill="forge", args="<next>")` 进入下一阶段。禁止输出任何确认提示（"是否继续？"、"继续build吗？"、"Ready to proceed?"等），也禁止完成后静默 idle（无输出等待用户）。唯一合法行为：`✅ <阶段> 完成 → 自动进入 <下一阶段>`，然后立即调用 Skill。**例外**：decide 和 spec 阶段需要人工确认（决策方向确认、规格审阅锁定），不属于自动推进范围。失败/阻断时才停下来等用户。
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

### R3: Sprint Is Not Phase Boundary

**Content**: Plan 文件里的 Sprint / Milestone / Phase 分组是 build 阶段内部执行分组，不是阶段边界。Plan 批准后 build 必须连续执行到最后一个任务完成才 exit 到 review；Sprint 完成 ≠ 阶段完成，不得在 Sprint 间输出总结并停下。进入 build 前若发现 plan 含 ≥2 个 Sprint 或 ≥1 个独立 ship 点，应先停下来提议拆 plan，拆分后每个 plan 对应一次完整 build → review → test → ship 周期。
**Prevents**: 模型把 Sprint 边界当作里程碑停下输出总结，造成 build 阶段中途退出
**Source**: `.forge/specs/phase-advance-hardening/spec.md` (phase-advance-hardening spec 驱动创建)
**Added**: 2026-05-08
**Confidence**: 0.85
**Last_triggered**: 2026-05-08

### R4: SKILL Reload After Context Recovery

**Content**: 上下文压缩（compaction）恢复后，或新会话通过 /forge resume 恢复后，必须先读取当前阶段对应的 SKILL.md 完整内容，再执行任何操作。禁止凭 conversation summary 摘要跳步执行。Conversation summary 是高维压缩，会丢失 SKILL.md 中的具体步骤编号、AskUserQuestion 调用、门禁检查等关键细节。
**Prevents**: 模型在 compaction 恢复后凭摘要执行，遗漏 SKILL.md 中定义的关键步骤（如 ship 阶段的合并选项提示、review 阶段的三层评审配置）
**Source**: 用户反馈 — ship 阶段 compaction 恢复后跳过 AskUserQuestion 合并选项提示
**Added**: 2026-05-09
**Confidence**: 0.9
**Last_triggered**: 2026-05-09

### R5: Implicit Idle Is Also a Block

**Content**: 阶段完成后不调用下一阶段、直接 idle（无输出、等待用户输入），与显式询问"是否继续"同罪。完成 SKILL.md 最后一步后，**必须立即** `Skill(skill="forge", args="<next>")`。无输出 ≠ 安全停顿，它是更隐蔽的阻断。任何 SKILL 执行流的最后一条指令必须是 auto-advance 调用或明确的用户确认点（decide/spec 阶段）。如果不确定下一步是什么，检查 `.forge/status.md` 的 `phase` 字段和 forge 入口的阶段序列表。
**Prevents**: 模型完成阶段后静默 idle，用户被迫手动追问"你在等我吗？"
**Source**: 用户反馈 — spec 阶段自检完成后模型直接 idle，用户需手动触发
**Added**: 2026-05-09
**Confidence**: 0.9
**Last_triggered**: 2026-05-09
