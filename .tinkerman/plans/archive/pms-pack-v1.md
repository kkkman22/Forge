---
topic: "pms-pack-v1"
status: "split"
date: "2026-05-09"
spec_ref: ".kiro/specs/pms-pack-v1"
format: "lightweight"
split_into:
  - "pms-pack-v1-core"
  - "pms-pack-v1-pack"
  - "pms-pack-v1-scenarios"
---

# Plan: PMS Domain Pack v1.0 (PARENT — SPLIT)

> 来源: `.kiro/specs/pms-pack-v1/` (requirements.md + design.md + tasks.md)
> 已拆分为 3 个子 plan，按序执行，每个对应一次完整 build → review → test → ship 周期。

## Objective

在 Sprint 1 Pack 基础设施上交付 PMS Domain Pack v1.0 + Core 三项新引擎（Forced Acceptance / Mutation Testing / Micro-Review）+ TDD 狠度强化（XML 标签 + Rationalization 扩展）。15 条需求，13 个 Phase，37 个任务。

## Sub-Plans

| # | Sub-Plan | Phases | Tasks | Focus |
|---|----------|--------|-------|-------|
| 1 | `pms-pack-v1-core` | 1-5 | 16 | Core 引擎（State Machine / Accept Gate / Mutation / Micro-Review / XML） |
| 2 | `pms-pack-v1-pack` | 6-9 | 10 | PMS Pack 内容（骨架 / Glossary / 禁用词 / 状态机 / BusinessDayClock） |
| 3 | `pms-pack-v1-scenarios` | 10-13 | 11 | 场景 / Init / Zero-Pack / 集成 / 文档 |

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#2-high-level-architecture` | Core/Pack 职责分离，引擎在 Core，数据在 Pack |
| `design.md#31-packsppmspackyaml` | PMS Pack manifest 含 feature_flags 声明 |
| `design.md#32-state-machine-definition-schema` | YAML 状态机定义 schema |
| `design.md#33-acceptance-report-frontmatter` | Acceptance report artifact 格式 |
| `design.md#34-mutation-result-artifact` | Mutation testing 结果 artifact 格式 |
| `design.md#35-micro_review-output-entry` | Micro_Review 结构化输出格式 |
| `design.md#41-srcstate-machineloaderts` | 状态机 YAML 加载器 |
| `design.md#42-srcstate-machinevalidatorts` | 状态机校验规则 ST001-ST005 |
| `design.md#43-srcstate-machineproperty-derivationts` | Property test 自动派生 |
| `design.md#44-srcaccept-gatets` | Forced Acceptance ship 门禁 |
| `design.md#45-srcmutatets` | Stryker.js 封装 |
| `design.md#46-srcbuild-micro-reviewts` | 单任务 spec 对齐检查 |
| `design.md#47-packspmsutilsbusiness-day-clockts` | 酒店营业日虚拟时钟 |
| `design.md#48-skillsforge-mutateskillmd` | Mutation testing skill 定义 |
| `design.md#49-scriptscheck-iron-lawssh` | Iron Law / Hard Gate 唯一性校验脚本 |
| `design.md#51-forge-ship-含-forced-acceptance-门禁` | Ship 门禁新增 accept-gate 步骤 |
| `design.md#52-forge-build-单任务-micro_review` | Build 每任务后追加 Micro_Review |

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `src/state-machine/types.ts` | CREATE | 状态机类型定义 |
| `src/state-machine/loader.ts` | CREATE | YAML 状态机加载器 |
| `src/state-machine/validator.ts` | CREATE | 状态机校验 ST001-ST005 |
| `src/state-machine/property-derivation.ts` | CREATE | Property test 自动派生 |
| `src/state-machine/index.ts` | CREATE | 模块 barrel export |
| `src/accept-gate.ts` | CREATE | Forced Acceptance 门禁判定 |
| `src/mutate.ts` | CREATE | Stryker.js 封装 |
| `src/build-micro-review.ts` | CREATE | 单任务 Micro_Review 引擎 |
| `src/ship.ts` | MODIFY | 集成 accept-gate 与 mutation verdict |
| `src/build.ts` | MODIFY | 集成 Micro_Review 调用 |
| `scripts/init.sh` | MODIFY | 支持 --pack 参数 |
| `scripts/check-iron-laws.sh` | CREATE | Iron Law / Hard Gate 唯一性校验 |
| `CLAUDE.md` | MODIFY | 铁律 XML 标签化 |
| `.tinkerman/config.md` | MODIFY | frozen zone Hard Gate 标签 |
| `packs/pms/pack.yaml` | CREATE | PMS Pack manifest |
| `packs/pms/README.md` | CREATE | PMS Pack 文档 |
| `packs/pms/contexts/_map.yaml` | CREATE | Context Map 声明 |
| `packs/pms/contexts/*.md` | CREATE | 8 个 Bounded Context 文档 |
| `packs/pms/glossary/*.md` | CREATE | 9 个 Glossary 文件 |
| `packs/pms/banned-patterns.yaml` | CREATE | PMS 禁用词清单 |
| `packs/pms/state-machines/*.yaml` | CREATE | 4 个状态机 YAML 定义 |
| `packs/pms/scenarios/**/*.feature` | CREATE | 20 个 Gherkin 场景 |
| `packs/pms/utils/business-day-clock.ts` | CREATE | BusinessDayClock 类 |
| `packs/pms/utils/business-day-clock.test.ts` | CREATE | BusinessDayClock 测试 |
| `skills/forge-mutate/SKILL.md` | CREATE | Mutation testing skill |
| `skills/forge-mutate/references/frameworks.md` | CREATE | Stryker 配置细节 |
| `skills/forge-build/SKILL.md` | MODIFY | Micro_Review 步骤说明 |
| `skills/forge-ship/SKILL.md` | MODIFY | accept-gate 步骤说明 |
| `skills/forge-spec/SKILL.md` | MODIFY | spec-lock Hard Gate 标签 |
| `skills/forge-plan/SKILL.md` | MODIFY | plan-approve Hard Gate 标签 |
| `skills/forge-review/SKILL.md` | MODIFY | P0/P1 block Hard Gate 标签 |
| `skills/forge-build/references/tdd-rules.md` | MODIFY | Rationalization 扩展至 15+ 条 |
| `test/state-machine/loader.test.ts` | CREATE | Loader 单元测试 |
| `test/state-machine/validator.test.ts` | CREATE | Validator 单元测试 |
| `test/state-machine/property-derivation.test.ts` | CREATE | Property derivation 测试 |
| `test/accept-gate.test.ts` | CREATE | Accept gate 单元测试 |
| `test/mutate.test.ts` | CREATE | Mutate 单元测试 |
| `test/build/micro-review.test.ts` | CREATE | Micro_Review 单元测试 |
| `test/build/micro-review-integration.test.ts` | CREATE | Micro_Review 集成测试 |
| `test/ship/forced-acceptance.test.ts` | CREATE | Ship + accept-gate 集成测试 |
| `test/pms-pack/integration.test.ts` | CREATE | PMS Pack 集成测试 |
| `test/pms-pack/fixtures/**/*` | CREATE | 测试 fixtures |
| `test/pack/zero-pack-invariant.test.ts` | MODIFY | 扩展 zero-pack 回归 |
| `.gitignore` | MODIFY | 追加 reports/mutation/ |

