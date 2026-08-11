---
status: superseded
status_note: track-read-budget.mjs @deprecated, superseded by CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60. Context budget library exists but runtime enforcement via auto-compact.
feature: context-explosion-defense
layout: requirements
created: 2026-05-30
tier: standard
---
# Context Explosion Defense — 需求文档

## 引言

Forge 在标准/全量路径下的上下文消耗远超预期。以 PID 10793（subagent-truncation-fix，一个中小型需求）为实证：

| 上下文消费者 | 大小 | 占比 | 根因 |
|---|---|---|---|
| **Read 结果** | 214 KB（29 次调用） | ~65% | review.ts 被读 10 次，无去重 |
| **Bash 结果** | 66 KB（51 次调用） | ~20% | 未使用 forge_exec 裁剪 |
| **Agent 定义** | 75 KB（21 个 agent） | ~10% | 全量加载，不区分阶段 |
| **Skill 指令** | ~31 KB | ~5% | build instructions + references |
| **CLAUDE.md + rules** | ~14 KB | ~2% | 每个 session 加载 |

一个小需求已达 75% 上下文。全量路径（8 阶段）或大需求（多 wave 任务）必然溢出。

### 已有优化措施为何不够

| 已有 Spec | 做了什么 | 未解决什么 |
|---|---|---|
| `context-optimization` | forge-context MCP（forge_exec/git/read 服务端裁剪） | 只裁剪 Bash/Git 单次输出；Read 累积不变 |
| `token-budget-compression` | SKILL 文档 178K→≤145K | 静态文本压缩；运行时累积不变 |
| `forge-slimming-plan` | T1/T2/T3 委托给官方原语 | 减少 surface，不改变上下文使用模式 |
| `subagent-truncation-fix` | review subagent 结果截断修复 | 窄修复，不影响主 agent Read 累积 |
| `subagent-hook-context-budget` | Hook 注入 subagent 上下文上限 | 限制 hook context，不限制主 agent Read |

**根因**：所有优化都在"压缩单次输出"，但真正的瓶颈是**累积效应** — 同一文件被反复 Read，所有阶段产物堆积在同一个 context window 中无法驱逐。

### 解决思路转变

| 维度 | 旧思路 | 新思路 |
|---|---|---|
| 策略 | 压缩单次输出大小 | 减少重复输入 + 阶段隔离 |
| 生命周期 | 单 session 全流程 | 每阶段独立 session，文件系统桥接 |
| Subagent 返回 | 内联全量返回 | 文件化返回 + 摘要 |
| Agent 加载 | 全量 21 个 agent | 按阶段懒加载 |
| 监控 | 无 | 实时 Read 预算追踪 |

## 术语

- **Read Budget**：单个 session 中允许的 Read 工具累积 token 上限。超过阈值触发预警或强制阶段隔离。
- **Read Dedup**：基于 git hash 的文件读取去重机制。同一文件在未修改时不会再次返回完整内容。
- **Phase Boundary**：Forge 工作流中阶段之间的上下文隔离点。隔离点处执行 `/clear` + `/forge resume`，确保阶段间不堆积。
- **File-Based Return**：Subagent 将完整结果写入 `.tinkerman/` 文件系统，仅向主 agent 返回结构化摘要。
- **Agent Lazy Load**：按当前阶段只加载相关 agent 定义到 system prompt，其余不注入。
- **Cumulative Read Tracker**：session 级的 Read 累积追踪器，维护已读文件索引和 token 预算。

## 需求

### Requirement 1: Read 去重缓存（forge_read_cached MCP Tool）

**User Story:** 作为 Forge 开发者，我希望同一文件不会被反复读取进入上下文，以消除 Read 结果累积这一最大上下文消费者（占 65%）。

#### 验收标准

1. THE forge-context MCP server SHALL 新增 `forge_read_cached` tool，接受参数：`path`（string，必填）、`start_line`（number，可选）、`end_line`（number，可选）。
2. THE `forge_read_cached` tool SHALL 维护 session 级已读文件索引（path → git_hash + line_range），索引存储于 `${TMPDIR}/forge-read-cache-<session>.json`。
3. WHEN `forge_read_cached` 被调用且目标文件的 git hash 与索引中的 hash 相同且 line range 被包含，THE tool SHALL 返回 `[cached] <path>: unchanged since last read (<n> chars)` 而非文件内容。
4. WHEN git hash 不同（文件已修改），THE tool SHALL 只返回 diff 部分（`git diff <old_hash> <new_hash> -- <path>`）而非全量内容。
5. WHEN 目标文件不在 git 追踪中（untracked），THE tool SHALL 使用文件内容的 SHA-256 hash 作为缓存 key，并在 hash 不变时返回 cached 消息。
6. THE `forge_read_cached` tool SHALL 支持首次读取时正常返回完整内容并更新缓存索引。
7. THE 缓存索引 SHALL 在 session 结束时清理（临时文件随 TMPDIR 自动清理）。

