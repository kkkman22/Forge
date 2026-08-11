---
topic: evolved-rules-retired
updated: "2026-05-10"
source: ".tinkerman/knowledge/evolved-rules.md retirement"
retired_rules: ["R1", "R2", "R3", "R4"]
---

# Evolved Rules Retirement Log

本文档记录 `.tinkerman/knowledge/evolved-rules.md` 中的规则被永久融入 Forge 基础设施（CLAUDE.md / SKILL.md / hooks / agents）后的退役存根。

**退役原则**：evolved-rules 按设计是"临时热补丁"，最多持续 5 个 session 按 confidence 清理。当一条规则已被 SKILL / hook / agent 吸收为**强制执行的配置**，它应该从 evolved-rules 退役，保留源头条目到本文档作为历史。这样 evolved-rules 保持"当前项目最关注的、尚未被吸收的规则"的性质。

---

## R1: Forge Phase Auto-Advance（退役 2026-05-10）

**原 Content**: Plan 批准后的阶段（build → review → test → ship → learn）成功完成后，必须立即调用 `Skill(skill="forge", args="<next>")` 进入下一阶段。禁止输出任何确认提示，也禁止完成后静默 idle。唯一合法行为：`✅ <阶段> 完成 → 自动进入 <下一阶段>`，然后立即调用 Skill。**例外**：decide 和 spec 阶段需要人工确认。

**融入位置**：
- `CLAUDE.md §2.7` — `<IRON-LAW name="no-mid-step-confirmation">` 顶层铁律
- `skills/shared/next-step-protocol.md` — 完整协议定义
- `scripts/persistent-loop.sh` — Case 5 (plan→build)、Case 6 (build→review)、Case 7 (review→test)、Case 8 (test→ship)、Case 9 (ship→learn)、Case 10 (loop iteration handoff)
- 各 SKILL.md 的 Execution Flow 最后一步

**原 Source**: 用户反馈 — glm-5.1 模型在 plan 批准后仍询问"是否 build"
**原 Confidence**: 0.9

---

## R2: Plan Tasks Are All Mandatory（退役 2026-05-10）

**原 Content**: Plan 批准后，所有任务必须全部完成，无论其 priority 标记（P0/P1/P2/P3）。Priority 仅决定执行顺序（高优先），不表示"可跳过"或"留到后续"。禁止输出"建议后续再做"、"P2 可以推迟"等跳过话术。

**融入位置**：
- `skills/forge/lib/build/instructions.md §1 Overview` — "**Plan 即合同铁律**" 段落（verbatim 实现）

**原 Source**: 用户反馈 — build 阶段 AI 只做 P0/P1，P2 回复"建议后续再做"
**原 Confidence**: 0.9

---

## R3: Sprint Is Not Phase Boundary（退役 2026-05-10）

**原 Content**: Plan 文件里的 Sprint / Milestone / Phase 分组是 build 阶段内部执行分组，不是阶段边界。Plan 批准后 build 必须连续执行到最后一个任务完成才 exit 到 review。进入 build 前若发现 plan 含 ≥2 个 Sprint 或 ≥1 个独立 ship 点，应先停下来提议拆 plan。

**融入位置**：
- `src/plan.ts` — `checkPlanStructure()` 纯函数
- `skills/forge/lib/plan/instructions.md Step 4a` — Plan Structure Warning（当 plan 含多 Sprint 时 prompt 拆分或 `monolith_acknowledged: true`）

**原 Source**: `.tinkerman/specs/phase-advance-hardening/spec.md`
**原 Confidence**: 0.85

---

## R4: SKILL Reload After Context Recovery（退役 2026-05-10）

**原 Content**: 上下文压缩恢复后，或新会话通过 /forge resume 恢复后，必须先读取当前阶段对应的 SKILL.md 完整内容，再执行任何操作。禁止凭 conversation summary 摘要跳步执行。

**融入位置**：
- `skills/forge/lib/resume/instructions.md §2` — "SKILL Reload（恢复后必读步骤）" 段
- `skills/forge/lib/ship/instructions.md §3.5` — Compaction Recovery Check
- `skills/forge/lib/review/instructions.md §7c` — Compaction Recovery Check
- `skills/forge/lib/test/instructions.md §3.5` — Compaction Recovery Check
- `skills/forge/lib/learn/instructions.md §8.5` — Compaction Recovery Check

**原 Source**: 用户反馈 — ship 阶段 compaction 恢复后跳过 AskUserQuestion 合并选项提示
**原 Confidence**: 0.9

---

## 退役不等于失效

退役意味着：

1. 规则已从"需要 AI 在每次 session 开始时读取 evolved-rules 来提醒自己"升级为"SKILL / hook / agent 强制执行"
2. evolved-rules.md 不再负担该规则的存续（腾出容量给新规则）
3. 历史上下文和触发理由保留在本文档，供将来 review / audit 追溯

如果发现退役规则在 SKILL / hook 层被无意删除或弱化（regression），应优先修复基础设施中的落地点，而非"临时"重新加回 evolved-rules.md。