## Task Breakdown

### Phase 1: State Machine 引擎

#### Task 1: 状态机类型定义
- **Goal**: 定义 StateMachineDefinition / ValidationReport / TransitionSpec / InvariantSpec 类型
- **File**: `src/state-machine/types.ts`
- **Design Reference**: `design.md#41-srcstate-machineloaderts` — 状态机数据结构
- **Depends On**: (none)
- **Verify**: `npx vitest run test/state-machine/`
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
- **Design Reference**: `design.md#42-srcstate-machinevalidatorts` — ST001 initial 存在、ST002 引用合法、ST003 终态无出边、ST004 可达性、ST005 无重复
- **Property**: fast-check idempotence — 合法定义 validate 后总是 valid:true
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

#### Task 5: State Machine 模块 barrel export
- **Goal**: 创建 index.ts 统一导出 loader / validator / property-derivation
- **File**: `src/state-machine/index.ts`
- **Design Reference**: `design.md#41-srcstate-machineloaderts` — 模块公共 API
- **Depends On**: Task 2, Task 3, Task 4
- **Verify**: `npx tsc --noEmit`
- **Commit**: `feat(state-machine): add barrel export`

### Phase 2: Forced Acceptance Gate

#### Task 6: Accept Gate 判定逻辑
- **Goal**: 实现 shouldBlockShip 根据 context + enabledPacks + acceptance artifact 判定是否阻断
- **File**: `src/accept-gate.ts`
- **Design Reference**: `design.md#44-srcaccept-gatets` — 6 种组合判定，Zero-Pack no-block
- **Property**: fast-check monotonicity — fail 数增加不会变 unblock
- **Depends On**: (none, 仅依赖 Sprint 1 PackEntry 类型)
- **Verify**: `npx vitest run test/accept-gate.test.ts`
- **Commit**: `feat(accept-gate): implement shouldBlockShip with 6-case logic`

