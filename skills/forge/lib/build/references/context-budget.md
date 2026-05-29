# Context Budget Management — 五层上下文防御体系

> 解决 Forge 在标准/全量路径下的上下文爆炸问题。通过五层防御将单阶段 context 从 ~280 KB 降至 ~60 KB。

## 五层防御概览

```
Layer 1: Read 去重缓存 ─────────── 消除重复读取（-40% Read）
  forge_read_cached MCP tool + Read Dedup Iron Law

Layer 2: 阶段隔离 ──────────────── 消除跨阶段累积（-50% 总累积）
  Phase Boundary Gate + /clear + /forge resume

Layer 3: Subagent 文件化返回 ────── 减少 agent 结果占用（-80% agent 返回）
  Write to .forge/reviews/ + 800 char 摘要返回

Layer 4: Resume 上下文最小化 ────── 减少恢复时的加载量
  --phase 参数按阶段过滤注入内容

Layer 5: Read 预算监控 ──────────── 运行时防护
  PostToolUse hook + 阈值预警
```

## Layer 1: Read 去重缓存

### 工具

- **`forge_read_cached` MCP tool**：首次返回完整内容，后续未修改返回 `[cached]` 消息，已修改返回 diff
- **Read Dedup Iron Law**：同一文件 Read ≤2 次/session，第 2 次起必须用 `forge_read_cached` 或 `Grep`

### 使用指引

```
首次读取 → 使用 Read 工具（正常）
回顾已读文件 → 使用 forge_read_cached(path)
搜索特定片段 → 使用 Grep(path, pattern)
```

### 降级策略

`forge_read_cached` 不可用时：手动控制同一文件 Read ≤2 次，用 Grep 替代全量重读。

## Layer 2: 阶段隔离

### Phase Boundary Gate

每个 task 或 phase 完成后检查 Read 预算：

| 累积 Read | 等效上下文 | 行为 |
|-----------|-----------|------|
| < 100 KB | ~60% | 继续下一 task |
| 100–150 KB | 60–80% | ⚠️ 建议 `/clear + /forge resume`，继续执行 |
| > 150 KB | >80% | ⛔ 必须停止，执行 `/clear + /forge resume` |

### 阶段间状态桥接

```
.forge/progress/<topic>.md  — 任务状态
.forge/plans/<topic>.md     — 计划（最小化读取）
.forge/reviews/<layer>.md   — 评审结果（文件化返回）
.forge/status.md            — 当前阶段 + 分支
```

## Layer 3: Subagent 文件化返回

### 返回协议

Subagent 完整报告 Write 到 `.forge/reviews/<layer>-<YYYYMMDD-HHmmss>.md`，仅返回 ≤800 chars 摘要：

```
status: <pass|fail>
findings: <total_count>
p0: <count>
p1: <count>
report: .forge/reviews/<layer>-<timestamp>.md
```

### 主 Agent 处理

- p0>0 或 p1>0 → Read 完整报告
- p0=0 且 p1=0 → 不读取，仅基于摘要
- 综合报告仍输出到 `.forge/reviews/<timestamp>-combined.md`

→ 详见 `skills/forge/lib/review/references/subagent-return-protocol.md`

## Layer 4: Resume 上下文最小化

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

## Layer 5: Read 预算监控 + 精细化工具

### PostToolUse Hook

`scripts/track-read-budget.mjs` 在每次 Read 后追踪累积字符数：
- >100 KB → ⚠️ 警告
- >150 KB → ⛔ 强制建议 /clear
- fail-open：不阻断任何工具调用

### 精细化 MCP 工具（已有）

| 工具 | 用途 | 替代 |
|------|------|------|
| `forge_exec` | Bash 输出裁剪（≤30 行自动截断） | 直接 Bash |
| `forge_git` | Git 查询摘要化 | 直接 git |
| `forge_read` | 批量文件分析（脚本处理） | 批量 Read |
| `forge_read_cached` | 单文件读取 + 去重缓存 | 重复 Read |

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

## Structured Output Exemption

All Structured_Output formats are **exempt** from truncation:
- TDD phase markers (🔴 RED / 🟢 GREEN / 🔵 REFACTOR)
- P5 evidence chains
- Restatement summaries
- Closure-First Probe results
- Review reports

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
要继续构建，请在新会话中运行 /forge build
```

正确做法：写入 interim 文件并自动调用 `/forge resume`，详见 SKILL.md §11。
