---
topic: "pms-pack-v1-core"
status: "approved"
date: "2026-05-09"
spec_ref: ".kiro/specs/pms-pack-v1"
parent_plan: "pms-pack-v1"
format: "lightweight"
---

# Plan: PMS Pack v1 — Core 引擎（Phase 1-5）

> 来源: 拆分自 `.tinkerman/plans/pms-pack-v1.md`（用户选择 split-into-3）

## Objective

交付 Forge Core 层 5 项新引擎能力：State Machine 引擎（loader/validator/property-derivation）、Forced Acceptance 门禁、Mutation Testing 封装、单任务 Micro-Review、TDD 狠度强化（XML 标签 + Rationalization 扩展）。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#41-srcstate-machineloaderts` | 状态机 YAML 加载器 |
| `design.md#42-srcstate-machinevalidatorts` | 状态机校验 ST001-ST005 |
| `design.md#43-srcstate-machineproperty-derivationts` | Property test 自动派生 |
| `design.md#44-srcaccept-gatets` | Forced Acceptance ship 门禁 |
| `design.md#45-srcmutatets` | Stryker.js 封装 |
| `design.md#46-srcbuild-micro-reviewts` | 单任务 spec 对齐检查 |
| `design.md#48-skillsforge-mutateskillmd` | Mutation testing skill |
| `design.md#49-scriptscheck-iron-lawssh` | Iron Law 唯一性校验 |
| `design.md#51-forge-ship-含-forced-acceptance-门禁` | Ship 门禁新增步骤 |
| `design.md#52-forge-build-单任务-micro_review` | Build Micro_Review 集成 |

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `src/state-machine/types.ts` | CREATE | 状态机类型定义 |
| `src/state-machine/loader.ts` | CREATE | YAML 状态机加载器 |
| `src/state-machine/validator.ts` | CREATE | 状态机校验 |
| `src/state-machine/property-derivation.ts` | CREATE | Property test 派生 |
| `src/state-machine/index.ts` | CREATE | Barrel export |
| `src/accept-gate.ts` | CREATE | Forced Acceptance 门禁 |
| `src/mutate.ts` | CREATE | Stryker 封装 |
| `src/build-micro-review.ts` | CREATE | Micro_Review 引擎 |
| `src/ship.ts` | MODIFY | 集成 accept-gate |
| `src/build.ts` | MODIFY | 集成 Micro_Review |
| `scripts/check-iron-laws.sh` | CREATE | Iron Law 唯一性校验 |
| `CLAUDE.md` | MODIFY | 铁律 XML 标签 |
| `.tinkerman/config.md` | MODIFY | Hard Gate 标签 |
| `skills/forge-spec/SKILL.md` | MODIFY | spec-lock Hard Gate |
| `skills/forge-plan/SKILL.md` | MODIFY | plan-approve Hard Gate |
| `skills/forge-review/SKILL.md` | MODIFY | P0/P1 block Hard Gate |
| `skills/forge-ship/SKILL.md` | MODIFY | ship gate Hard Gate |
| `skills/forge-build/SKILL.md` | MODIFY | Micro_Review 步骤 |
| `skills/forge-build/references/tdd-rules.md` | MODIFY | Rationalization 扩展 |
| `skills/forge-mutate/SKILL.md` | CREATE | Mutation skill |
| `skills/forge-mutate/references/frameworks.md` | CREATE | Stryker 配置细节 |
| `.gitignore` | MODIFY | 追加 reports/mutation/ |
| `test/state-machine/loader.test.ts` | CREATE | Loader 测试 |
| `test/state-machine/validator.test.ts` | CREATE | Validator 测试 |
| `test/state-machine/property-derivation.test.ts` | CREATE | Property derivation 测试 |
| `test/accept-gate.test.ts` | CREATE | Accept gate 测试 |
| `test/mutate.test.ts` | CREATE | Mutate 测试 |
| `test/build/micro-review.test.ts` | CREATE | Micro_Review 测试 |
| `test/build/micro-review-integration.test.ts` | CREATE | Micro_Review 集成测试 |
| `test/ship/forced-acceptance.test.ts` | CREATE | Ship accept-gate 集成测试 |

## Task Breakdown

### Phase 1: State Machine 引擎

