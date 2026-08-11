---
updated: 2026-08-11
---
# Context Budget Management — 安全执行 + 内容隔离 + 上下文预算

> 解决 Forge 在标准/全量路径下的上下文爆炸问题。Forge MCP 不再承担压缩职责（已移交 Headroom）；本文件描述 Forge 保留的**安全执行边界**、**内容隔离**和**上下文预算监控**。
>
> 定位变更：历史上的"五层上下文防御体系"中，Layer 1（Read 去重缓存 `forge_read_cached`）已移除——其职责由 Headroom 的对话压缩间接覆盖。压缩不再是 Forge 的工作；Forge 守住"什么内容该进上下文 / 执行是否安全"。

## 压缩职责分工（Forge vs Headroom）

Forge MCP 与 Headroom **零功能重叠，互补不冗余**：

| 层 | 谁负责 | 做什么 |
|----|--------|--------|
| 对话历史压缩 | **Headroom**（wrap 模式） | 压缩对话历史 + tool 输出 + 模型写回。实测（v0.26.0）：失败输出 `router:protected:error_output` 零压缩、diff `router:noop` 零压缩、Structured Output 压 ~50%（有 CCR 兜底） |
| 安全执行 | **Forge MCP**（`forge_exec`） | 只读 allowlist + 防 shell 注入 + 进程树清理（超时杀子进程）。Headroom 是压缩器，不碰命令执行安全 |
| 内容隔离 | **Forge MCP**（`forge_read`） | 沙箱内结构化分析（imports/contains/line_count/json_keys），文件原文**根本不进上下文**——比"压缩后进"更彻底 |
| 确定性输出 | **Forge MCP**（`forge_git`/typed-capabilities） | 结构化 JSON，可被下游反序列化解析；Headroom 的压缩是非确定性的，Forge 无法解析压缩后的输出 |

> Forge 不自带压缩算法。`forge_exec` 的 `trimCommandOutput` 仅作为 **Headroom 未启用时的 fallback**（成功输出 >30 行裁剪关键行）；用户运行 `headroom wrap claude` 时，成功输出原样过，由 Headroom 在 HTTP 层压。

## 上下文预算监控（四层运行时防护）

```
Layer 1: 阶段隔离 ──────────────── 消除跨阶段累积（-50% 总累积）
  Phase Boundary Gate + /clear + /tinkerman resume

Layer 2: Subagent 文件化返回 ────── 减少 agent 结果占用（-80% agent 返回）
  Write to .tinkerman/reviews/ + 800 char 摘要返回

Layer 3: Resume 上下文最小化 ────── 减少恢复时的加载量
  --phase 参数按阶段过滤注入内容

Layer 4: Read 预算监控 ──────────── 运行时防护
  PostToolUse hook + 阈值预警
```

## Layer 1: 阶段隔离

### Phase Boundary Gate

每个 task 或 phase 完成后检查 Read 预算：

| 累积 Read | 等效上下文 | 行为 |
|-----------|-----------|------|
| < 100 KB | ~60% | 继续下一 task |
| 100–150 KB | 60–80% | ⚠️ 建议 `/clear + /tinkerman resume`，继续执行 |
| > 150 KB | >80% | ⛔ 必须停止，执行 `/clear + /tinkerman resume` |

### 阶段间状态桥接

```
.tinkerman/progress/<topic>.md  — 任务状态
.tinkerman/plans/<topic>.md     — 计划（最小化读取）
.tinkerman/reviews/<layer>.md   — 评审结果（文件化返回）
.tinkerman/status.md            — 当前阶段 + 分支
```

## Layer 2: Subagent 文件化返回

### 返回协议

Subagent 完整报告 Write 到 `.tinkerman/reviews/<layer>-<YYYYMMDD-HHmmss>.md`，仅返回 ≤800 chars 摘要：

```
status: <pass|fail>
findings: <total_count>
p0: <count>
p1: <count>
report: .tinkerman/reviews/<layer>-<timestamp>.md
```

### 主 Agent 处理

- p0>0 或 p1>0 → Read 完整报告
- p0=0 且 p1=0 → 不读取，仅基于摘要
- 综合报告仍输出到 `.tinkerman/reviews/<timestamp>-combined.md`

