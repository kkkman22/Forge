---
topic: "ddd-tactical-bdd-collaboration"
status: "approved"
date: "2026-05-10"
spec_ref: ".kiro/specs/ddd-tactical-bdd-collaboration"
format: "lightweight"
---

## Objective

实现 Forge Sprint 3：DDD 战术模板 + BDD 协作层，补齐"引擎在 Core，数据在 Pack"的最终拼图。交付 6 个 Core 引擎模块、1 个新 skill、1 个新 agent、1 个新 hook、PMS Pack 扩展（模板/规则/场景）和示例 Pack。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#4-1-template-renderer` | 模板占位符替换引擎 |
| `design.md#4-2-storm` | Event Storm 状态管理 + 文件序列化 |
| `design.md#4-3-context-boundary` | 跨 Context 依赖判定 + import 解析 |
| `design.md#4-4-lint-pack-rules` | Pack-provided lint 规则声明式加载器 |
| `design.md#4-5-living-doc-generator` | 活文档数据聚合 |
| `design.md#4-6-living-doc-renderer` | 活文档 HTML 渲染（无框架） |
| `design.md#4-7-forge-storm-skill` | forge-storm SKILL.md 结构 |
| `design.md#4-8-business-analyst` | business-analyst agent 定义 |
| `design.md#4-9-spec-ts-extension` | spec.ts business-analyst 并行触发 |
| `design.md#3-1-template-placeholder` | TemplateContext + RenderResult 类型 |
| `design.md#3-2-event-storm-format` | event-storm.md 文件格式 |
| `design.md#3-3-living-doc-data` | LivingDocData 聚合类型 |
| `design.md#3-4-context-boundary-io` | BoundaryCheckInput/Output 类型 |
| `design.md#3-5-pack-lint-manifest` | Lint Rule YAML manifest schema |
| `design.md#6-testing-strategy` | 测试策略（unit + property + integration） |
| `design.md#7-security` | 安全考量 |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `src/template-renderer.ts` | CREATE | DDD 模板占位符替换引擎 |
| `test/template-renderer.test.ts` | CREATE | 模板渲染器单元测试 |
| `templates/ddd/aggregate-root.ts.template` | CREATE | 聚合根模板 |
| `templates/ddd/aggregate-root.md` | CREATE | 聚合根文档 |
| `templates/ddd/value-object.ts.template` | CREATE | 值对象模板 |
| `templates/ddd/value-object.md` | CREATE | 值对象文档 |
| `templates/ddd/domain-event.ts.template` | CREATE | 领域事件模板 |
| `templates/ddd/domain-event.md` | CREATE | 领域事件文档 |
| `templates/ddd/repository-interface.ts.template` | CREATE | Repository 接口模板 |
| `templates/ddd/repository-interface.md` | CREATE | Repository 文档 |
| `templates/ddd/domain-service.ts.template` | CREATE | 领域服务模板 |
| `templates/ddd/domain-service.md` | CREATE | 领域服务文档 |
| `templates/ddd/saga.ts.template` | CREATE | Saga/Process Manager 模板 |
| `templates/ddd/saga.md` | CREATE | Saga 文档 |
| `packs/pms/templates/ddd/reservation-aggregate.ts.template` | CREATE | PMS 预订聚合根模板 |
| `packs/pms/templates/ddd/folio-aggregate.ts.template` | CREATE | PMS 账单聚合根模板 |
| `packs/pms/templates/ddd/room-value-object.ts.template` | CREATE | PMS 房间值对象模板 |
| `packs/pms/templates/ddd/guest-profile-value-object.ts.template` | CREATE | PMS 客人档案值对象模板 |
| `src/storm.ts` | CREATE | Event Storm 状态管理 |
| `test/storm.test.ts` | CREATE | Storm 单元测试 |
| `skills/forge-storm/SKILL.md` | CREATE | forge-storm skill |
| `skills/forge-storm/references/example-storm.md` | CREATE | PMS 事件风暴示例 |
| `src/context-boundary.ts` | CREATE | 跨 Context 边界判定引擎 |
| `test/context-boundary.test.ts` | CREATE | 边界判定单元测试 |
| `scripts/check-context-boundary.mjs` | CREATE | PreToolUse hook 脚本 |
| `test/context-boundary/hook.test.ts` | CREATE | Hook 集成测试 |
| `hooks/hooks.json` | MODIFY | 新增 Write/Edit PreToolUse context boundary hook |
| `.claude/agents/business-analyst.md` | CREATE | business-analyst agent |
| `packs/pms/pack.yaml` | MODIFY | 追加 core_subdomains 字段 |
| `test/pack/core-subdomains.test.ts` | CREATE | core_subdomains 字段测试 |
| `src/spec.ts` | MODIFY | business-analyst 并行触发逻辑 |
| `test/spec/business-analyst-integration.test.ts` | CREATE | business-analyst 集成测试 |
| `src/living-doc/generator.ts` | CREATE | 活文档数据聚合 |
| `src/living-doc/renderer.ts` | CREATE | 活文档 HTML 渲染 |
| `test/living-doc/generator.test.ts` | CREATE | 生成器单元测试 |
| `test/living-doc/renderer.test.ts` | CREATE | 渲染器单元测试 |
| `src/lint/pack-rules.ts` | CREATE | Pack lint 规则加载器+执行器 |
| `test/lint/pack-rules.test.ts` | CREATE | 规则加载器单元测试 |
| `packs/pms/lint-rules/manifest.yaml` | CREATE | PMS lint 规则清单 |
| `packs/pms/lint-rules/money/no-number-for-money.yaml` | CREATE | Money lint 规则 1 |
| `packs/pms/lint-rules/money/require-money-factory.yaml` | CREATE | Money lint 规则 2 |
| `packs/pms/lint-rules/money/explicit-currency-exchange.yaml` | CREATE | Money lint 规则 3 |
| `packs/pms/lint-rules/time/no-raw-date-in-domain.yaml` | CREATE | Time lint 规则 1 |
| `packs/pms/lint-rules/time/prefer-business-day-clock.yaml` | CREATE | Time lint 规则 2 |
| `scripts/lint-pack-rules.mjs` | CREATE | CI lint 集成脚本 |
| `packs/pms/scenarios/overbooking/*.feature` | CREATE | 5 个超售场景 |
| `packs/pms/scenarios/corporate/*.feature` | CREATE | 5 个协议客户场景 |
| `packs/pms/scenarios/pos-integration/*.feature` | CREATE | 5 个 POS 集成场景 |
| `packs/pms/scenarios/invoice-tax/*.feature` | CREATE | 5 个发票税务场景 |
| `packs/pms/scenarios/loyalty/*.feature` | CREATE | 5 个会员积分场景 |
| `packs/pms/README.md` | MODIFY | 更新场景索引到 50+ |
| `packs/pms-marriott-sample/pack.yaml` | CREATE | 示例 Pack manifest |
| `packs/pms-marriott-sample/README.md` | CREATE | 示例 Pack 文档 |
| `packs/pms-marriott-sample/contexts/bonvoy-loyalty.md` | CREATE | 新 Bounded Context |
| `packs/pms-marriott-sample/glossary/folio-billing.md` | CREATE | 追加术语 |
| `packs/pms-marriott-sample/state-machines/reservation.yaml` | CREATE | 覆盖状态机 |
| `packs/pms-marriott-sample/scenarios/bonvoy/*.feature` | CREATE | 2 个 Bonvoy 场景 |
| `test/pack/zero-pack-invariant.test.ts` | MODIFY | 扩展 Sprint 3 Zero-Pack 回归 |
| `test/sprint3/integration.test.ts` | CREATE | Sprint 3 集成测试 |

