---
status: draft
feature: cmux-diff-review
layout: requirements
created: 2026-06-13
tier: full
depends_on: [cmux-integration]
status_note: "Data-contract layer delivered 2026-06-13: R2 Finding_To_Comment_Map is a pure-function module at scripts/cmux-mirror/lib/finding-comment-map.mjs (findingToComment/commentToFinding/normalizeSeverity/buildCommentSetHandoff) with 12 passing property tests (severity totality, line fallback determinism, round-trip purity, handoff payload shape). R1 capabilities probe + Zero-Impact degrade reuse scripts/cmux-mirror/lib/availability.mjs. STILL BLOCKED on Implementation_Gate (kept draft): G1 (cmux read/write Review_Comment CLI/socket API) + G2 (attach-to-TextBox mechanism/encoding) depend on undocumented cmux 0.64.15 Beta APIs — not implementable until cmux documents them. R3/R4/R5 (the actual diff-viewer open + comment wiring + three-strike integration) depend on G1/G2."
---

# Requirements Document

## Introduction

本特性把 cmux 0.64.15 的 **Diff Viewer Review Comments**（在 diff viewer 按行评论、per-repo 持久化、把评论集 attach 到终端 TextBox 直送 agent）与 Forge 的 `/forge review` 三层评审双向打通，形成"人机协作评审"闭环：

- **方向 A（人 → agent）**：人类评审者在 cmux diff viewer 对变更行写评论，评论集结构化直送 Forge agent，作为 `/forge build` 修复或 `/forge review` Layer 补充输入。
- **方向 B（Forge → 人）**：`/forge review` 把目标 diff 在 cmux CodeView 原生 viewer 打开（`cmux diff`），并把 Forge 三层评审的结构化发现（per-file/per-line、P0–P3）呈现为 diff 行级标注，让人在 diff 上下文里直接看到 agent 的发现。

问题陈述：当前 `/forge review` 的三层（spec/quality/security）发现以 `.forge/reviews/<topic>.md` markdown + 桌面通知呈现，评审者需在"评审报告"与"代码 diff"两个视图间来回对照，行级定位成本高；而人类评审者对 agent 改动的行级意见又只能以自由文本 prompt 传达，缺少与 diff 行绑定的结构化通道。cmux 0.64.11 的 `cmux diff`（流式 CodeView diff viewer）+ 0.64.15 的 review comments + TextBox 直送，正好补这条行级双向通道。

价值来源：`cmux diff` CLI 已稳定可用（`--source unstaged|staged|branch|last-turn`、`--base`、`--layout`、`--title`、`--workspace/--surface/--window`），其中 `--last-turn`（自该 surface 上一次 agent-turn baseline 以来的变更）天然对接 `/forge review`"评审 agent 刚做的改动"。Forge 三层评审发现已有结构化 schema（severity P0–P3、per-layer、per-file）。二者结合让评审在 diff 上下文中发生。

业务价值：

1. 评审者行级意见结构化、与 diff 绑定、直送 agent——替代低带宽的自由文本 prompt。
2. Forge 评审发现在 diff viewer 内联呈现——替代"报告 ↔ diff"来回切换。
3. `cmux diff --last-turn` 让"评审 agent 本轮改动"一键可视化，契合宪法 §2.4 three-strike（连续失败 reroute 时保留失败链、在 diff 上分叉新假设）。
4. 零新运行时依赖：纯 `cmux diff` CLI + 既有 `.forge/reviews/` schema。

**关键约束**：

- **API-Deferral**：diff viewer review comments 的读写 API、attach-to-TextBox 的确切格式在 0.64.15 未进入 `cmux capabilities --json`（实测）且无独立文档。本 spec 锁定**数据契约**（评论 ↔ Forge finding 的映射、TextBox 载荷格式）与**集成语义**（何时打开 diff、何时回灌评论），把 cmux I/O API 标为 Implementation_Gate。沿用 `cmux-extension-sidebar` 的同一纪律。
- **Zero-Impact 继承**：未装 cmux / 不支持时，`/forge review` 行为与 `cmux-integration` R5 完全一致（markdown + 通知），diff 通道是可选增强。

## Glossary