#### Task 1: 状态机类型定义
- **Goal**: 定义 StateMachineDefinition / ValidationReport / TransitionSpec / InvariantSpec 类型
- **File**: `src/state-machine/types.ts`
- **Design Reference**: `design.md#41-srcstate-machineloaderts` — 状态机数据结构
- **Depends On**: (none)
- **Verify**: `npx tsc --noEmit`
- **Commit**: `feat(state-machine): add type definitions`

#### Task 2: 状态机 YAML 加载器
- **Goal**: 实现 loadStateMachineDefinition 从 YAML 字符串解析为强类型对象
- **File**: `src/state-machine/loader.ts`
- **Design Reference**: `design.md#41-srcstate-machineloaderts` — YAML 加载，字段缺失抛具名错误
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/state-machine/loader.test.ts`
- **Commit**: `feat(state-machine): implement YAML loader with field validation`

#### Task 3: 状态机校验器
- **Goal**: 实现 validateDefinition 检查 ST001-ST005 五条规则
- **File**: `src/state-machine/validator.ts`
- **Design Reference**: `design.md#42-srcstate-machinevalidatorts` — ST001-ST005
- **Property**: fast-check idempotence
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/state-machine/validator.test.ts`
- **Commit**: `feat(state-machine): implement validator with ST001-ST005 rules`

#### Task 4: Property test 自动派生
- **Goal**: 实现 deriveStatePropertyTests 从 invariant 生成 fast-check 测试代码片段
- **File**: `src/state-machine/property-derivation.ts`
- **Design Reference**: `design.md#43-srcstate-machineproperty-derivationts` — 4 类模板 + 未识别占位
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/state-machine/property-derivation.test.ts`
- **Commit**: `feat(state-machine): implement property test derivation engine`

#### Task 5: State Machine barrel export
- **Goal**: 创建 index.ts 统一导出
- **File**: `src/state-machine/index.ts`
- **Design Reference**: `design.md#41-srcstate-machineloaderts` — 模块公共 API
- **Depends On**: Task 2, Task 3, Task 4
- **Verify**: `npx tsc --noEmit`
- **Commit**: `feat(state-machine): add barrel export`

### Phase 2: Forced Acceptance Gate

#### Task 6: Accept Gate 判定逻辑
- **Goal**: 实现 shouldBlockShip 6 种组合判定
- **File**: `src/accept-gate.ts`
- **Design Reference**: `design.md#44-srcaccept-gatets` — Zero-Pack no-block
- **Property**: fast-check monotonicity
- **Depends On**: (none)
- **Verify**: `npx vitest run test/accept-gate.test.ts`
- **Commit**: `feat(accept-gate): implement shouldBlockShip with 6-case logic`

#### Task 7: 集成 accept-gate 到 ship.ts
- **Goal**: ship 门禁序列后追加 accept-gate 检查
- **File**: `src/ship.ts`
- **Design Reference**: `design.md#51-forge-ship-含-forced-acceptance-门禁`
- **Depends On**: Task 6
- **Verify**: `npx vitest run test/ship/forced-acceptance.test.ts`
- **Commit**: `feat(ship): integrate forced acceptance gate into ship sequence`

### Phase 3: Mutation Testing

#### Task 8: 添加 Stryker 依赖
- **Goal**: 安装 @stryker-mutator/core 和 @stryker-mutator/vitest-runner
- **File**: `package.json`, `.gitignore`
- **Design Reference**: `design.md#45-srcmutatets`
- **Depends On**: (none)
- **Verify**: `npx stryker --version`
- **Commit**: `chore: add stryker mutation testing dependencies`

#### Task 9: Mutation 引擎封装
- **Goal**: 实现 runMutation 封装 Stryker 执行、结果解析、artifact 写入
- **File**: `src/mutate.ts`
- **Design Reference**: `design.md#45-srcmutatets` — union packs globs、score 计算、verdict 判定
- **Depends On**: Task 8
- **Verify**: `npx vitest run test/mutate.test.ts`
- **Commit**: `feat(mutate): implement Stryker wrapper with score calculation`