#### Task 7: 集成 accept-gate 到 ship.ts
- **Goal**: 在 ship 门禁序列（Review/Test/Progress）后追加 accept-gate 检查
- **File**: `src/ship.ts`
- **Design Reference**: `design.md#51-forge-ship-含-forced-acceptance-门禁` — block 阻断，warning 通知
- **Depends On**: Task 6
- **Verify**: `npx vitest run test/ship/forced-acceptance.test.ts`
- **Commit**: `feat(ship): integrate forced acceptance gate into ship sequence`

### Phase 3: Mutation Testing

#### Task 8: 添加 Stryker 依赖
- **Goal**: 安装 @stryker-mutator/core 和 @stryker-mutator/vitest-runner
- **File**: `package.json`, `.gitignore`
- **Design Reference**: `design.md#45-srcmutatets` — Stryker 依赖管理
- **Depends On**: (none)
- **Verify**: `npx stryker --version`
- **Commit**: `chore: add stryker mutation testing dependencies`

#### Task 9: Mutation 引擎封装
- **Goal**: 实现 runMutation 封装 Stryker 执行、结果解析、artifact 写入
- **File**: `src/mutate.ts`
- **Design Reference**: `design.md#45-srcmutatets` — union packs globs、生成 stryker.conf.json、计算 score、判定 verdict
- **Depends On**: Task 8
- **Verify**: `npx vitest run test/mutate.test.ts`
- **Commit**: `feat(mutate): implement Stryker wrapper with score calculation`

#### Task 10: Mutation skill 定义
- **Goal**: 创建 skills/forge-mutate/SKILL.md 主体 ≤150 行
- **File**: `skills/forge-mutate/SKILL.md`, `skills/forge-mutate/references/frameworks.md`
- **Design Reference**: `design.md#48-skillsforge-mutateskillmd` — subcommands、8 类 mutation、ship 集成
- **Depends On**: Task 9
- **Verify**: `cat skills/forge-mutate/SKILL.md | wc -l` (≤150)
- **Commit**: `feat(mutate): add forge-mutate skill definition`

### Phase 4: Micro-Review

#### Task 11: Micro-Review 引擎
- **Goal**: 实现 runMicroReview 对照 Plan 验收标准检查 covered/overBuilt/missing
- **File**: `src/build-micro-review.ts`
- **Design Reference**: `design.md#46-srcbuild-micro-reviewts` — v1 严格模式 + legacy loose 模式
- **Property**: fast-check idempotence — 同输入同输出
- **Depends On**: (none)
- **Verify**: `npx vitest run test/build/micro-review.test.ts`
- **Commit**: `feat(micro-review): implement task-level spec alignment check`

