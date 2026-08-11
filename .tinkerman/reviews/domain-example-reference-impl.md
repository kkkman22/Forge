---
topic: domain-example-reference-impl
slice: A (Reservation aggregate)
date: 2026-06-29
result: pass
reviewed_at_commit: 592c79cf
tier: full
methodology: subagent-parallel
layers:
  - spec-check: pass
  - quality-check: pass
  - security-check: pass
severity_counts:
  p0: 0
  p1: 0
  p2: 0
  p3: 3
core_claim_verified: "state-machine engine no longer orphan (Reservation is real importer)"
---

# Review Report — domain-example-reference-impl（切片 A）

> 三层独立 subagent 评审。无 P0/P1/P2，仅 3×P3。

## 综合结论

✅ **PASS | P0:0 | P1:0 | P2:0 | P3:3**

11 REQ 全部 VERIFIED；INV-1..5 满足；核心声明（state-machine 引擎不再是 orphan）经独立核实为真——`reservation.ts:18` import + `loadStateMachineDefinition` 调用 + `apply()` 经引擎校验转换，无 hand-rolled switch。

## Layer 1 — spec-check（PASS）

11 REQ 全 VERIFIED（含 REQ-07 引擎消费真实验证）。INV-1..5 全 PASS。
- REQ-09 caveat：`deriveStatePropertyTests` 生成器本身有 bug（undefined `m` + 小写 state 名），adaptation **诚实记录**于 @generated header（非隐藏）。REQ-09 "半自动" claim 成立。
- F3（README 路径与 impl 不符）已修复（README 改述生成测试在 test/）。

## Layer 2 — quality-check（PASS）

- 聚合正确性：11 yaml transitions 全有方法；13 guard 名与 yaml 逐字一致；guards 在 engine 调用前求值。
- cancel() 分支正确（Booked→CancelBooking / Confirmed→CancelReservation）。
- partial-mutation 安全：GuardFailedError/InvalidTransitionError 均在 `_state`/`_events` 变更前抛出。
- 测试质量：BDD + transition 测试是行为驱动（非 tautological）；adapted 生成测试有意义地覆盖 4 invariants。
- 残留 P3：F1 `_roomNumber` 死字段（events emit 占位值）/ F2 `hasCondition` 子串匹配 loose / F3 interface 与 class 同名（**已修**：local interface 重命名为 ReservationMachineLookup）。

## Layer 3 — security-check（PASS）

4 条安全红线全 PASS：
1. 无 unsafe runtime（eval/SQL/fs-write/network/secrets）—— stripComments + 7 pattern 扫描，手工 grep 确认所有 eval/fs/secret 命中均为注释。
2. 事件无 PII —— events 载荷只含 reservationId/occurredAt/roomNumber/reason；GuestInfo 只含 guestRef。
3. 全部 src/domain/*.ts 含 @non-production header（Layer 3 强制）。
4. check-domain-safety.mjs 接入 npm run check，强制 INV-2（engine 不 import domain）。
- 残留 P3：S1 stripComments 可被字符串含 `*/` 绕过（naive lexer）/ S2 commit-msg skip 是单行旁路 / S3 fs.createWriteStream 未覆盖。均为 guard 自身的 defense-in-depth 弱点，非可利用漏洞（domain 代码本身干净）。

## 残留 P3（非阻断，可后续优化）
- F1 `_roomNumber` 死字段（reservation.ts）—— 后续接 RoomAllocation 值对象时填实
- F2 `hasCondition` 子串匹配（reservation-machine.ts）—— 生成器 adapter 的已知 looseness
- S1/S2/S3 check-domain-safety 自身的 hardening（comment-strip lexer / commit-msg bypass / stream-write）

## Ship 门禁
无 P0/P1/P2 残留 → **ship 放行**。
