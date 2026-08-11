# Progress — domain-example-reference-impl（切片 A：reservation 聚合）

> Spec: `.tinkerman/specs/domain-example-reference-impl/` (locked)
> Decision: `.tinkerman/decisions/2026-06-27-domain-example-reference-impl.md`
> Branch: `feat/domain-example-reference-impl-sliceA`

## Wave 进度（全部完成）

- [x] **Wave 1** — T1 tsconfig project ref, T2 errors
- [x] **Wave 2** — T3 aggregate(消费 state-machine) + T5 events, T4 values, T6 repo/service
- [x] **Wave 3** — T7 consumer-contract, T8 check-domain-safety(CI), T9 generated+BDD
- [x] **Wave 4** — T10 regression(dist-sync exclude), T11 dist-check+README

## §3.5 Final Validation

`npm run check` **EXIT=0**：728 files / 8999 passed | 3 skipped, 0 failed。
（含 tsc + biome + vitest + check-domain-safety + dist-sync + 全链）

## INV 验证（全局不变式）

| INV | 不变式 | 状态 | 证据 |
|-----|--------|------|------|
| INV-1 | 主 build 不污染 src/domain/ | ✅ | 根 tsconfig exclude src/domain/**；独立 tsconfig composite；主 tsc exit 0 |
| INV-2 | engine 不 import domain | ✅ | check-domain-safety Layer 2 强制；grep src/ 无 domain import |
| INV-3 | src/domain 不进 dist | ✅ | check-dist-sync exclude + domain-not-in-dist.test 断言 |
| INV-4 | 无运行时副作用 | ✅ | check-domain-safety Layer 1（eval/SQL/fs-write/net/secrets） |
| INV-5 | 现有测试不回归 | ✅ | npm run check EXIT=0 |

## Review

三层 PASS（P0:0 P1:0 P2:0 P3:3）。核心声明核实：state-machine 引擎不再是 orphan（reservation.ts 真实 import + 调用）。残留 P3（_roomNumber 死字段 / hasCondition loose / guard hardening）非阻断。

## Test

Layer 1（npm run check）✅ / Layer 2（非 Web 跳过）/ Layer 3（7 项清单全通过）。

## DoD

- [x] 11 Task done，11 REQ Evidence 齐全
- [x] npm run check 全绿（INV-1, INV-5）
- [x] state-machine 引擎不再是 orphan（REQ-07）
- [x] reservation 全套 DDD 原语齐全
- [x] 不污染主 build / 不进 dist（INV-1, INV-3）
- [x] 安全红线落地（@non-production + CI 巡检 + 纯内存 + engine 不 import domain）
