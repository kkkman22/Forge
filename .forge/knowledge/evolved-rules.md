---
updated: "2026-05-10"
rule_count: 9
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

### R6: Review 必须对 "新增文件" 做主分支存在性验证

**Content**: `/forge review` 的 spec-check agent 在声称"✅ 新增的 agent/skill/hook/template 文件已实现"之前，**必须**对被声称创建的文件执行一次主分支路径（非 worktree、非 draft、非 stash）的存在性校验。禁止仅依据"worktree 中存在"或"commit log 显示添加过"作为实现证据。推荐做法：review 时维护一个"claimed new file list"，对每条执行 `test -f <mainBranchPath>` 或使用只读文件工具读取首行。worktree 合并失败 / git add 遗漏 / rebase 丢 hunk 这三种事故的共同特征，就是"功能函数已合并但角色定义文件未合并"。
**Prevents**: review 报告把 "worktree 里存在" 错误当作 "主分支已合并"，放行了不完整的交付（2026-05-10 Sprint 3 审计：`business-analyst.md` 触发代码合并但 agent 定义文件未合并）
**Source**: 2026-05-10 三 Sprint 审计（`.kiro/specs/sprint-3-gap-remediation/`）— Sprint 3 R5 review 报告声称 "✅ agent.md + trigger logic" 与事实不符
**Added**: 2026-05-10
**Confidence**: 0.9
**Last_triggered**: 2026-05-10

### R7: Pack/Loader 约定差异必须有运行时验证

**Content**: 当 Pack 交付"数据文件"（glossary/banned-patterns/state-machines 等），Core 交付"加载器"解析这些文件时，**必须**有至少一个集成测试真正对**当前启用 Pack** 调用 `loadXxx(enabledPacks)` 并断言 `result.size > 0` 或 `result.entries.length > 0`。Zero-Pack-Zero-Impact 测试（空输入 → 空输出）只覆盖反面，不覆盖正面；静态 grep 和单元测试 fixture 也看不到"Pack 实际格式与 Core parser 期望格式不符"这类 schema 断层。Pack 启用后第一次 `loadXxx` 返回空即视为交付失败，不是 Zero-Pack 合理降级。
**Prevents**: Pack 数据格式演化后，loader 未同步导致启用 Pack 时默默返回空结果（2026-05-10 审计：PMS glossary 采用聚合 YAML 列表格式，`parseGlossaryFile` 按 Requirement 描述期望"每术语独立 frontmatter"，两者不匹配但所有单元测试和 Zero-Pack 测试都绿）
**Source**: 2026-05-10 三 Sprint 审计 — Sprint 1 R6 glossary 格式断层
**Added**: 2026-05-10
**Confidence**: 0.9
**Last_triggered**: 2026-05-10

### R8: Stub With TODO 不是 Zero-Pack 合理降级

**Content**: 核心业务函数返回空默认值（`return {}` / `return []` / `return null`）必须满足两个条件之一才算合法：(a) 明确对应 Zero-Pack-Zero-Impact 场景（输入为空、Pack 未启用）；(b) 有明确的 fallback 数据源声明并在有输入时产出非空结果。仅当函数声明为"v1 stub，v2 实装"并有 TODO 注释时，review 必须记录为 **P1 功能残缺**（不得降级为 P2/P3）。Zero-Pack 合理 no-op 和功能 stub 是两件事：前者是架构不变量，后者是欠债，不能混为一谈。Spec-check agent 的判据：函数对**非空且合法输入**返回空结果，即为功能残缺。
**Prevents**: 把 "v1 stub 待实装" 的函数登记为 P2/P3 advisory 并 ship，导致"门禁看起来有，实际 no-op"（2026-05-10 审计：`loadOwnershipMap` 返回 `{}`，即使项目有 `.forge/context-ownership.yaml` 也读不到；Context Boundary Hook 因此大多数情况 no-op）
**Source**: 2026-05-10 三 Sprint 审计 — Sprint 3 R4 Context Boundary Hook
**Added**: 2026-05-10
**Confidence**: 0.85
**Last_triggered**: 2026-05-10