## Task Breakdown

### Task 1: Template Renderer 引擎

- **Goal**: 实现 `{{name}}`、`{{#each}}`、`{{#if}}` 占位符替换引擎
- **File**: `src/template-renderer.ts`
- **Design Reference**: `design.md#4-1-template-renderer` — 简易模板替换不引入 Handlebars
- **Property**: 空 context → 原样返回（identity）
- **Depends On**: (none)
- **Verify**: `npx vitest run test/template-renderer.test.ts`
- **Commit**: `feat(template-renderer): add placeholder/each/if rendering engine`

### Task 2: Core DDD 战术模板（6 个）

- **Goal**: 创建 6 个 Core 层 DDD 战术模板 + 文档，占位符替换后可通过 tsc
- **File**: `templates/ddd/*.ts.template` + `templates/ddd/*.md`（12 文件）
- **Design Reference**: `design.md#3-1-template-placeholder` — TemplateContext schema
- **Depends On**: Task 1
- **Verify**: 用 template-renderer 渲染每个模板，tsc --noEmit 通过
- **Commit**: `feat(templates): add 6 Core DDD tactical pattern templates`

### Task 3: PMS Pack 战术模板覆盖（4 个）

- **Goal**: 创建 4 个 PMS 特化战术模板，Override Resolver 正确解析优先级
- **File**: `packs/pms/templates/ddd/*.ts.template`（4 文件）
- **Design Reference**: `design.md#4-1-template-renderer` — Override Resolver 三层解析
- **Depends On**: Task 2
- **Verify**: Override Resolver 选 PMS 模板优先于 Core；`/forge pack inspect pms` 报告 templates 数
- **Commit**: `feat(pms-templates): add 4 PMS-specific DDD tactical templates`

