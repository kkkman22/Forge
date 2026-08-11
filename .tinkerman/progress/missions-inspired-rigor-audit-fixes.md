# Progress: missions-inspired-rigor — Audit Fixes (2026-05-16)

> 本文件记录 2026-05-16 spec-check 审计后对 R1-R4 实现的偏差修复。
> 三个原子任务，每个完成后追加一份 5 字段 handoff block（R2 真实 dogfooding）。

---

## Task A: tasks.md checkbox 同步

修复 P1：`.kiro/specs/missions-inspired-rigor/tasks.md` 13 个 task 全部 `[ ]`，与 `.tinkerman/progress/missions-inspired-rigor.md` T1-T11 已 `[x]` 不一致。

```yaml handoff
task_id: AUDIT-A
completed:
  - .kiro/specs/missions-inspired-rigor/tasks.md T1-T11 标记 [x]
  - T12-T13 保留 [ ] 并在标题加 "(deferred)" 后缀
  - T12 内嵌 2026-05-16 部分完成说明（最小 dogfooding 闭环）
not_completed: []
commands_executed:
  - cmd: "awk … sub(\"\\\\[ \\\\]\", \"[x]\") … tasks.md"
    exit_code: 0
  - cmd: "getDiagnostics tasks.md"
    exit_code: 0
issues_found:
  - awk sub() 反向引用语法在 macOS BSD awk 中不工作，T12/T13 被替换成字面量 "\\1"，需 str_replace 二次修复（已修复）
procedure_compliance: |
  RED: 不适用——纯文档修复，由 Kiro Spec Format diagnostics 充当 RED（替换前 2 个 schema 错误，替换后 0 错误）
  GREEN: tasks.md diagnostics 全绿
  REFACTOR: skipped（无重复代码可提取）
```

---

## Task B: SKILL §3.6 补 not_completed 强制处理语义

修复 P2 (R2-1)：R2.AC6 要求 not_completed 非空时下一任务必须显式选择处理路径，原 SKILL §3.6 仅说"作为接续输入"，缺少强制语义。

```yaml handoff
task_id: AUDIT-B
completed:
  - skills/forge-build/SKILL.md §3.6 末尾追加 "Carry-Over Discipline（R2.AC6）" 段
  - 明确三选一：(a) 纳入当前任务 / (b) 写入 spec Out of Scope / (c) 升级为新 task
  - 静默忽略明确判定为 P1
not_completed: []
commands_executed:
  - cmd: "str_replace skills/forge-build/SKILL.md §3.6"
    exit_code: 0
  - cmd: "getDiagnostics skills/forge-build/SKILL.md"
    exit_code: 0
issues_found: []
procedure_compliance: |
  RED: 不适用——SKILL 文档修订，没有现成 spec-check 测试覆盖 R2.AC6 的语义强度
  GREEN: 文档更新后 diagnostics 0 错误；str_replace 一次成功
  REFACTOR: skipped
```

---

## Task C: SKILL §13 补 events.ndjson schema 范例 + §9 定位说明

修复 P2 (R4-1, R4-2)：R4.AC3/AC4 要求 phase_start/phase_end 含完整字段（含 exit_code），原 §13 仅一行声明 3 个字段；同时 design.md 说"Section 9 events.ndjson schema"但 §9 实为 Distribution Package Environment——文档定位偏差。

```yaml handoff
task_id: AUDIT-C
completed:
  - skills/forge-loop/SKILL.md §13 追加 events.ndjson 完整 JSON schema 范例（phase_start + phase_end）
  - 显式列出 exit_code 字段（design.md schema 要求但原 SKILL prose 缺失）
  - 追加文档定位说明，明确 §13 承担 design.md "Section 9" 的所有职责
not_completed: []
commands_executed:
  - cmd: "str_replace skills/forge-loop/SKILL.md §13"
    exit_code: 0
  - cmd: "getDiagnostics skills/forge-loop/SKILL.md"
    exit_code: 0
issues_found: []
procedure_compliance: |
  RED: 不适用——SKILL 文档修订
  GREEN: 文档更新后 diagnostics 0 错误
  REFACTOR: skipped
```

---

## Carry-Over Discipline 验收（R2.AC6 自验证）

按 §3.6 新加的 Carry-Over Discipline，扫描三份 handoff 的 `not_completed`：

- AUDIT-A.not_completed = []  → 无需处理
- AUDIT-B.not_completed = []  → 无需处理
- AUDIT-C.not_completed = []  → 无需处理

无遗留项，三任务均完整完成。

---

## Self-Check (build SKILL §3.6 末尾)

- [x] 三个原子任务每个都有一份 handoff block
- [x] 每份 handoff 都含完整 5 字段（standard tier，非 light）
- [x] commands_executed 数组中每条都含 cmd + exit_code
- [x] procedure_compliance 含 RED/GREEN/REFACTOR 或 skipped 关键词

P1 自检通过。