#### Task 10: Mutation skill 定义
- **Goal**: 创建 skills/forge-mutate/SKILL.md 主体 ≤150 行
- **File**: `skills/forge-mutate/SKILL.md`, `skills/forge-mutate/references/frameworks.md`
- **Design Reference**: `design.md#48-skillsforge-mutateskillmd`
- **Depends On**: Task 9
- **Verify**: `wc -l skills/forge-mutate/SKILL.md` (≤150)
- **Commit**: `feat(mutate): add forge-mutate skill definition`

### Phase 4: Micro-Review

#### Task 11: Micro-Review 引擎
- **Goal**: 实现 runMicroReview 对照 Plan 验收标准检查 covered/overBuilt/missing
- **File**: `src/build-micro-review.ts`
- **Design Reference**: `design.md#46-srcbuild-micro-reviewts` — v1 严格 + legacy loose
- **Property**: fast-check idempotence
- **Depends On**: (none)
- **Verify**: `npx vitest run test/build/micro-review.test.ts`
- **Commit**: `feat(micro-review): implement task-level spec alignment check`

#### Task 12: 集成 Micro-Review 到 build.ts
- **Goal**: 每 atomic task Verify GREEN 后调用 runMicroReview
- **File**: `src/build.ts`
- **Design Reference**: `design.md#52-forge-build-单任务-micro_review`
- **Depends On**: Task 11
- **Verify**: `npx vitest run test/build/micro-review-integration.test.ts`
- **Commit**: `feat(build): integrate micro-review into task execution flow`

### Phase 5: TDD 狠度强化

#### Task 13: CLAUDE.md 铁律 XML 标签化
- **Goal**: §2.1/2.3/2.4/2.7 铁律包裹 `<IRON-LAW>` 标签
- **File**: `CLAUDE.md`
- **Design Reference**: `design.md#49-scriptscheck-iron-lawssh`
- **Depends On**: (none)
- **Verify**: `grep -c '<IRON-LAW' CLAUDE.md` (≥4)
- **Commit**: `refactor(claude-md): wrap iron laws in XML tags`

#### Task 14: Skill 级 Hard Gate XML 标签化
- **Goal**: spec-lock / plan-approve / p0-p1-block / ship-gates 包裹 `<HARD-GATE>` 标签
- **File**: `skills/forge-spec/SKILL.md`, `skills/forge-plan/SKILL.md`, `skills/forge-review/SKILL.md`, `skills/forge-ship/SKILL.md`, `.tinkerman/config.md`
- **Design Reference**: `design.md#49-scriptscheck-iron-lawssh`
- **Depends On**: Task 13
- **Verify**: `grep -rc '<HARD-GATE' skills/ .tinkerman/config.md` (≥5)
- **Commit**: `refactor(skills): wrap hard gates in XML tags`

#### Task 15: Iron Law 唯一性校验脚本
- **Goal**: 实现 check-iron-laws.sh 提取 + 校验唯一性
- **File**: `scripts/check-iron-laws.sh`
- **Design Reference**: `design.md#49-scriptscheck-iron-lawssh`
- **Depends On**: Task 13, Task 14
- **Verify**: `bash scripts/check-iron-laws.sh && echo "OK"`
- **Commit**: `feat(scripts): add iron law uniqueness check script`

#### Task 16: Rationalization Catalog 扩展
- **Goal**: tdd-rules.md Rationalization 表扩展至 15+ 条，分 5 子类别
- **File**: `skills/forge-build/references/tdd-rules.md`
- **Design Reference**: R11.1-11.5
- **Depends On**: (none)
- **Verify**: `grep -c '|.*|.*|' skills/forge-build/references/tdd-rules.md` (≥15)
- **Commit**: `feat(tdd-rules): expand rationalization catalog to 15+ entries`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|------------------|----------------|
| R4 状态机引擎 | Task 1, 2, 3, 4, 5 |
| R6 Forced Acceptance | Task 6, 7 |
| R7 Mutation 引擎 | Task 8, 9, 10 |
| R9 Micro-Review | Task 11, 12 |
| R10 XML 铁律标签 | Task 13, 14, 15 |
| R11 Rationalization | Task 16 |
| R4.6 Zero-Pack | Task 6, 9, 11 (engine 可独立使用) |

## Inter-Plan Dependencies

- **下游**: `pms-pack-v1-pack` 依赖本 plan Task 2 (state-machine loader) 用于 PMS 状态机 YAML 加载
- **下游**: `pms-pack-v1-scenarios` 依赖本 plan 全部完成
