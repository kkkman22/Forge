---
feature: missions-inspired-rigor
layout: tasks
created: 2026-05-16
spec_ref: ".tinkerman/specs/missions-inspired-rigor/requirements.md"
---

# Implementation Plan: Missions-inspired Rigor

## Overview

按需求文档 R1–R4 落地 Missions 风格的工程纪律。任务按"R1 contract → R2 handoff → R3 known-failures → R4 fresh-context loop"四组排列；每组内部先测试后实现，遵守 TDD 铁律。每组可独立合并、独立产生价值。

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "name": "R1 — Validation Contract（可并行内 TDD）",
      "tasks": ["1", "2"],
      "rationale": "T1 写测试，T2 实现 + 改 SKILL/agent。RED → GREEN 标准 TDD。"
    },
    {
      "wave": 2,
      "name": "R1 — 旧 spec legacy 标记 + 上线",
      "tasks": ["3"],
      "depends_on": ["2"],
      "rationale": "新校验上线后，扫描已 lock 的旧 spec 批量加 contract_legacy: true，避免误阻。"
    },
    {
      "wave": 3,
      "name": "R2 — Handoff Schema（可并行内 TDD）",
      "tasks": ["4", "5"],
      "rationale": "T4 写测试，T5 实现 + 改 forge-build SKILL + Self-Check 增量。"
    },
    {
      "wave": 4,
      "name": "R3 — known-failures append + recurrence（TDD）",
      "tasks": ["6", "7", "8"],
      "depends_on": ["1"],
      "rationale": "T6 写 append 测试，T7 写 recurrence 测试，T8 实现并改三个 review agent + forge-review SKILL。三层 review agent 改动可并行，但合到一个任务里减少切换成本。"
    },
    {
      "wave": 5,
      "name": "R4 — events.ndjson + fresh-context 子会话",
      "tasks": ["9", "10", "11"],
      "depends_on": ["3", "5", "8"],
      "rationale": "loop 升级建立在前三条状态文件 schema 稳定的基础上。T9 写 cursor resume 测试；T10 改 forge-loop SKILL；T11 改 forge-resume SKILL + 端到端验证。"
    },
    {
      "wave": 6,
      "name": "Dogfooding + ROADMAP 更新",
      "tasks": ["12", "13"],
      "depends_on": ["11"],
      "rationale": "T12 用本 spec 自身做端到端 dogfooding；T13 把跨家族 review 长期项加上本 spec 完成情况写到 ROADMAP。"
    }
  ]
}
```

## Tasks

### Wave 1：R1 — Validation Contract

- [x] 1. 编写 contract-validation.test.ts（RED）
  - 创建 `test/forge-spec/contract-validation.test.ts`
  - 覆盖测试：缺 Verify-By 阻断 lock、缺 Evidence 阻断 lock、Verify-By 白名单校验、Evidence 非空校验、`contract_legacy: true` 跳过校验
  - 跑 `npx vitest run test/forge-spec/contract-validation.test.ts`，应**失败**（实现尚未写）
  - **对应需求**：R1.AC2, R1.AC4, R1.AC5, R1.AC6
  - **Verify-By**: vitest（测试本身先失败 → RED）
  - **Evidence**: 该测试文件 5+ case，全部 fail

- [x] 2. 实现 contract 校验脚本 + 改 forge-spec SKILL + 改 spec-check agent（GREEN）
  - 新增 `scripts/check-spec-contract.sh` + `scripts/check-spec-contract.js`
  - 修改 `skills/forge-spec/SKILL.md`：新增 Section 起草模板要求（每条 AC 必填 Verify-By/Evidence）+ Section 锁定阶段调用 check-spec-contract.sh
  - 修改 `skills/forge-spec/templates/requirements.md.template`（如不存在则创建），加入 Verify-By/Evidence 字段示例
  - 修改 `.claude/agents/spec-check.md`：新增 Step 0.5 提取 contract 表，新增"contract incomplete → P1"判定，新增"Verify-By: vitest 但测试空断言 → P0"判定
  - 跑 `npx vitest run test/forge-spec/contract-validation.test.ts`，应**通过**
  - **对应需求**：R1.AC1, R1.AC2, R1.AC3, R1.AC4, R1.AC5, R1.AC6
  - **Verify-By**: vitest
  - **Evidence**: 任务 1 的测试 GREEN

- [x] 3. 批量为旧 spec 加 contract_legacy 标记
  - 新增 `scripts/mark-legacy-contracts.sh`：扫描 `.tinkerman/specs/*/spec.md`，对 `status: locked` 且 lock 时间早于本 spec lock 日的加 `contract_legacy: true` 到 frontmatter
  - 跑该脚本，确认所有当前 locked 的 spec 都加上标记
  - 验证：跑 `bash scripts/check-spec-contract.sh .tinkerman/specs/<random-old>/spec.md`，应跳过校验直接退 0
  - **对应需求**：R1.AC2 的 Legacy 兜底
  - **Verify-By**: bash
  - **Evidence**: 旧 spec 跑校验脚本退 0 + grep frontmatter 含 `contract_legacy: true`

### Wave 2：R2 — Handoff Schema

- [x] 4. 编写 handoff-schema.test.ts（RED）
  - 创建 `test/forge-build/handoff-schema.test.ts`
  - 覆盖测试：5 字段全填解析成功、缺任一字段拒绝、commands_executed 必须含 cmd+exit_code、procedure_compliance 必须含 RED/GREEN/REFACTOR 或 'skipped'、light tier 降级到 2 字段必填
  - 跑测试应**失败**
  - **对应需求**：R2.AC1, R2.AC2, R2.AC3, R2.AC4, R2.AC8
  - **Verify-By**: vitest
  - **Evidence**: 该测试文件 8+ case 全部 fail

- [x] 5. 实现 handoff schema parser + 改 forge-build SKILL + Self-Check 增量（GREEN）
  - 新增 `src/handoff-schema.ts`：解析 + 校验 5 字段 schema
  - 修改 `skills/forge-build/SKILL.md`：新增 Section 3.5 强制 handoff 写入 + Section 3.6 下一任务读取 handoff
  - 修改 `skills/forge-build/references/self-check.md`：增加 4 条 handoff 校验项
  - 跑 `npx vitest run test/forge-build/handoff-schema.test.ts`，应**通过**
  - **对应需求**：R2.AC1-AC8
  - **Verify-By**: vitest
  - **Evidence**: 任务 4 的测试 GREEN

### Wave 3：R3 — known-failures append + recurrence

- [x] 6. 编写 known-failures-append.test.ts（RED）
  - 创建 `test/forge-review/known-failures-append.test.ts`
  - 覆盖测试：P0/P1 issue 触发 append-block 输出、append-block schema 校验、forge-review 合并三层报告生成 known-failures append、pattern_id 去重逻辑、超 100 条触发归档
  - 跑测试应**失败**
  - **对应需求**：R3.AC1, R3.AC2, R3.AC3, R3.AC6
  - **Verify-By**: vitest
  - **Evidence**: 该测试文件 6+ case 全部 fail

- [x] 7. 编写 known-failures-recurrence.test.ts（RED）
  - 创建 `test/forge-review/known-failures-recurrence.test.ts`
  - 覆盖测试：diff 命中已存在 pattern 且无修复痕迹 → P1 recurrence、diff 命中且 fix_in_diff 检测为 true → 不触发 P1、Step 0.5 读取 known-failures.md 列出本次命中模式
  - 跑测试应**失败**
  - **对应需求**：R3.AC4, R3.AC5
  - **Verify-By**: vitest
  - **Evidence**: 该测试文件 4+ case 全部 fail

- [x] 8. 实现 known-failures parser + 改三个 review agent + forge-review SKILL（GREEN）
  - 新增 `src/known-failures.ts`：append-block 生成器、pattern_id 哈希、parse/serialize、去重合并
  - 修改 `.claude/agents/spec-check.md` / `quality-check.md` / `security-check.md`：每个 agent 都加 Step 0.5（读 known-failures）+ Output Format 增量（P0/P1 输出 append-block）
  - 修改 `skills/forge-review/SKILL.md`：新增 Section 4.5 known-failures 累积逻辑
  - 跑 `npx vitest run test/forge-review/`，任务 6+7 的测试应**通过**
  - **对应需求**：R3.AC1-AC6
  - **Verify-By**: vitest
  - **Evidence**: 任务 6+7 的测试 GREEN

### Wave 4：R4 — fresh-context loop

- [x] 9. 编写 events-cursor-resume.test.ts（RED）
  - 创建 `test/forge-resume/events-cursor-resume.test.ts`
  - 覆盖测试：phase_start/phase_end 事件 schema 校验、events.ndjson cursor 解析、forge-resume 从最新 phase_end 恢复、最后一行 JSON 损坏的容错（跳到倒数第二行）、session_id 在多次 SKILL 调用间不重复
  - 跑测试应**失败**
  - **对应需求**：R4.AC3, R4.AC4, R4.AC6, R4.AC7
  - **Verify-By**: vitest
  - **Evidence**: 该测试文件 6+ case 全部 fail

- [x] 10. 改 forge-loop SKILL：fresh-context 子会话编排 + events.ndjson 增强（GREEN）
  - 修改 `skills/forge-loop/SKILL.md`：新增 Section 4.X Fresh-Context Subsession Discipline，明确每次 SKILL 调用通过 `Skill(skill="forge", args="<phase>")` 触发新子会话
  - 修改 Section 9 events.ndjson 事件流：phase_start/phase_end 字段补齐 session_id / wall_clock_elapsed_seconds / token_budget_used
  - 修改 Section 7 关机序列：输出对齐 Missions 维度的 Mission Summary
  - **对应需求**：R4.AC1-AC5, R4.AC8
  - **Verify-By**: bash + manual
  - **Evidence**: `bash scripts/check-skill-sections.sh skills/forge-loop/SKILL.md` 通过 + 人工 review SKILL 文档新增章节

- [x] 11. 改 forge-resume SKILL + 端到端验证（GREEN）
  - 修改 `skills/forge-resume/SKILL.md`：从 `.tinkerman/runs/<run-id>/events.ndjson` 读最新 cursor + .tinkerman/status.md 恢复
  - 实现 `src/events-cursor.ts`：解析 events.ndjson、容错损坏行、提取最新 phase 状态
  - 跑 `npx vitest run test/forge-resume/`，任务 9 的测试应**通过**
  - 端到端：人为中断一次 forge-loop（kill 进程），跑 `/forge resume <run-id>`，验证状态完全恢复
  - **对应需求**：R4.AC6, R4.AC7
  - **Verify-By**: vitest + manual
  - **Evidence**: 任务 9 测试 GREEN + 中断 + resume 端到端验证截图或日志

### Wave 5：Dogfooding + ROADMAP

- [ ] 12. Dogfooding：用本 spec 自身跑一次完整 standard tier 流程 (deferred)
  - 提交本 spec 的 R1-R4 全部实现 → 跑 `/forge plan` → `/forge build` → `/forge review` → `/forge test` → `/forge ship`
  - 验证：build 阶段 progress 文件中每个原子任务都有合法 handoff block；review 阶段命中并新增 known-failures；如果跑了 forge-loop，events.ndjson 至少有 N 条 phase_start/phase_end 配对
  - 把 dogfooding 报告写入 `.tinkerman/findings/missions-inspired-rigor-dogfooding.md`
  - **对应需求**：所有 R 的端到端验证
  - **Verify-By**: manual
  - **Evidence**: `.tinkerman/findings/missions-inspired-rigor-dogfooding.md` 含截图 / 日志 / 关键文件 hash
  - **2026-05-16 部分完成**：本次审计后通过"修复审计发现的 P2 偏差"作为最小闭环，产出 `.tinkerman/progress/missions-inspired-rigor.md` 真实 handoff block + `.tinkerman/knowledge/known-failures.md` 真实条目。完整 standard tier dogfooding 仍 deferred。
  - 验证：build 阶段 progress 文件中每个原子任务都有合法 handoff block；review 阶段命中并新增 known-failures；如果跑了 forge-loop，events.ndjson 至少有 N 条 phase_start/phase_end 配对
  - 把 dogfooding 报告写入 `.tinkerman/findings/missions-inspired-rigor-dogfooding.md`
  - **对应需求**：所有 R 的端到端验证
  - **Verify-By**: manual
  - **Evidence**: `.tinkerman/findings/missions-inspired-rigor-dogfooding.md` 含截图 / 日志 / 关键文件 hash

- [ ] 13. 更新 ROADMAP.md (deferred)
  - 在 ROADMAP.md "v2.6 — skill 归位 + 数量精简（进行中）"段下新增"已完成 — Missions-inspired Rigor"小节，列 R1-R4 完成情况
  - 确认"跨家族 Review 验证"长期项已在中期项部分（本次会话已添加）
  - **对应需求**：路线图同步
  - **Verify-By**: bash
  - **Evidence**: `grep -q "Missions-inspired Rigor" ROADMAP.md` 退 0
  - 确认"跨家族 Review 验证"长期项已在中期项部分（本次会话已添加）
  - **对应需求**：路线图同步
  - **Verify-By**: bash
  - **Evidence**: `grep -q "Missions-inspired Rigor" ROADMAP.md` 退 0

## Notes

### 风险与缓解

| 风险 | 缓解措施 | 严重度 |
|---|---|---|
| 旧 spec 因缺 Verify-By 字段无法 lock | 任务 3 批量加 `contract_legacy: true`；新校验仅对新 lock 的 spec 强制 | 中 |
| build agent 在 light tier 写不全 5 字段 handoff | light tier 降级为 2 字段必填，standard/full 仍 5 字段 | 低 |
| known-failures.md 增长失控 | 超 100 条自动归档，保留最新 80 条 | 低 |
| forge-loop fresh-context 调用 cache miss 暴增 | events.ndjson 记录 cache_hit_rate，<70% 时重评状态文件分区 | 中 |
| events.ndjson 最后一行 JSON 损坏 | parser 容错，跳过损坏行从倒数第二条恢复 | 低 |
| 三个 review agent 改动量大、回归风险高 | 任务 6+7 先写测试 → 任务 8 实现，TDD 兜底；不动既有 Severity Judgment 表 | 中 |

### 预计耗时

| Wave | 任务数 | 风险等级 | 预计耗时 | 用户授权点 |
|---|---|---|---|---|
| Wave 1（R1） | 3 | 中 | 30-40 分钟 | 任务 3 前需用户确认批量改旧 spec 范围 |
| Wave 2（R2） | 2 | 中 | 25-30 分钟 | 无 |
| Wave 3（R3） | 3 | 高 | 60-90 分钟 | 任务 8 涉及三个 review agent 同时改，建议分批 commit |
| Wave 4（R4） | 3 | 高 | 60-80 分钟 | 任务 11 端到端中断需用户配合 |
| Wave 5 | 2 | 低 | 20-30 分钟 | 无 |

### 推荐合并节奏

为减少一次性 PR 体积，建议按 Wave 拆 PR：

1. **PR 1**：Wave 1（R1 contract 校验） — 独立可合并，旧 spec 已加 legacy 标记不影响。
2. **PR 2**：Wave 2（R2 handoff schema） — 独立可合并，build SKILL 内部增量。
3. **PR 3**：Wave 3（R3 known-failures） — 独立可合并，review SKILL 内部增量。
4. **PR 4**：Wave 4（R4 fresh-context loop）+ Wave 5 dogfooding — 一起合，loop 改动需要前三条 schema 稳定。

每个 PR 独立完成 plan→build→review→test→ship 五阶段。

### 与既有 ROADMAP 的关系

- 本 spec **完成** ROADMAP "Forge 的核心护城河"中的第 7 条（三层独立评审中的 Spec-alignment 层）的"机械可验证"升级。
- 本 spec **不替代** ROADMAP "跨家族 Review 验证"长期项；该项继续保持低优先级搁置状态，等 false-negative 率证据累积。
- 本 spec **强化** ROADMAP "v2.6 — skill 归位 + 数量精简"的核心论点：Forge 站在 Claude Code 原语之上，只保留方法论差异化。R1-R4 都是方法论层面的差异化，不是工具层面的。
