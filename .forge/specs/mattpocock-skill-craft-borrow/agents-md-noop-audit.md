# AGENTS.md No-Op 体检清单

> 对应 spec Requirement 7（mattpocock/skill-craft-borrow）。
> 体检方法：用 mattpocock no-op 测试（"这行 vs 模型默认，行为有变吗？无变即 no-op"）逐句过 `AGENTS.md`。
> **铁律豁免**：所有 `<IRON-LAW>` 标记的强制纪律**不适用** no-op 测试——铁律价值是阻断语义，不是提示默认行为，全部保留。

## 体检范围

`AGENTS.md` 共 145 行，结构为：§1–6 各节标题 + 规则段 + "→ 详见 docs/..."指针。

## 分类结果

### A. 铁律（全部豁免，保留）— 4 处

| 行 | 标记 | 内容摘要 | 处理 |
|----|------|---------|------|
| 30 | `<IRON-LAW name="tdd-delete-and-restart">` | TDD RED→GREEN→REFACTOR | ✅ 保留（阻断语义） |
| 40 | `<IRON-LAW name="verification-run-command">` | 没运行验证=不能声明通过 | ✅ 保留（阻断语义） |
| 45 | `<IRON-LAW name="three-strike-reroute">` | 连续失败3次进 debug | ✅ 保留（阻断语义） |
| 50 | `<IRON-LAW name="no-mid-step-confirmation">` | 阶段间禁止停下确认 | ✅ 保留（阻断语义） |

### B. Forge 特定强制行为（非 no-op，保留）

这些指令描述 Forge **特有**的行为，模型默认不会做，故非 no-op：

| 行 | 内容 | 非 no-op 判据 |
|----|------|--------------|
| 11 | "所有任务通过 `/forge` 入口进入三级路由" | Forge 特有路由，非默认 |
| 17–19 | 三级路由条件 + 命令序列表 | Forge 特有 |
| 23 | 路由三原则（用户覆盖优先/宁重勿轻/不可跳步） | Forge 特有强制 |
| 35 | build 前三道门禁（Spec 锁定/Plan 批准/分支隔离） | Forge 特有门禁 |
| 55 | Context Refresh Checkpoint 每 N 任务重读 | Forge 特有机制 |
| 60 | Output Conciseness 散文 ≤200 tokens | Forge 特有阈值 |
| 65 | Scripts as Black Box 先 `--help` | Forge 特有约束 |
| 73 | Execution-Assessment Separation 不自评 | Forge 特有强制 |
| 87–90 | P0/P1 阻断 ship 语义 | Forge 特有分级 |
| 100 | `/forge learn` 五维度提取 | Forge 特有 |
| 104 | 知识库 20 上限 + Confidence<0.3 清理 | Forge 特有 |
| 117 | 会话开始读 evolved-rules.md | Forge 特有 |
| 130 | Session Boundaries + 100K tokens + 429 降级 | Forge 特有 |

### C. 指针（非 no-op，保留）— 12 处

形如 "→ 详见 docs/forge-constitution-detail.md §x" 的行。这些是**导航结构**（宪法摘要指向详情），非行为指令，不适用 no-op 测试，全部保留。

## D. 候选 No-Op（诚实评估：0 处）

**结论：AGENTS.md 无可删除的 no-op。** 

理由：
1. AGENTS.md 是高度精炼的宪法摘要，每条都是 Forge 特定强制行为或铁律，不存在"模型默认就会做"的冗余指令。
2. 大量"→ 详见"指针是必要的导航结构（progressive disclosure 的顶层），删除会破坏摘要→详情的跳转。
3. 这本身验证了 Forge 宪法的质量——没有 mattpocock 所警告的 no-op 沉淀。

## Context Load 降幅估算

- 删除行数：**0 行**
- Context load 降幅：**0**（无可删内容）
- 副产品：确认 AGENTS.md 不需要瘦身；no-op 体检方法论已文档化（见 detail "Skill Failure Modes" 小节）供未来新 skill 自审。

## 后续建议

- R7 的价值不在 AGENTS.md 本身（它已精炼），而在把 **no-op 测试方法论**作为自审工具沉淀（已在 detail 文档 Skill Failure Modes 小节落地），供未来写新 skill / 新 SKILL 时使用。
- 若要对其他 SKILL.md（如 skills/forge/lib/*/instructions.md）做 no-op 体检，可作为独立的 follow-up，不在本 spec 范围。