#### Task 12: 集成 Micro-Review 到 build.ts
- **Goal**: 每个 atomic task Verify GREEN 后调用 runMicroReview，needs_iteration 最多 3 轮
- **File**: `src/build.ts`
- **Design Reference**: `design.md#52-forge-build-单任务-micro_review` — 每任务后输出 Micro_Review 块
- **Depends On**: Task 11
- **Verify**: `npx vitest run test/build/micro-review-integration.test.ts`
- **Commit**: `feat(build): integrate micro-review into task execution flow`

### Phase 5: TDD 狠度强化

#### Task 13: CLAUDE.md 铁律 XML 标签化
- **Goal**: 将 §2.1/2.3/2.4/2.7 铁律包裹为 `<IRON-LAW name="...">` 标签
- **File**: `CLAUDE.md`
- **Design Reference**: `design.md#49-scriptscheck-iron-lawssh` — XML 标签语义标记
- **Depends On**: (none)
- **Verify**: `bash scripts/check-iron-laws.sh`
- **Commit**: `refactor(claude-md): wrap iron laws in XML tags`

#### Task 14: Skill 级 Hard Gate XML 标签化
- **Goal**: 将 spec-lock / plan-approve / p0-p1-block / ship-gates 包裹为 `<HARD-GATE>` 标签
- **File**: `skills/forge-spec/SKILL.md`, `skills/forge-plan/SKILL.md`, `skills/forge-review/SKILL.md`, `skills/forge-ship/SKILL.md`, `.tinkerman/config.md`
- **Design Reference**: `design.md#49-scriptscheck-iron-lawssh` — Hard Gate 唯一性
- **Depends On**: Task 13
- **Verify**: `bash scripts/check-iron-laws.sh`
- **Commit**: `refactor(skills): wrap hard gates in XML tags`

#### Task 15: Iron Law 唯一性校验脚本
- **Goal**: 实现 check-iron-laws.sh 提取所有 IRON-LAW/HARD-GATE name 属性并校验唯一
- **File**: `scripts/check-iron-laws.sh`
- **Design Reference**: `design.md#49-scriptscheck-iron-lawssh` — rg 提取 + sort + uniq -d
- **Depends On**: Task 13, Task 14
- **Verify**: `bash scripts/check-iron-laws.sh && echo "OK"`
- **Commit**: `feat(scripts): add iron law uniqueness check script`

#### Task 16: Rationalization Catalog 扩展
- **Goal**: 将 tdd-rules.md Rationalization 表扩展至 15+ 条，分 5 子类别
- **File**: `skills/forge-build/references/tdd-rules.md`
- **Design Reference**: R11.1-11.5 — Superpowers 12 条翻译 + Forge 原有 3+ 条
- **Depends On**: (none)
- **Verify**: `grep -c '|.*|.*|' skills/forge-build/references/tdd-rules.md` (≥15)
- **Commit**: `feat(tdd-rules): expand rationalization catalog to 15+ entries`

### Phase 6: PMS Pack 骨架

#### Task 17: PMS Pack manifest 与 README
- **Goal**: 创建 pack.yaml 含完整 feature_flags + README.md 含 8 Context/4 状态机/20 场景索引
- **File**: `packs/pms/pack.yaml`, `packs/pms/README.md`
- **Design Reference**: `design.md#31-packsppmspackyaml` — manifest schema
- **Depends On**: (none)
- **Verify**: `npx vitest run test/pack/` (pack validate 通过)
- **Commit**: `feat(pms-pack): add pack manifest and README`

#### Task 18: 8 个 Bounded Context 文档
- **Goal**: 创建 8 个 context markdown 文件含完整 frontmatter 和 150-300 字 body
- **File**: `packs/pms/contexts/*.md` (8 files)
- **Design Reference**: R1.2 — 8 BC 含完整 frontmatter
- **Depends On**: Task 17
- **Verify**: `npx vitest run test/pack/`
- **Commit**: `feat(pms-pack): add 8 bounded context documents`

