# Design Document — cmux-diff-review

> 配套 `requirements.md`。锁双向数据流与契约；cmux review-comment I/O API 标为 Implementation_Gate。

## 1. 定位

cmux 0.64.11 的 `cmux diff`（CodeView diff viewer，实测 CLI 已稳定：`--source`/`--base`/`--last-turn`/`--layout`/`--title`）+ 0.64.15 的 Review_Comment（行评论、per-repo 持久化、attach-to-TextBox 直送 agent）= 一条 diff 上下文内的行级双向评审通道。Forge `/forge review` 三层发现已有结构化 schema。本特性把两者接成闭环。

## 2. 双向数据流

```
方向 A：人 → agent
┌────────────────────────┐    Review_Comment (行级)        ┌──────────────────────┐
│ cmux Diff Viewer       │ ──────────────────────────────▶ │ Comment_Set_Handoff  │
│ 评审者在变更行写评论     │   (G1 API: 读评论集)            │ (R3 载荷, redacted)  │
│ attach to TextBox ────▶│ ──────────────────────────────▶ │ → Forge agent 输入   │
└────────────────────────┘   (G2 API: attach-to-TextBox)   └──────────────────────┘
                                                                  │ 等同评审输入
                                                                  ▼
                                                          /forge build|review (既有 P0/P1 阻断)

方向 B：Forge → 人
┌────────────────────────┐  Forge_Finding[] → 映射           ┌──────────────────────┐
│ /forge review 启动      │ ──────────────────────────────▶ │ cmux diff 打开目标    │
│ 读 .tinkerman/reviews/*.md │   (R2 Finding_To_Comment_Map)    │ diff (--branch/--last-turn)
│ + cmux diff --last-turn│                                  │ 行级呈现三层发现 (G1) │
└────────────────────────┘                                  └──────────────────────┘
```

两方向共享 Requirement 2 的 `Finding_To_Comment_Map`（唯一映射源），保证双向流转语义一致。

## 3. 关键设计决策

### 3.1 锁数据契约、延后 cmux I/O API（API-Deferral）

实测：`cmux capabilities --json` 在 0.64.15 **未列出** diff/review/comment 相关方法；`cmux diff` CLI 已稳定但 Review_Comment 的读写/attach 机制无文档。因此：

- **锁**：Finding_To_Comment_Map（R2）、Comment_Set_Handoff 载荷 schema（R3）、何时打开 diff（R4）、降级链（R1）。
- **延后（Implementation_Gate）**：
  - (G1) 读/写 Review_Comment 的 CLI 或 socket API（实现前 probe `cmux diff`、`cmux review`、capabilities、socket 方法表）。
  - (G2) attach-to-TextBox 的触发（按钮/CLI/socket）与编码（JSON vs fenced）。
  - (G3) per-repo 评论存储位置与 Forge 读取方式（changelog 称 per-repo 持久化，但存储路径未公开）。

理由同 `cmux-extension-sidebar`：锁稳定面（Forge finding schema + `cmux diff` CLI）、延后不稳定面（review-comment I/O），避免重演 `templates/cmux.json` 的 schema 漂移。

### 3.2 `--last-turn` 是与 Forge 的天然接点

`cmux diff --last-turn`（"自该 surface 上一次 agent-turn baseline 以来的变更"）直接表达"评审 agent 本轮做了什么"——这是 `/forge review` 最常见的场景（评审刚 build 出来的改动）。`--branch --base <merge-base>` 覆盖 PR 评审场景。两个 source 覆盖 90% 用例，无需更复杂 diff 构造。

### 3.3 人评论 = 结构化评审输入（不是自由 prompt）

方向 A 的价值核心：把人评审从"写一段自由文本 prompt"升级为"在 diff 行上标 P-level + 评论 → 结构化 Forge_Finding 载荷直送 agent"。agent 收到后按既有 P0/P1 阻断规则（宪法 §3.3）处理——与 `.tinkerman/reviews/<topic>.md` 同等地位。这让"人机协作评审"的语义统一。

### 3.4 Zero-Impact 与降级链

```
Conditional_Availability_Gate (cmux-skills-collapse, cmux 不可用 → SKILL_UNAVAILABLE)
  └─ cmux 可用 → 探测 cmux diff + Review_Comment 能力
       ├─ 都有 → 双向闭环（方向 A + B）
       ├─ 仅 cmux diff（无 Review_Comment）→ 方向 B 只读（打开 diff + markdown 报告），方向 A 不可用
       └─ 都无 → 完全跳过，/forge review = cmux-integration R5 原样
```

最坏情况退化为既有评审呈现，Forge 行为不变。

## 4. SKILL 落点与分发

- 物理路径：`skills/forge/lib/forge-cmux-diff-review/instructions.md`（对齐 `cmux-skills-collapse` collapsed dispatcher 约定 + `cmux-extension-sidebar`/既有三个 cmux sub 风格）。
- 分发：加入 `Cmux_Gated_Subs` 集合（`cmux-skills-collapse` R2），经 Conditional_Availability_Gate 判定。
- description 字段遵循 `.claude/rules/cso-description-gate.md`（"Use when" 开头、仅触发条件）。
- 与既有三个 cmux sub（sidebar-sync/browser-qa/loop-signals）平级，无耦合。

## 5. 备选方案与拒绝理由

| 方案 | 拒绝理由 |
|------|---------|
| 把人评论直接写进 `.tinkerman/reviews/*.md` | 改 source of truth、混淆 agent 产物与人输入；评论应作为 agent 输入，落盘与否由既有逻辑决定（Out of Scope #3） |
| 不锁 Finding_To_Comment_Map，自由转换 | 双向流转语义不一致、不可属性测试；锁映射是本特性的正确性核心 |
| 等待 cmux review-comment API 文档化再写 spec | 数据契约、降级、`cmux diff` 集成现在就能锁；G1–G3 已隔离 |
| 方向 A 走自由文本 prompt | 正是要淘汰的低带宽通道；结构化载荷是价值来源 |
| 自动 fork 失败链 | 违反 opt-in（对齐 `cmux-integration` conversation fork 定位）；R5.2 仅提供能力 |

## 6. 验证策略

- **属性测试**（TS，CI）：Finding_To_Comment_Map 双射、severity 全量覆盖、redaction 应用——不依赖 cmux I/O API。
- **能力探测 smoke**（cmux 可用时）：`cmux diff --help` 含 `--last-turn`；capabilities 含/不含 review-comment 方法（记录 G1 状态）。
- **端到端**：不在 CI；实现阶段在 cmux 0.64.15 开发机人工验收方向 A/B。

## 7. 开放问题

1. Review_Comment 的 severity 是否原生支持，还是用评论正文前缀（如 `[P1]`）编码？影响 R2 severity 双向映射的实现（G1）。
2. Comment_Set_Handoff 走 TextBox attach 还是 socket 直送 agent？前者需 cmux UI 操作，后者需 socket 方法（G2）。
3. 多 surface（多 agent）并发评审时，`--last-turn` baseline 如何对齐到正确 surface——需复用 `--workspace`/`--surface` 精准定位（R4.2）。