### Task 4: Event Storm 状态管理

- **Goal**: 实现 StormState 序列化/反序列化 + 5 阶段推进 + resume
- **File**: `src/storm.ts`
- **Design Reference**: `design.md#4-2-storm` — StormState 接口 + load/save/nextPhase/serialize
- **Property**: 任意 state → serialize → parse → 无损
- **Depends On**: (none)
- **Verify**: `npx vitest run test/storm.test.ts`
- **Commit**: `feat(storm): add Event Storm state management engine`

### Task 5: forge-storm Skill

- **Goal**: 创建 forge-storm SKILL.md（≤150 行）+ PMS 示例 reference
- **File**: `skills/forge-storm/SKILL.md` + `skills/forge-storm/references/example-storm.md`
- **Design Reference**: `design.md#4-7-forge-storm-skill` — 5 阶段 Socratic 流程 + resume
- **Depends On**: Task 4
- **Verify**: SKILL.md 结构完整，含 8 个必选章节 + Common Rationalizations 表
- **Commit**: `feat(forge-storm): add event storming skill with PMS example`

### Task 6: Context Boundary 判定引擎

- **Goal**: 实现 ownership map 加载、file context 解析、import 解析、6 种关系类型 allow/deny 矩阵
- **File**: `src/context-boundary.ts`
- **Design Reference**: `design.md#4-3-context-boundary` — loadOwnershipMap/resolveFileContext/parseImports/checkBoundary
- **Property**: 未声明关系总是 violation
- **Depends On**: (none)
- **Verify**: `npx vitest run test/context-boundary.test.ts`
- **Commit**: `feat(context-boundary): add cross-context dependency checker`

### Task 7: Context Boundary Hook 脚本

- **Goal**: 实现 PreToolUse hook 脚本 + 更新 hooks.json
- **File**: `scripts/check-context-boundary.mjs` + `hooks/hooks.json`（MODIFY）
- **Design Reference**: `design.md#4-3-context-boundary` — Hook 运行时流程
- **Depends On**: Task 6
- **Verify**: `npx vitest run test/context-boundary/hook.test.ts`；hook 性能 ≤150ms
- **Commit**: `feat(context-boundary): add PreToolUse hook for import boundary check`

### Task 8: business-analyst Agent + core_subdomains 字段