#### Task 19: Context Map 声明
- **Goal**: 创建 _map.yaml 声明 ≥6 条边覆盖 4 种关系类型
- **File**: `packs/pms/contexts/_map.yaml`
- **Design Reference**: R1.3 — partnership / customer-supplier / acl / open-host
- **Depends On**: Task 18
- **Verify**: `npx vitest run test/pack/`
- **Commit**: `feat(pms-pack): add context map with 6+ edges`

### Phase 7: PMS Glossary 与禁用词

#### Task 20: 分 Context Glossary
- **Goal**: 创建 9 个 glossary 文件含 ≥10 terms/context，Room/Guest 在 3+ context 分别定义
- **File**: `packs/pms/glossary/*.md` (9 files)
- **Design Reference**: R2.1-2.6 — aliases 含中文同义词
- **Depends On**: Task 17
- **Verify**: `npx vitest run test/pack/`
- **Commit**: `feat(pms-pack): add context-specific glossary files`

#### Task 21: PMS 禁用词清单
- **Goal**: 创建 banned-patterns.yaml 含 4 类别（code/infrastructure/framework/technical）
- **File**: `packs/pms/banned-patterns.yaml`
- **Design Reference**: R3.1-3.7 — regex + 具体类名
- **Depends On**: Task 17
- **Verify**: `npx vitest run test/pack/`
- **Commit**: `feat(pms-pack): add banned patterns for PMS domain`

### Phase 8: PMS 状态机

#### Task 22: Reservation 状态机
- **Goal**: 定义 6 states + ≥10 transitions + ≥3 invariants
- **File**: `packs/pms/state-machines/reservation.yaml`
- **Design Reference**: `design.md#32-state-machine-definition-schema` — Reservation SM 示例
- **Depends On**: Task 2, Task 17
- **Verify**: `npx vitest run test/state-machine/`
- **Commit**: `feat(pms-pack): add reservation state machine definition`

#### Task 23: Folio 状态机
- **Goal**: 定义 4 states + ≥6 transitions + closed-then-void-only invariant
- **File**: `packs/pms/state-machines/folio.yaml`
- **Design Reference**: R5.3 — Open/Posted/Closed/Voided
- **Depends On**: Task 2, Task 17
- **Verify**: `npx vitest run test/state-machine/`
- **Commit**: `feat(pms-pack): add folio state machine definition`

#### Task 24: RoomStatus 状态机
- **Goal**: 定义 7 states + transitions 覆盖 check-in/out/housekeeping/inspection/maintenance
- **File**: `packs/pms/state-machines/room-status.yaml`
- **Design Reference**: R5.4 — Available/Occupied/Dirty/Clean/Inspected/OutOfService/OutOfOrder
- **Depends On**: Task 2, Task 17
- **Verify**: `npx vitest run test/state-machine/`
- **Commit**: `feat(pms-pack): add room status state machine definition`

#### Task 25: HousekeepingTask 状态机
- **Goal**: 定义 4 states + Skipped 从任何非终态可达
- **File**: `packs/pms/state-machines/housekeeping-task.yaml`
- **Design Reference**: R5.5 — Pending/InProgress/Completed/Skipped
- **Depends On**: Task 2, Task 17
- **Verify**: `npx vitest run test/state-machine/`
- **Commit**: `feat(pms-pack): add housekeeping task state machine definition`

### Phase 9: BusinessDayClock

#### Task 26: BusinessDayClock 实现
- **Goal**: 实现 getBusinessDay / nextCutoff / isSameBusinessDay / addBusinessDays + withBusinessDay fixture
- **File**: `packs/pms/utils/business-day-clock.ts`, `packs/pms/utils/business-day-clock.test.ts`
- **Design Reference**: `design.md#47-packspmsutilsbusiness-day-clockts` — Intl.DateTimeFormat，无 moment/date-fns
- **Property**: fast-check 反身对称 / 零 delta / round-trip
- **Depends On**: (none)
- **Verify**: `npx vitest run packs/pms/utils/business-day-clock.test.ts`
- **Commit**: `feat(pms-pack): implement BusinessDayClock with DST support`