### Requirement 2: Read Dedup Iron Law

**User Story:** 作为 Forge 开发者，我希望 SKILL 文档中明确禁止对同一文件的重复读取，以从规则层面杜绝 Read 累积。

#### 验收标准

1. THE `skills/forge/lib/build/instructions.md` SHALL 新增 "Read Dedup Iron Law" 段落，声明：在同一个 session 中对同一文件的 Read 调用不得超过 2 次。
2. THE Read Dedup Iron Law SHALL 要求第 2 次起必须使用 `forge_read_cached`（MCP tool）或 `Grep`（定向搜索）替代完整 Read。
3. THE Read Dedup Iron Law SHALL 适用于 `/forge build`、`/forge review`、`/forge test` 三个指令的 instructions.md。
4. WHEN 主 agent 需要回顾之前读取过的文件内容，THE SKILL 文档 SHALL 引导主 agent 使用 Grep 搜索特定片段而非全量重读。

### Requirement 3: 阶段级会话边界强制

**User Story:** 作为 Forge 开发者，我希望每个阶段完成后自动评估上下文使用率，在超过阈值时强制执行阶段隔离，以防止多阶段产物堆积。

#### 验收标准

1. THE `/forge build` instructions.md 的 phase-advance 逻辑 SHALL 在每个 task 或 phase 完成后检查上下文预算。
2. WHEN 上下文使用率超过 60%，THE phase-advance 逻辑 SHALL 输出 `⚠️ Context usage >60%. Execute /clear then /forge resume to continue.` 并停止继续执行当前 session。
3. WHEN 上下文使用率超过 80%，THE phase-advance 逻辑 SHALL 输出 `⛔ Context usage >80%. MUST /clear + /forge resume. Continuing will cause truncation.` 并停止执行。
4. THE `/forge review` instructions.md SHALL 在 review 完成后检查上下文使用率，如果后续还有 test/ship 阶段且使用率 >50%，建议 `/clear + /forge resume`。
5. THE `/forge resume` SHALL 只加载当前阶段所需的上下文（见 Requirement 5），不加载前面阶段的历史产物。
6. THE phase-advance 触发的 `/clear` SHALL 在 `.tinkerman/progress/` 中记录阶段完成状态和 context 快照，以便 resume 时恢复。

### Requirement 4: Subagent 结果文件化返回

**User Story:** 作为 Forge 开发者，我希望 review subagent 将完整结果写入文件而非内联返回，以减少 subagent 结果对主 agent 上下文的占用。

#### 验收标准

1. THE `spec-check.md`、`quality-check.md`、`security-check.md` agent 定义 SHALL 在末尾增加指令：将完整 Layer 报告 Write 到 `.tinkerman/reviews/<layer>-<timestamp>.md`。
2. THE subagent 返回给主 agent 的最终文本 SHALL 限制在 800 chars 以内，包含：`status`（pass/fail）、`findings_count`（总数）、`p0_count`、`p1_count`、`report_path`。
3. THE 主 agent（`/forge review`）在收到 subagent 结果后，SHALL 先解析摘要，仅在存在 P0/P1 finding 时才 Read 完整报告文件。
4. WHEN 全部三层均无 P0/P1 finding，THE 主 agent SHALL 不读取任何完整报告文件，仅基于摘要输出综合评审结论。
5. THE 报告文件路径 SHALL 遵循 `.tinkerman/reviews/<layer>-<YYYYMMDD-HHmmss>.md` 命名约定。

### Requirement 5: Resume 上下文最小化

**User Story:** 作为 Forge 开发者，我希望 `/forge resume` 只加载当前阶段所需的最小上下文，而非恢复所有历史阶段产物。

#### 验收标准

1. THE `/forge resume` instructions.md SHALL 定义按阶段的最小上下文加载清单：

   | 阶段 | 必须加载 | 不加载 |
   |------|----------|--------|
   | build | plan + progress + 当前 task 描述 | spec 全文、decide 产物 |
   | review | spec 摘要 + diff + progress | build 阶段的源码读取历史 |
   | test | progress + 测试文件路径列表 | build 阶段的实现细节 |
   | ship | progress + review 摘要 | 完整 review 报告全文 |