- **Goal**: 创建 agent 定义 + 扩展 PackManifest 支持 core_subdomains
- **File**: `.claude/agents/business-analyst.md` + `packs/pms/pack.yaml`（MODIFY）
- **Design Reference**: `design.md#4-8-business-analyst` — agent 定义 + `design.md#4-9-spec-ts-extension` 字段
- **Depends On**: (none)
- **Verify**: `npx vitest run test/pack/core-subdomains.test.ts`
- **Commit**: `feat(business-analyst): add agent definition and core_subdomains field`

### Task 9: spec.ts business-analyst 并行触发

- **Goal**: Core 子域 spec Propose 阶段触发 product + business-analyst + architect 三方并行
- **File**: `src/spec.ts`（MODIFY）
- **Design Reference**: `design.md#4-9-spec-ts-extension` — getCoreSubdomains + Promise.allSettled
- **Depends On**: Task 8
- **Verify**: `npx vitest run test/spec/business-analyst-integration.test.ts`
- **Commit**: `feat(spec): trigger business-analyst for core subdomain specs`

### Task 10: 活文档生成器

- **Goal**: 扫描 specs + acceptance reports，聚合 LivingDocData
- **File**: `src/living-doc/generator.ts`
- **Design Reference**: `design.md#4-5-living-doc-generator` — generateLivingDoc 实现
- **Depends On**: (none)
- **Verify**: `npx vitest run test/living-doc/generator.test.ts`
- **Commit**: `feat(living-doc): add spec/acceptance data aggregation engine`

### Task 11: 活文档 HTML 渲染器

- **Goal**: 无框架 HTML 渲染，输出 index.html + per-context pages + assets/
- **File**: `src/living-doc/renderer.ts`
- **Design Reference**: `design.md#4-6-living-doc-renderer` — template literal 渲染 + WCAG AA
- **Depends On**: Task 10
- **Verify**: `npx vitest run test/living-doc/renderer.test.ts`；500 scenarios ≤5s
- **Commit**: `feat(living-doc): add HTML renderer with WCAG AA support`

### Task 12: `/forge spec --living-doc` CLI 集成

- **Goal**: 更新 forge-spec SKILL.md 追加 --living-doc 子流程
- **File**: `skills/forge-spec/SKILL.md`（MODIFY）
- **Design Reference**: `design.md#4-5-living-doc-generator` — CLI flag 解析
- **Depends On**: Task 11
- **Verify**: `/forge spec --living-doc` 在空项目生成骨架页
- **Commit**: `feat(living-doc): integrate --living-doc flag into forge-spec`

### Task 13: Pack Lint 规则引擎

- **Goal**: 声明式 YAML lint 规则加载器 + 执行器 + CI 脚本
- **File**: `src/lint/pack-rules.ts` + `scripts/lint-pack-rules.mjs`
- **Design Reference**: `design.md#4-4-lint-pack-rules` — loadPackLintRules/applyLintRulesToFile
- **Depends On**: (none)
- **Verify**: `npx vitest run test/lint/pack-rules.test.ts`
- **Commit**: `feat(lint): add declarative YAML lint rule engine for packs`

### Task 14: PMS Money Lint 规则

- **Goal**: 3 条 YAML lint 规则 + manifest 注册
- **File**: `packs/pms/lint-rules/money/*.yaml`（3 文件）+ `packs/pms/lint-rules/manifest.yaml`
- **Design Reference**: `design.md#3-5-pack-lint-manifest` — YAML 规则 schema
- **Depends On**: Task 13
- **Verify**: 每规则正反例测试通过
- **Commit**: `feat(pms-lint): add Money lint rules (no-number-for-money, require-money-factory, explicit-currency-exchange)`

### Task 15: PMS Time Lint 规则

- **Goal**: 2 条 YAML lint 规则 + manifest 更新
- **File**: `packs/pms/lint-rules/time/*.yaml`（2 文件）
- **Design Reference**: `design.md#3-5-pack-lint-manifest` — 同上
- **Depends On**: Task 13
- **Verify**: 每规则正反例测试通过
- **Commit**: `feat(pms-lint): add Time lint rules (no-raw-date, prefer-business-day-clock)`