### Phase 10: PMS 预置场景

#### Task 27: Check-in 场景（5 个）
- **Goal**: 创建 walk-in / early-arrival / late-arrival / group / payment-failure 场景
- **File**: `packs/pms/scenarios/check-in/*.feature` (5 files)
- **Design Reference**: R14.1, R14.4 — 场景覆盖要求
- **Depends On**: Task 21
- **Verify**: Scenario Linter pass + Leak Detector empty
- **Commit**: `feat(pms-pack): add 5 check-in scenarios`

#### Task 28: Check-out 场景（3 个）
- **Goal**: 创建 express-checkout / late-checkout-with-fee / dispute 场景
- **File**: `packs/pms/scenarios/check-out/*.feature` (3 files)
- **Design Reference**: R14.4
- **Depends On**: Task 21
- **Verify**: Scenario Linter pass + Leak Detector empty
- **Commit**: `feat(pms-pack): add 3 check-out scenarios`

#### Task 29: Night Audit 场景（4 个）
- **Goal**: 创建 normal-run / no-show-processing / room-move-reconciliation / interrupted-resumed 场景
- **File**: `packs/pms/scenarios/night-audit/*.feature` (4 files)
- **Design Reference**: R14.4
- **Depends On**: Task 21
- **Verify**: Scenario Linter pass + Leak Detector empty
- **Commit**: `feat(pms-pack): add 4 night audit scenarios`

#### Task 30: Reservation 场景（4 个）
- **Goal**: 创建 individual / group / modification / cancellation-within-policy 场景
- **File**: `packs/pms/scenarios/reservation/*.feature` (4 files)
- **Design Reference**: R14.4
- **Depends On**: Task 21
- **Verify**: Scenario Linter pass + Leak Detector empty
- **Commit**: `feat(pms-pack): add 4 reservation scenarios`

#### Task 31: Folio 场景（4 个）
- **Goal**: 创建 charge-posting / split-folio / tax-adjustment / deposit-refund 场景
- **File**: `packs/pms/scenarios/folio/*.feature` (4 files)
- **Design Reference**: R14.4
- **Depends On**: Task 21
- **Verify**: Scenario Linter pass + Leak Detector empty
- **Commit**: `feat(pms-pack): add 4 folio scenarios`

#### Task 32: 场景质量校验
- **Goal**: 所有 20 场景通过 Scenario Linter (SCN001-SCN004) + Leak Detector
- **File**: (verification only)
- **Design Reference**: R14.2, R14.3 — 质量 gate
- **Depends On**: Task 27, Task 28, Task 29, Task 30, Task 31
- **Verify**: `npx vitest run test/pms-pack/`
- **Commit**: `test(pms-pack): validate all 20 scenarios pass linter and leak detector`

### Phase 11: Init Template 扩展

#### Task 33: init.sh --pack 参数支持
- **Goal**: 解析 multi-valued --pack 参数，写入 config.md frontmatter packs 列表
- **File**: `scripts/init.sh`
- **Design Reference**: R13.1, R13.4, R13.5 — 幂等、pack 不存在 warn 继续
- **Depends On**: Task 17
- **Verify**: `bash scripts/init.sh --help` 显示 --pack 选项
- **Commit**: `feat(init): add --pack flag for pack enablement during init`

#### Task 34: PMS 专属交互流程
- **Goal**: --pack pms 启用时提示 business_day_cutoff_hour / timezone，创建 .tinkerman/custom/，打印欢迎消息
- **File**: `scripts/init.sh`
- **Design Reference**: R13.2, R13.3 — 交互提示含默认值
- **Depends On**: Task 33
- **Verify**: `bash -c 'echo "4\nAsia/Shanghai" | bash scripts/init.sh --pack pms'`
- **Commit**: `feat(init): add PMS-specific interactive prompts`