- **Diff_Viewer**：cmux 0.64.11 的 CodeView diff viewer，经 `cmux diff` 打开，支持 `--source`/`--base`/`--layout`/`--last-turn` 等，流式渲染大 diff。
- **Review_Comment**：cmux 0.64.15 的 diff viewer 行级评论，per-repo 持久化；可把评论集 attach 到终端 TextBox 直送 agent。
- **Last_Turn_Diff**：`cmux diff --last-turn` —— 自该 surface 上一次 agent-turn baseline 以来的变更，天然对接"评审 agent 本轮改动"。
- **Comment_Set_Handoff**：把 Review_Comment 集合 attach 到终端 TextBox、结构化直送 Forge agent 的载荷（格式见 Requirement 3，锁契约，cmux 侧 attach 机制为 Implementation_Gate）。
- **Forge_Finding**：`/forge review` 三层产出的单条发现，已有 schema：`{layer, file, line?, severity (P0|P1|P2|P3), message}`（对齐 `cmux-integration` R5 + skills/forge-review/）。
- **Finding_To_Comment_Map**：Forge_Finding ↔ Review_Comment 的稳定映射（Requirement 2 锁定）：`{file, line, severity, message, source_layer}`。
- **Diff_Review_Skill**：本特性新增的可选 SKILL（collapsed sub，路径 `skills/forge/lib/forge-cmux-diff-review/instructions.md`），受 `cmux-skills-collapse` 的 Conditional_Availability_Gate 约束（cmux 不可用 → SKILL_UNAVAILABLE）。
- **Implementation_Gate**：cmux 侧未稳定/未文档化的开放点：(G1) 读写 Review_Comment 的 CLI/socket API；(G2) attach-to-TextBox 的确切机制与载荷编码；(G3) per-repo 评论存储位置与 Forge 读取方式。数据契约与集成语义不受 Gate 影响。

## Requirements

### Requirement 1: capabilities 探测与降级到既有评审呈现

**User Story:** 作为未装 cmux 或运行不支持 review comments 版本的用户，我希望 `/forge review` 行为完全不变（markdown + 通知），diff 通道静默不可用。

#### Acceptance Criteria

1. THE Diff_Review_Skill SHALL 在分发时经 `cmux-skills-collapse` 的 Conditional_Availability_Gate 判定 cmux 可用；不可用时回 `SKILL_UNAVAILABLE`，不加载 instructions.md。
2. THE Diff_Review_Skill SHALL 进一步探测 `cmux diff` 与 Review_Comment 能力（`cmux capabilities --json` 或 `cmux diff --help` 含 `--last-turn`）；任一缺失时 SHALL 降级为仅"打开 diff viewer 只读"（Requirement 4）或完全跳过，不阻断 `/forge review` 主流程。
3. THE Zero_Impact_Invariant SHALL 成立：diff 通道不可用时，`.forge/reviews/<topic>.md` 产物、frontmatter（`cmux-integration` R15 的 layers_status/completed_at）、桌面通知与 `cmux-integration` R5 逐字节一致。
4. THE Feature_Flag `cmux_diff_review`（新增可选 frontmatter，`auto`|`on`|`off`）SHALL 控制本特性；计入 `cmux-integration` R11.9 frontmatter 预算复核。
5. WHEN `cmux_diff_review: on` 且能力缺失，THE skill SHALL 输出一次性 stderr 警告并降级。

### Requirement 2: Finding_To_Comment_Map — Forge 发现 ↔ diff 行评论的数据契约

**User Story:** 作为 Forge 维护者，我希望 Forge_Finding 与 Review_Comment 之间有稳定映射，使双向流转有唯一解释、可属性测试。

#### Acceptance Criteria

1. THE Finding_To_Comment_Map SHALL 定义双向映射：
   - Forge_Finding → Review_Comment：`file`→file、`line`→line（缺失时 fallback 到文件首行或 hunk 头）、`severity`→评论标签/severity、`message`→评论正文、`source_layer`(spec/quality/security)→评论来源标记。
   - Review_Comment → Forge_Finding：评论正文→message、评论行→file+line、评论作者标记的严重度（若无则默认 P2）→severity、来源标记→source_layer（若无则 `human`）。
2. THE severity 双向映射 SHALL 全量覆盖 P0|P1|P2|P3（对齐 `cmux-integration` R5.1 的三层 verdict 映射与 skills/forge-review/ 严重度）；域外值 SHALL 映射到 P2 且不报错。
3. THE 映射 SHALL 是纯函数（同输入→同输出），支持 fast-check 属性测试（对齐 `cmux-integration` R12 风格）：(a) 双射在 severity 域内无信息损失；(b) file/line 缺失时 fallback 确定性。
4. THE 映射 SHALL NOT 引入新严重度等级或新 layer；复用既有 Forge 评审 taxonomy。
5. THE 映射模块 SHALL 位于 `scripts/cmux-mirror/lib/`（对齐 `cmux-integration` R10 的脚本层定位），不进 `src/`。

### Requirement 3: Comment_Set_Handoff 载荷格式（人 → agent）

**User Story:** 作为在 cmux diff viewer 写了行级评论的评审者，我希望这些评论以结构化、可解析的载荷直送 Forge agent，而不是自由文本 prompt。

#### Acceptance Criteria