### Task 16: PMS Overbooking 场景（5 个）

- **Goal**: overbook-within-policy, upgrade-to-resolve, walk-the-guest, declined-at-check-in, compensation-policy
- **File**: `packs/pms/scenarios/overbooking/*.feature`（5 文件）
- **Design Reference**: `design.md#2-high-level-architecture` — PMS Pack 扩展
- **Depends On**: (none)
- **Verify**: Scenario Linter + Leak Detector 全过
- **Commit**: `feat(pms-scenarios): add 5 overbooking scenarios`

### Task 17: PMS Corporate 场景（5 个）

- **Goal**: company-rate, direct-bill-setup, monthly-invoice, credit-limit-exceeded, contract-expiry
- **File**: `packs/pms/scenarios/corporate/*.feature`（5 文件）
- **Design Reference**: `design.md#2-high-level-architecture` — PMS Pack 扩展
- **Depends On**: (none)
- **Verify**: Scenario Linter + Leak Detector 全过
- **Commit**: `feat(pms-scenarios): add 5 corporate account scenarios`

### Task 18: PMS POS Integration 场景（5 个）

- **Goal**: charge-to-room, split-bill, pos-offline-queue, chargeback, item-void-sync
- **File**: `packs/pms/scenarios/pos-integration/*.feature`（5 文件）
- **Design Reference**: `design.md#2-high-level-architecture` — PMS Pack 扩展
- **Depends On**: (none)
- **Verify**: Scenario Linter + Leak Detector 全过
- **Commit**: `feat(pms-scenarios): add 5 POS integration scenarios`

### Task 19: PMS Invoice-Tax 场景（5 个）

- **Goal**: vat-invoice, us-sales-tax, split-tax-multi-jurisdiction, refund-with-tax-adjustment, void-invoice
- **File**: `packs/pms/scenarios/invoice-tax/*.feature`（5 文件）
- **Design Reference**: `design.md#2-high-level-architecture` — PMS Pack 扩展
- **Depends On**: (none)
- **Verify**: Scenario Linter + Leak Detector 全过
- **Commit**: `feat(pms-scenarios): add 5 invoice/tax scenarios`

### Task 20: PMS Loyalty 场景（5 个）

- **Goal**: earn-points-on-stay, redeem-points, tier-upgrade, loyalty-rate, partner-airline-miles
- **File**: `packs/pms/scenarios/loyalty/*.feature`（5 文件）
- **Design Reference**: `design.md#2-high-level-architecture` — PMS Pack 扩展
- **Depends On**: (none)
- **Verify**: Scenario Linter + Leak Detector 全过
- **Commit**: `feat(pms-scenarios): add 5 loyalty scenarios`

### Task 21: 场景质量校验 + README 更新

- **Goal**: 所有 25 新场景通过 linter，README 更新到 50+ 索引
- **File**: `packs/pms/README.md`（MODIFY）
- **Design Reference**: `design.md#2-high-level-architecture` — 场景库验证
- **Depends On**: Task 16, Task 17, Task 18, Task 19, Task 20
- **Verify**: `npx vitest run test/scenario-linter.test.ts`；场景总数 ≥50
- **Commit**: `feat(pms-scenarios): validate 25 new scenarios and update README to 50+`

### Task 22: Customization Sample Pack 骨架

- **Goal**: 创建 pms-marriott-sample Pack manifest + README
- **File**: `packs/pms-marriott-sample/pack.yaml` + `packs/pms-marriott-sample/README.md`
- **Design Reference**: `design.md#2-high-level-architecture` — Sample Pack 结构
- **Depends On**: (none)
- **Verify**: pack.yaml 语法正确，depends_on + experimental 字段存在
- **Commit**: `feat(sample-pack): add pms-marriott-sample pack skeleton`

### Task 23: Sample Pack 覆盖层演示