2. THE `/forge resume` SHALL 从 `.tinkerman/progress/<topic>.md` 读取当前阶段和任务状态，而非从对话历史恢复。
3. THE `/forge resume` SHALL 支持 `--phase <phase>` 参数，显式指定要恢复的阶段（覆盖自动检测）。
4. THE `/forge resume` 在加载 plan 时 SHALL 只读取未完成的 task 列表和当前 task 详情，不加载已完成的 task 历史记录。

### Requirement 6: Read 预算实时监控

**User Story:** 作为 Forge 开发者，我希望有运行时机制实时追踪 Read 累积 token 并在接近预算时预警，以防止上下文溢出。

#### 验收标准

1. THE `scripts/track-read-budget.mjs` SHALL 作为 PostToolUse hook（matcher: `Read`）运行。
2. THE hook SHALL 维护 session 级累积 Read 预算，存储于 `${TMPDIR}/forge-read-budget-<session>.json`。
3. THE hook SHALL 基于工具返回结果的字符数估算 token 消耗（chars / 4 作为近似值）。
4. WHEN 累积 Read 预算超过 100 KB（~25K tokens），THE hook SHALL 输出警告：`⚠️ Read budget: <n>KB. Consider /clear + /forge resume.`。
5. WHEN 累积 Read 预算超过 150 KB（~37K tokens），THE hook SHALL 输出强制建议：`⛔ Read budget exceeded. MUST /clear before continuing.`。
6. THE hook SHALL fail-open（exit 0），不阻断任何工具调用，仅输出警告。
7. THE hook SHALL 在 session start 时重置预算计数器。

### Requirement 7: Build 指令上下文预算章节更新

**User Story:** 作为 Forge 开发者，我希望 build 指令中的上下文预算管理章节反映新的五层防御体系。

#### 验收标准

1. THE `skills/forge/lib/build/references/context-budget.md` SHALL 更新为"五层上下文防御体系"文档，包含：Layer 1（Read 去重）、Layer 2（阶段隔离）、Layer 3（Subagent 文件化）、Layer 4（Agent 懒加载）、Layer 5（预算监控）。
2. THE 更新后的文档 SHALL 保留原有的 forge_exec / forge_git / forge_read MCP 工具指引作为 Layer 5 下的精细化工具。
3. THE 文档 SHALL 包含 context 使用率阈值表（60% 预警 / 80% 强制隔离）和各阶段的 Read 预算建议值。

### Requirement 8: 向后兼容性

**User Story:** 作为现有 Forge 用户，我希望五层防御体系不影响现有工作流，在 MCP server 不可用时仍能正常工作。

#### 验收标准

1. WHEN `forge_read_cached` MCP tool 不可用，THE SKILL 文档 SHALL 引导主 agent 使用 Read Dedup Iron Law 规则手动控制重复读取（不超过 2 次）。
2. WHEN `scripts/track-read-budget.mjs` hook 不可用，THE SKILL 文档中的上下文预算阈值 SHALL 仍由主 agent 心算评估。
3. THE Subagent 文件化返回（Requirement 4）SHALL 不影响 `/forge review` 的最终输出格式 — 用户看到的仍然是合并后的综合评审报告。
4. ALL 现有测试 SHALL 在变更后继续通过（`npm run check`）。
5. THE `forge_read_cached` 缓存索引文件 SHALL 不被 git 追踪（在 TMPDIR 中）。

---

## 附录：实证数据

### PID 10793 上下文分析（subagent-truncation-fix，中小需求）

- **总消息数**：543 条，2.0 MB transcript
- **Read 调用**：29 次，214.3 KB
  - `review.ts` 被读 **10 次**（最大单次 37.6 KB）
  - 测试文件被读 7 次（多文件各一次）
  - Agent 定义被读 3 次
- **Bash 调用**：51 次，65.7 KB
  - 测试运行输出是最大单项（21 KB）
- **Agent 调用**：4 次，6.6 KB
  - explore + spec-check + quality-check + security-check
- **Assistant 输出**：194 轮，仅 5.1 KB（已优化的不错）

### 上下文消费者占比

```
Read 结果  ████████████████████████████████████████  65%
Bash 结果  ████████████                               20%
Agent 定义 █████                                      10%
Skill 指令 ███                                         5%
CLAUDE.md  █                                           2%
```

### 预期收益估算

| Layer | 目标减少 | 机制 |
|---|---|---|
| Layer 1: Read 去重 | -40% Read（review.ts 10→2 次） | 缓存 + Iron Law |
| Layer 2: 阶段隔离 | -50% 累积 | 每阶段独立 session |
| Layer 3: Subagent 文件化 | -80% agent 返回 | 6.6 KB→~1 KB 摘要 |
| Layer 5: 预算监控 | 预防性 | 阻止超限 |

**综合效果**：单阶段 context 从 ~280 KB → ~60 KB（-78%）
