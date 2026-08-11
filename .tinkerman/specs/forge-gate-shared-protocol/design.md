---
feature: forge-gate-shared-protocol
layout: design
created: 2026-06-04
---

# Design Document: Gate 共享协议提取

## 一、问题

`/forge decide` 的 Reframing Gate 和 `/forge spec` 的 Clarification Gate 有 4/5 子节结构近乎相同：

| 子节 | decide (Round 0.5) | spec (Step 0.5) | 相似度 |
|------|-------------------|-----------------|--------|
| Tier 路由 | ✅ 3 行表格 | ✅ 3 行表格（完全相同） | 100% |
| 提问方式 | ✅ AskUserQuestion | ✅ AskUserQuestion | 95% |
| 回答注入 | ✅ Context block | ✅ Context block | 90% |
| 反馈记录 | ✅ JSONL 日志 | ✅ JSONL 日志 | 90% |
| 问题选择算法 | ✅ decide 特定 | ✅ spec 特定 | **0%** |

问题选择算法是唯一不同的部分。其余 4 个子节每次修改（如添加 sanitize、slug 校验、超时）都需要同时改两个文件，漂移风险高。

## 二、设计决策

### D1 — 提取为共享 reference

**选择**：创建 `skills/forge/lib/shared/references/gate-protocol.md`

**理由**：
- Forge 已有 `references/` 惯例（decide 有 `references/perspective-formats.md`，spec 有 `references/quality-standards.md`）
- 不新增 skill，只是 markdown 文档
- decide/spec 各自的 instructions.md 引用共享协议，保留各自的"问题选择算法"

### D2 — 参数化

共享协议定义以下参数，由调用方（decide/spec）传入：

| 参数 | decide 值 | spec 值 |
|------|----------|---------|
| `gate_name` | Reframing Gate | Clarification Gate |
| `max_questions` | 3 | 5 |
| `time_budget` | 1 min | 2 min |
| `injection_label` | Reframing Context | Clarification Context |
| `log_filename` | `*-reframing.jsonl` | `*-clarification.jsonl` |
| `skip_option_text` | 跳过，直接分析 | 跳过 |

## 三、Blueprint Delta

| 路径 | 改动 |
|------|------|
| `skills/forge/lib/shared/references/gate-protocol.md` | **新增** — 共享 Gate 协议 |
| `skills/forge/lib/decide/instructions.md` | **修改** — 删除 4 个子节，引用 `gate-protocol.md` |
| `skills/forge/lib/spec/instructions.md` | **修改** — 删除 4 个子节，引用 `gate-protocol.md` |

文件数净变化：新增 1，修改 2，删除 0。