→ 详见 `skills/tinkerman/lib/review/references/subagent-return-protocol.md`

## Layer 3: Resume 上下文最小化

### 按阶段最小加载清单

| 阶段 | 必须加载 | 最大 tokens | 不加载 |
|------|----------|-----------|--------|
| build | plan（仅未完成 task）+ progress + status | ~3K | spec 全文、decide 产物 |
| review | spec（仅 AC 列表）+ diff stat + progress | ~5K | build 源码读取历史 |
| test | progress + 测试文件路径列表 | ~2K | build 实现细节、review 全文 |
| ship | progress + review 摘要 + branch status | ~2K | 完整 review 报告 |

### inject-plan-context --phase <phase>

`--phase build`：仅未完成 task
`--phase review`：仅 headers + task 列表
`--phase test`/`--phase ship`：仅 task 标题
`--compact`：去掉行内描述

## Layer 4: Read 预算监控

### PostToolUse Hook

`scripts/track-read-budget.mjs` 在每次 Read 后追踪累积字符数：
- >100 KB → ⚠️ 警告
- >150 KB → ⛔ 强制建议 /clear
- fail-open：不阻断任何工具调用

### MCP 工具（安全 + 隔离职责）

| 工具 | 职责 | 替代 |
|------|------|------|
| `forge_exec` | 安全执行只读命令 + Iron Law 失败放行（成功输出 >30 行时 fallback 裁剪） | 直接 Bash |
| `forge_git` | Git 查询摘要化（确定性输出，可反序列化） | 直接 git |
| `forge_read` | 沙箱结构化文件分析（imports/contains/line_count，原文不进上下文） | 批量 Read |

---

## Hard Token Limits (Iron Law)

以下限制是**强制性约束**，在每个工具输出边界执行。

| Source | Trigger | Max Tokens | Mandatory Action |
|--------|---------|-----------|-----------------|
| Explore Agent results | Always | 300 | MUST truncate to structured summary |
| Subagent execution results | Always | 200 | MUST replace full transcript with extract |
| Test output (all pass) | All tests pass | 50 | MUST replace with single line |
| Test output (failures) | Any test fails | 300 | MUST keep only failure names + error messages |
| Git diff | >50 lines | 200 | MUST replace with file-level summary |
| Git status | >30 files | 200 | MUST replace with categorized summary |
| Command output | >100 lines | 200 | MUST keep last 20 lines + error/warning patterns |

> 注：当用户运行 `headroom wrap claude` 时，Iron Law 的失败输出保护由两层独立保障——forge_exec 的 `formatFailureOutput`（进程层）+ Headroom 的 `router:protected:error_output`（HTTP 层实测零压缩）。两者互不依赖。

## Structured Output Exemption

All Structured_Output formats are **exempt** from truncation:
- TDD phase markers (🔴 RED / 🟢 GREEN / 🔵 REFACTOR)
- P5 evidence chains
- Restatement summaries
- Closure-First Probe results
- Review reports

> ⚠️ Headroom 注意：实测中 Structured Output（如 R2 Handoff Block）会被 Headroom 的 `router:tool_result:text` 压缩 ~50%，删除部分验证元数据（`procedure_compliance`/`INV-*`），但核心进展字段保留，且末尾附 CCR hash 可检索原文。影响有限，不采取特殊措施（code fence 伪装已实测无效，`DISABLE_KOMPRESS` 得不偿失）。

## Context Exhaustion Detection Rules

### Heuristic Detection

**必须在每个 Restatement Checkpoint 执行上下文耗尽自检**：

1. 完成 Restatement 3-block 摘要后，自问："能否不重读 progress 文件回忆最近 3 个完成的任务？"
2. NO → 触发 Context Exhaustion Protocol（SKILL.md §11）
3. YES → 正常继续

### Quantitative Signal

上下文利用率 >80% → 主动触发协议。模型不暴露利用率指标时，依赖 Heuristic Detection。

### Anti-pattern: Manual Handoff

```
# FORBIDDEN — 手动交接
下一个会话剩余任务：
1. Task 5: ...
2. Task 6: ...
要继续构建，请在新会话中运行 /tinkerman build
```

正确做法：写入 interim 文件并自动调用 `/tinkerman resume`，详见 SKILL.md §11。
