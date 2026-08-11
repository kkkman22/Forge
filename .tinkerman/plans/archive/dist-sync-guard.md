---
topic: "dist-sync-guard"
status: "approved"
date: "2026-05-10"
spec_ref: ".kiro/specs/dist-sync-guard"
format: "lightweight"
---

## Objective

为 Forge 增加 src/dist 同步守卫。CI 层硬门禁（`check-dist-sync.mjs`）检测三类 drift（missing dist / orphan dist / compilation mismatch），本地便利工具（`dist-resync.sh`）一键同步，文档+evolved-rule 持续提醒。防止 2026-05-10 Sprint 1-3 累积 300+ dist 文件漂移再次发生。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#4-1-srcdist-syncts` | 纯函数层：detectDrift、srcToExpectedDist、distToExpectedSrc |
| `design.md#4-2-scriptscheck-dist-syncmjs` | CLI 驱动：文件收集、临时 tsc 编译、drift 报告、skip 机制 |
| `design.md#4-3-scriptsdist-resyncsh` | 本地便利：清缓存、tsc、交互/自动 stage |
| `design.md#4-4-packagejson` | package.json scripts 集成 |
| `design.md#4-5-contributingmd` | CONTRIBUTING.md dist/ Sync Requirement 章节 |
| `design.md#4-6-evolved-rules-r6` | evolved-rules.md R6 新条目 |
| `design.md#5-testing-strategy` | 单元测试 + property test 策略 |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `src/dist-sync.ts` | CREATE | 纯函数层：DriftReport 类型、srcToExpectedDist、distToExpectedSrc、detectDrift |
| `scripts/check-dist-sync.mjs` | CREATE | CLI 驱动：git ls-files、临时 tsc、SHA-256 比较、skip 机制 |
| `scripts/dist-resync.sh` | CREATE | 本地便利：清缓存、tsc、git status、交互/auto stage |
| `test/dist-sync.test.ts` | CREATE | detectDrift + 路径映射单元测试 |
| `test/dist-sync.property.test.ts` | CREATE | round-trip property test |
| `package.json` | MODIFY | scripts 增加 dist:resync + check 追加 check-dist-sync.mjs |
| `CONTRIBUTING.md` | MODIFY | 新增 dist/ Sync Requirement 章节 |
| `.tinkerman/knowledge/evolved-rules.md` | MODIFY | rule_count 5→6 + R6 条目 |

## Task Breakdown

### Task 1: 类型定义与路径映射函数
- **Goal**: 实现 srcToExpectedDist/distToExpectedSrc 路径映射及 DriftReport 类型
- **File**: `src/dist-sync.ts`
- **Design Reference**: `design.md#4-1-srcdist-syncts` — 纯函数层，定义 DriftReport schema 和路径映射
- **Depends On**: (none)
- **Verify**: `npx tsc --noEmit && npx vitest run test/dist-sync.test.ts`
- **Commit**: `feat(dist-sync): add path mapping functions and DriftReport types`

### Task 2: detectDrift 纯函数
- **Goal**: 实现三类 drift 检测（missing/orphan/mismatch）
- **File**: `src/dist-sync.ts`
- **Design Reference**: `design.md#4-1-srcdist-syncts` — detectDrift 算法：三类 drift 并行检测
- **Depends On**: Task 1
- **Verify**: `npx tsc --noEmit && npx vitest run test/dist-sync.test.ts`
- **Commit**: `feat(dist-sync): implement detectDrift with missing/orphan/mismatch checks`

### Task 3: 路径映射单元测试
- **Goal**: RED→GREEN 覆盖 srcToExpectedDist/distToExpectedSrc 各种路径
- **File**: `test/dist-sync.test.ts`
- **Design Reference**: `design.md#5-1-unit-tests` — describe("srcToExpectedDist / distToExpectedSrc") 用例
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/dist-sync.test.ts`
- **Commit**: `test(dist-sync): add path mapping unit tests`

### Task 4: detectDrift 单元测试
- **Goal**: RED→GREEN 覆盖三类 drift 检测 + clean report 场景
- **File**: `test/dist-sync.test.ts`
- **Design Reference**: `design.md#5-1-unit-tests` — describe("detectDrift") 用例
- **Depends On**: Task 2, Task 3
- **Verify**: `npx vitest run test/dist-sync.test.ts`
- **Commit**: `test(dist-sync): add detectDrift unit tests`