1. THE Comment_Set_Handoff 载荷 SHALL 是一个有序的 Forge_Finding 列表（经 Requirement 2 的 Review_Comment→Finding 映射），序列化为 agent 可解析的结构化格式（JSON 代码块或 fenced 结构化块），附在 agent 的终端 TextBox / prompt 上下文。
2. THE 载荷 SHALL 包含元信息：`topic`、`source: "cmux-diff-review"`、`count`、生成时间戳；每条含 `{file, line, severity, message, source_layer}`。
3. THE 载荷 SHALL 经 `cmux-integration` R14.8 同款 redaction（评论正文中匹配 secret pattern 的内容 → `[REDACTED]`）后再交付 agent。
4. WHEN agent 接收该载荷，THE `/forge build` 或 `/forge review` SHALL 把它视为与 `.forge/reviews/<topic>.md` 同等的评审输入（结构化发现），按既有 P0/P1 阻断规则处理（宪法 §3.3）。
5. THE cmux 侧"attach 评论集到 TextBox"的确切机制（按钮 / CLI / socket）与编码（JSON vs fenced）为 Implementation_Gate (G2)；载荷 schema 在本 spec 锁定，不受 G2 影响。

### Requirement 4: 方向 B — `/forge review` 打开目标 diff（Forge → 人）

**User Story:** 作为 `/forge review` 的发起者，我希望评审启动时 cmux 在原生 diff viewer 打开本次评审目标的 diff，并把 Forge 三层发现在 diff 行级呈现，让我在 diff 上下文里看 agent 的发现。

#### Acceptance Criteria

1. WHEN `/forge review` 启动且 Diff_Review_Skill 可用，THE skill SHALL 调用 `cmux diff` 打开评审目标 diff：默认 `--source branch --base <merge-base>`（PR 评审场景）或 `--last-turn`（评审 agent 本轮改动场景，由 `/forge review` 上下文决定）。
2. THE `cmux diff` 调用 SHALL 附加 `--workspace`/`--surface`/`--window`（复用 `cmux-integration` R4.9 / cli.mjs 的 `--window` 注入）以精准定位，并设 `--title "Forge Review · <topic>"`。
3. THE Forge 三层发现（`.forge/reviews/<topic>.md`）SHALL 经 Finding_To_Comment_Map 映射后，在 diff viewer 以行级评论形式呈现（方向 B 的"回灌"）；cmux 侧写入评论的 API 为 Implementation_Gate (G1)，不可用时降级为"仅打开只读 diff + 评审报告 markdown"。
4. WHEN diff 为空（无变更），THE skill SHALL 不打开空 diff viewer（避免 0.64.13 已修的 "no diff beep"），仅在 sidebar log 记 `no changes to review`。
5. THE 打开 diff 与回灌评论 SHALL NOT 修改 `.forge/reviews/<topic>.md` 内容（它是 source of truth；diff viewer 是呈现层，对齐 `cmux-integration` Out of Scope #7）。

### Requirement 5: three-strike 协同与失败链保留

**User Story:** 作为触发宪法 §2.4 three-strike reroute 的用户，我希望 cmux diff + review comments 能保留失败链、在 diff 上分叉新假设，零代码变更。

#### Acceptance Criteria

1. WHEN `/forge debug` 触发（三连失败），THE Diff_Review_Skill SHALL 能用 `cmux diff --last-turn` 展示失败 turn 的改动，并允许评审者在 diff 上 fork 对话（对齐 cmux `conversation fork`，`cmux-integration` 已文档化）保留原链。
2. THE 本特性 SHALL NOT 自动触发 fork——仅提供"在 diff 上看到失败改动 + 评论"的能力；fork 由用户显式发起（对齐 `cmux-integration` 对 conversation fork 的 opt-in 定位）。
3. THE Comment_Set_Handoff 在 debug 场景 SHALL 标注 `source_layer: "debug"`，使 agent 区分评审反馈与 debug 假设。

## Out of Scope

1. **cmux review-comment I/O API 的稳定化** — 读写评论、attach-to-TextBox 机制 (G1/G2) 在 0.64.15 未文档化；本 spec 锁数据契约，延后 API 面。
2. **替换 `.forge/reviews/<topic>.md`** — 它仍是 source of truth（对齐 `cmux-integration` Out of Scope #7）；diff viewer 是呈现与输入层。
3. **自动把人评论合入评审报告** — 人评论作为 agent 输入，是否落盘进 reviews.md 由 `/forge review`/`/forge build` 既有逻辑决定，本特性不强制。
4. **非 cmux 平台等价** — cmux-only。
5. **跨 repo 聚合评论** — per-repo 持久化（cmux 语义），不聚合。
6. **CI 内端到端 diff 渲染测试** — CI 仅做 Finding_To_Comment_Map 属性测试 + `cmux diff --help` 能力探测（对齐 `cmux-integration` Out of Scope #8）。