- **Goal**: 新 Context + 追加 glossary + 覆盖 state machine + 2 个场景
- **File**: `packs/pms-marriott-sample/contexts/bonvoy-loyalty.md` + `glossary/folio-billing.md` + `state-machines/reservation.yaml` + `scenarios/bonvoy/*.feature`
- **Design Reference**: `design.md#2-high-level-architecture` — 三层覆盖演示
- **Depends On**: Task 3, Task 22
- **Verify**: `/forge pack inspect pms-marriott-sample` 显示完整覆盖
- **Commit**: `feat(sample-pack): add override layer demos (context, glossary, state-machine, scenarios)`

### Task 24: Zero-Pack 回归测试扩展

- **Goal**: 扩展 zero-pack-invariant 测试覆盖 Sprint 3 所有新增模块
- **File**: `test/pack/zero-pack-invariant.test.ts`（MODIFY）
- **Design Reference**: `design.md#6-testing-strategy` — 6.3 Integration Tests
- **Depends On**: Task 6, Task 8, Task 10, Task 13
- **Verify**: `npx vitest run test/pack/zero-pack-invariant.test.ts`
- **Commit**: `test(zero-pack): extend regression for Sprint 3 modules`

### Task 25: Sprint 3 集成测试

- **Goal**: 端到端验证 forge-storm → spec → business-analyst → living-doc → context-boundary
- **File**: `test/sprint3/integration.test.ts`
- **Design Reference**: `design.md#6-testing-strategy` — 6.3 Integration Tests
- **Depends On**: Task 5, Task 7, Task 9, Task 12, Task 24
- **Verify**: `npx vitest run test/sprint3/integration.test.ts`
- **Commit**: `test(sprint3): add end-to-end integration tests`

### Task 26: CI 全量校验

- **Goal**: `npm run check` + `npm run docs` + `bash scripts/build-dist.sh` 全绿
- **File**: (no new files, verification only)
- **Design Reference**: `design.md#12-nfr` — R12 NFR
- **Depends On**: Task 25
- **Verify**: `npm run check && npm run docs && bash scripts/build-dist.sh`
- **Commit**: (no commit — verification gate)

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| R1: Core 战术模板 | Task 1, Task 2 |
| R2: PMS Pack 战术模板 | Task 3 |
| R3: forge-storm | Task 4, Task 5 |
| R4: Context Boundary Hook | Task 6, Task 7 |
| R5: business-analyst Agent | Task 8, Task 9 |
| R6: 活文档生成 | Task 10, Task 11, Task 12 |
| R7: Money Lint | Task 13, Task 14 |
| R8: Time Lint | Task 13, Task 15 |
| R9: PMS 场景库扩展 | Task 16-21 |
| R10: Customization Sample Pack | Task 22, Task 23 |
| R11: core_subdomains 声明 | Task 8 |
| R12: NFR | Task 24, Task 25, Task 26 |

## Dependency Graph

```
Task 1 ──→ Task 2 ──→ Task 3 ──→ Task 23
Task 4 ──→ Task 5 ──────────────────┐
Task 6 ──→ Task 7 ──────────────────┤
Task 8 ──→ Task 9 ──────────────────┤
Task 10 ──→ Task 11 ──→ Task 12 ───┤
Task 13 ──→ Task 14                 ├── Task 24 ──→ Task 25 ──→ Task 26
Task 13 ──→ Task 15                 │
Task 16-20 (parallel) ──→ Task 21 ─┤
Task 22 ──→ Task 23 ───────────────┘
```

Parallel groups (build can parallelize):
- **Group A**: Tasks 1→2→3 (Template pipeline)
- **Group B**: Tasks 4→5 (forge-storm)
- **Group C**: Tasks 6→7 (Context boundary)
- **Group D**: Tasks 8→9 (business-analyst)
- **Group E**: Tasks 10→11→12 (Living doc)
- **Group F**: Tasks 13→14+15 (Lint engine)
- **Group G**: Tasks 16-20 (Scenarios, fully parallel)
- **Group H**: Tasks 22→23 (Sample pack)
- **Convergence**: Task 24→25→26 (Testing + CI)