### Phase 12: Zero-Pack 回归 + 集成测试

#### Task 35: Zero-Pack 回归扩展
- **Goal**: 扩展 zero-pack-invariant.test.ts 覆盖 accept-gate / mutate / micro-review / state-machine 空输入
- **File**: `test/pack/zero-pack-invariant.test.ts`
- **Design Reference**: R15.4 — Zero-Pack-Zero-Impact 继续
- **Depends On**: Task 6, Task 9, Task 11
- **Verify**: `npx vitest run test/pack/zero-pack-invariant.test.ts`
- **Commit**: `test(zero-pack): extend regression for accept-gate/mutate/micro-review/state-machine`

#### Task 36: PMS Pack 集成测试
- **Goal**: 集成测试覆盖 detectSpecLeak + detectContextTermMismatch + 4 状态机 property 派生编译
- **File**: `test/pms-pack/integration.test.ts`
- **Design Reference**: `design.md#62-property-tests` — 跨子系统验证
- **Depends On**: Task 22, Task 23, Task 24, Task 25
- **Verify**: `npx vitest run test/pms-pack/`
- **Commit**: `test(pms-pack): add integration tests for leak detection and state machines`

### Phase 13: 文档与发布验证

#### Task 37: 文档更新与 smoke test
- **Goal**: 更新 README/CHANGELOG/ADR，运行完整 smoke test 验证所有 Exit Criteria
- **File**: `README.md`, `CHANGELOG.md`, `.tinkerman/knowledge/adr-index.md`, `.tinkerman/decisions/ADR-NNNN-pms-pack-v1.md`
- **Design Reference**: 全部 Exit Criteria
- **Depends On**: all previous tasks
- **Verify**: `npm run check && bash scripts/check-iron-laws.sh`
- **Commit**: `docs(pms-pack): add README section, CHANGELOG, and ADR`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|------------------|----------------|
| R1 PMS Pack 骨架 | Task 17, Task 18, Task 19 |
| R2 分 Context 语言 | Task 20 |
| R3 禁用词清单 | Task 21 |
| R4 状态机引擎 | Task 1, Task 2, Task 3, Task 4, Task 5 |
| R5 PMS 4 状态机 | Task 22, Task 23, Task 24, Task 25 |
| R6 Forced Acceptance | Task 6, Task 7 |
| R7 Mutation 引擎 | Task 8, Task 9, Task 10 |
| R8 PMS Mutation 集成 | Task 17 (feature_flags), Task 9 |
| R9 Micro-Review | Task 11, Task 12 |
| R10 XML 铁律标签 | Task 13, Task 14, Task 15 |
| R11 Rationalization | Task 16 |
| R12 BusinessDayClock | Task 26 |
| R13 Init Template | Task 33, Task 34 |
| R14 预置场景 | Task 27, Task 28, Task 29, Task 30, Task 31, Task 32 |
| R15 NFR | Task 26 (perf), Task 3/4/6/11/26 (property), Task 35 (zero-pack), Task 36 (integration) |

## Task Dependencies

```
Phase 1 (Tasks 1-5)  ──────────────────────┐
Phase 2 (Tasks 6-7)  ──────────────────────┤
Phase 3 (Tasks 8-10) ──────────────────────┤
Phase 4 (Tasks 11-12) ─────────────────────┤── Phase 12 (Tasks 35-36)
Phase 5 (Tasks 13-16) ─────────────────────┤
Phase 6 (Tasks 17-19) ─┐                    │
Phase 7 (Tasks 20-21) ─┤                    │
Phase 8 (Tasks 22-25) ─┼── Phase 10 (Tasks 27-32) ──┤
Phase 9 (Task 26) ─────┘                             │
Phase 11 (Tasks 33-34) ──────────────────────────────┤
                                                       │
                                       Phase 13 (Task 37) ◀──┘
```