### Task 5: Property test（round-trip）
- **Goal**: 用 fast-check 验证 srcToExpectedDist → distToExpectedSrc round-trip 不变性
- **File**: `test/dist-sync.property.test.ts`
- **Design Reference**: `design.md#5-2-property-test` — fc.assert round-trip
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/dist-sync.property.test.ts`
- **Commit**: `test(dist-sync): add round-trip property test`

### Task 6: CLI 驱动 — 文件收集 + 临时 tsc + SHA-256 比较
- **Goal**: 实现 check-dist-sync.mjs 的核心逻辑（git ls-files、临时 tsc 编译、checksum 比较、skip 机制）
- **File**: `scripts/check-dist-sync.mjs`
- **Design Reference**: `design.md#4-2-scriptscheck-dist-syncmjs` — CLI 驱动 Phase 1-5
- **Depends On**: Task 2
- **Verify**: `node scripts/check-dist-sync.mjs` (exit 0 on clean repo)
- **Commit**: `feat(dist-sync): add check-dist-sync CLI with drift detection`

### Task 7: CLI 集成到 package.json check 脚本
- **Goal**: package.json check 脚本末尾追加 check-dist-sync.mjs
- **File**: `package.json`
- **Design Reference**: `design.md#4-4-packagejson` — scripts.check 追加 + scripts.dist:resync
- **Depends On**: Task 6
- **Verify**: `npm run check`
- **Commit**: `feat(dist-sync): integrate check-dist-sync into npm run check`

### Task 8: 本地便利脚本 dist-resync.sh
- **Goal**: 实现一键 tsc + git add dist/ 脚本，支持 --yes 和交互模式
- **File**: `scripts/dist-resync.sh`
- **Design Reference**: `design.md#4-3-scriptsdist-resyncsh` — 清缓存→tsc→status→stage
- **Depends On**: (none)
- **Verify**: `bash scripts/dist-resync.sh --help && npm run dist:resync -- --help`
- **Commit**: `feat(dist-sync): add dist-resync local convenience script`

### Task 9: package.json dist:resync script
- **Goal**: 添加 `dist:resync` script 到 package.json
- **File**: `package.json`
- **Design Reference**: `design.md#4-4-packagejson` — scripts.dist:resync
- **Depends On**: Task 8
- **Verify**: `npm run dist:resync -- --help`
- **Commit**: `feat(dist-sync): add dist:resync npm script`

### Task 10: CONTRIBUTING.md dist/ Sync Requirement 章节
- **Goal**: 在 Testing Requirements 章节后新增 dist/ Sync Requirement
- **File**: `CONTRIBUTING.md`
- **Design Reference**: `design.md#4-5-contributingmd` — Why / Rule / How to fix / Emergency bypass
- **Depends On**: Task 7 (需确认 check 脚本名称)
- **Verify**: `grep -c "dist/ Sync Requirement" CONTRIBUTING.md`
- **Commit**: `docs(contributing): add dist/ Sync Requirement section`

### Task 11: evolved-rules R6 条目
- **Goal**: 新增 R6 "src/dist 同步是 PR 合约一部分"，rule_count 5→6
- **File**: `.tinkerman/knowledge/evolved-rules.md`
- **Design Reference**: `design.md#4-6-evolved-rules-r6` — R6 完整内容 + Infra_Ref
- **Depends On**: Task 7 (需确认 Infra_Ref 路径)
- **Verify**: `node scripts/lint-evolved-rules.mjs && node scripts/verify-evolved-rule-infra-refs.mjs`
- **Commit**: `feat(evolved-rules): add R6 src/dist sync guard rule`

### Task 12: CI workflow 验证
- **Goal**: 确认 .github/workflows/ci.yml 通过 npm run check 覆盖 dist-sync 检查，或追加显式 step
- **File**: `.github/workflows/ci.yml`
- **Design Reference**: `design.md#6-1-ci` — CI 运行时流程
- **Depends On**: Task 7
- **Verify**: 确认 ci.yml 的 check job 包含 dist-sync（通过 npm run check 已覆盖）
- **Commit**: `ci: verify dist-sync covered by npm run check`

### Task 13: 全量回归验证
- **Goal**: 运行完整 check + test + lint 验证所有新增代码
- **File**: (no changes)
- **Design Reference**: `design.md#10-exit-criteria` — 7 项退出标准
- **Depends On**: Task 4, Task 5, Task 7, Task 8, Task 10, Task 11, Task 12
- **Verify**: `npm run check && npm run test`
- **Commit**: (no commit — verification only)

### Task 14: Smoke test（删 dist → fail → resync → pass）
- **Goal**: 手动验证完整 drift 检测流程
- **File**: (no changes)
- **Design Reference**: `design.md#5-3-integration-smoke-test` — smoke test 步骤
- **Depends On**: Task 13
- **Verify**: 删 dist 文件 → check fail → resync → check pass
- **Commit**: (no commit — verification only)

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| R1: CI 层漂移检测 (AC1-7) | Task 1, 2, 6, 7, 12 |
| R2: 本地一键同步工具 (AC1-5) | Task 8, 9 |
| R3: CONTRIBUTING.md 约定 (AC1-3) | Task 10 |
| R4: evolved-rules R6 条目 (AC1-5) | Task 11 |
| R5: 非功能需求 (AC1-6) | Task 3, 4, 5, 13, 14 |
