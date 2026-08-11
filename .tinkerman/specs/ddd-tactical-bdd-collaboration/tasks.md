---
feature: ddd-tactical-bdd-collaboration
layout: tasks
created: 2026-05-09
spec_ref: ".tinkerman/specs/ddd-tactical-bdd-collaboration/requirements.md"
---

# Implementation Plan

按 TDD 铁律执行。Sprint 3 依赖 Sprint 1 + Sprint 2 已完成（Pack 基础设施 + PMS Pack v1 + 门禁）。

**Sprint 3 的 src/ 新增模块**：`src/template-renderer.ts`、`src/storm.ts`、`src/context-boundary.ts`、`src/lint/pack-rules.ts`、`src/living-doc/generator.ts`、`src/living-doc/renderer.ts`。src/ 既有改动：`src/spec.ts`（business-analyst 并行触发）、`src/pack/types.ts`（core_subdomains 字段）。

**Sprint 3 的 packs/pms/ 扩展**：4 战术模板 + 5 lint 规则 + 25+ 新场景。

**Sprint 3 的新 skill / agent / hook**：`skills/forge-storm/`、`agents/business-analyst.md`、PreToolUse context-boundary hook。

**Sprint 3 的新 pack**：`packs/pms-marriott-sample/`（示例）。

---

## Phase 1: Core 引擎 — Template Renderer（≈ 0.5 天）

- [x] 1. `src/template-renderer.ts`
  - [x] 1.1 RED：`test/template-renderer.test.ts`
    - 简单占位符 `{{name}}` 替换
    - `{{#each items}}...{{/each}}` 循环
    - `{{#if cond}}...{{/if}}` 条件
    - 未定义占位符 → 报告到 unresolvedPlaceholders
    - 空 context 输入保持模板不变
  - [x] 1.2 GREEN：实现 `renderTemplate(templateContent, context)`
  - [x] 1.3 Property test：空 context → 原样返回（identity）
  - [x] 1.4 Performance test：50ms 内渲染单文件
  - 引用：R1.9, R12.1，Design §4.1

- [x] 2. Core 战术模板 6 个
  - [x] 2.1 `templates/ddd/aggregate-root.ts.template` + `aggregate-root.md` 文档
    - 包含 private 构造、静态工厂、invariant 守护、domain event 发布、状态迁移
  - [x] 2.2 `templates/ddd/value-object.ts.template` + `value-object.md`
  - [x] 2.3 `templates/ddd/domain-event.ts.template` + `domain-event.md`
  - [x] 2.4 `templates/ddd/repository-interface.ts.template` + `repository-interface.md`
  - [x] 2.5 `templates/ddd/domain-service.ts.template` + `domain-service.md`
  - [x] 2.6 `templates/ddd/saga.ts.template` + `saga.md`
  - [x] 2.7 验证每个模板用默认值替换后能通过 tsc --noEmit
  - 引用：R1.1-1.10

---

## Phase 2: PMS Pack 战术模板（≈ 0.5 天）

- [x] 3. `packs/pms/templates/ddd/` 4 个 PMS 模板
  - [x] 3.1 `reservation-aggregate.ts.template`
    - 导入 reservation state machine 定义
    - 状态迁移方法映射 state machine guards
  - [x] 3.2 `folio-aggregate.ts.template`
    - 包含 "debits == credits" invariant
    - 每次 mutation 后校验
  - [x] 3.3 `room-value-object.ts.template`
    - 参数化 Bounded Context（RoomType vs RoomUnit）
  - [x] 3.4 `guest-profile-value-object.ts.template`
  - [x] 3.5 验证：用 Sprint 1 Override_Resolver 正确解析 PMS 模板优先于 Core 默认
  - [x] 3.6 `/forge pack inspect pms` 正确报告 templates 数量
  - 引用：R2.1-2.6

---

## Phase 3: forge-storm skill（≈ 1 天）

- [x] 4. `src/storm.ts` — Event Storm 状态管理
  - [x] 4.1 RED：`test/storm.test.ts`
    - loadStormState 不存在 → null
    - loadStormState 合法 md → StormState
    - saveStormState 产出可被 loadStormState 读回
    - nextPhase 按顺序推进
    - serializeStormMarkdown 按模板格式输出
  - [x] 4.2 GREEN：实现 StormState 序列化/反序列化 + phase 推进
  - [x] 4.3 Property test：任意 state → serialize → parse → 无损
  - 引用：R3.4, R3.8，Design §4.2

- [x] 5. `skills/forge-storm/SKILL.md` — 新 skill
  - [x] 5.1 撰写 skill 主体 ≤150 行
    - 章节：Overview / When to Use / Five-Phase Flow / Interactive Patterns / Output Format / Resuming / Execution Flow / Examples / Common Rationalizations
  - [x] 5.2 `references/example-storm.md` — PMS Reservations 完整示例
  - [x] 5.3 更新 `commands/forge.md` 将 `storm` 路由到本 skill
  - [x] 5.4 description 含关键词 "event storming"、"domain modeling"、"事件风暴"
  - 引用：R3.1-3.8，Design §4.7

---

## Phase 4: Context Boundary Hook（≈ 1 天）

- [x] 6. `src/context-boundary.ts` — 边界判定引擎
  - [x] 6.1 RED：`test/context-boundary.test.ts`
    - loadOwnershipMap 从 Context 目录 + ownership.yaml 构建
    - resolveFileContext 按 glob 匹配 / JSDoc tag / 未归属
    - parseImports 识别 imports + escape hatch 注释
    - checkBoundary 6 种关系类型 × allow/deny 矩阵
  - [x] 6.2 GREEN：实现 4 个函数
  - [x] 6.3 Property test：未声明关系总是 violation
  - 引用：R4.2, R12.2，Design §4.3

- [x] 7. Hook 脚本 `scripts/check-context-boundary.mjs`
  - [x] 7.1 RED：`test/context-boundary/hook.test.ts`
    - 合法 import → exit 0
    - 非法 import → exit 1 + 结构化消息
    - 无 context map → exit 0 (Zero-Pack)
    - escape hatch 注释 → bypass + log
  - [x] 7.2 GREEN：实现 `scripts/check-context-boundary.mjs`
    - 读命令行参数（file path）
    - 读文件内容
    - 调 `src/context-boundary.ts` 函数链
    - 格式化阻断消息到 stderr
    - 性能：≤150ms
  - [x] 7.3 更新 `hooks/hooks.json` 新增 PreToolUse 规则（Write + Edit 针对 src/**/*.ts）
  - 引用：R4.1, R4.3-4.7

- [x] 8. PMS Pack 示例 ownership 映射
  - [x] 8.1 在 `packs/pms/contexts/` 各 Context 文档追加"ownership patterns"章节
  - [x] 8.2 文档建议项目在 `.tinkerman/context-ownership.yaml` 声明 glob → context 映射

---

## Phase 5: business-analyst Agent（≈ 0.5 天）

- [x] 9. `agents/business-analyst.md` — 新 agent 定义
  - [x] 9.1 撰写 agent 主体 ≤200 字节前言 + 5 段输出格式指令
  - [x] 9.2 约束：≤600 tokens、不泄露实现、优先用 glossary
  - 引用：R5.1, R5.5，Design §4.8

- [x] 10. core_subdomains 字段扩展
  - [x] 10.1 更新 `src/pack/types.ts` PackEntry.featureFlags 支持 `core_subdomains: string[]`
  - [x] 10.2 更新 `packs/pms/pack.yaml` 追加 `core_subdomains: [reservations, folio-billing, night-audit]`
  - [x] 10.3 RED：`test/pack/core-subdomains.test.ts` 验证字段读取
  - [x] 10.4 GREEN：实现 `getCoreSubdomains(enabledPacks)` union 逻辑
  - 引用：R11.1-11.5

- [x] 11. `src/spec.ts` 扩展 — business-analyst 并行触发
  - [x] 11.1 RED：`test/spec/business-analyst-integration.test.ts`
    - Core 子域 spec → 触发 3 agent 并行
    - 非 Core 子域 → 仅 product + architect
    - 无 pack → 仅 product + architect（Zero-Pack）
  - [x] 11.2 GREEN：Propose 阶段根据 core_subdomains 决定是否加入 business-analyst 到 Promise.allSettled
  - [x] 11.3 更新 `skills/forge-spec/SKILL.md` Propose 章节说明
  - 引用：R5.2-5.6

---

## Phase 6: 活文档生成器（≈ 1 天）

- [x] 12. `src/living-doc/generator.ts` — 数据聚合
  - [x] 12.1 RED：`test/living-doc/generator.test.ts`
    - 空 specs → 空 data
    - 单 spec 含 scenarios → 正确解析
    - 多 spec + acceptance reports → verdict merge
    - 时间戳排序（最新 report 胜出）
  - [x] 12.2 GREEN：实现 `generateLivingDoc(projectRoot, outputDir)`
    - 扫描 .tinkerman/specs/*/spec.md
    - 调用 scenario-linter 的 parser（Sprint 1）提取 scenarios
    - 扫描 .tinkerman/acceptance/*/report.md
    - merge verdict 到 scenarios
  - 引用：R6.1，Design §4.5

- [x] 13. `src/living-doc/renderer.ts` — HTML 渲染
  - [x] 13.1 RED：`test/living-doc/renderer.test.ts`
    - 生成 index.html 含 Context 列表
    - 生成 <context>.html 含 scenarios 列表
    - HTML escape 所有用户内容
    - 输出自包含（无外部 CDN）
  - [x] 13.2 GREEN：实现 `renderLivingDoc(data, outputDir)`
    - 使用 ES template literal 字符串模板
    - 输出 index.html + per-context HTML + assets/
    - WCAG AA 色彩对比
  - [x] 13.3 Performance test：50 spec / 500 scenario 生成 ≤5s
  - 引用：R6.2-6.8，R12.3，Design §4.6

- [x] 14. `/forge spec --living-doc` flag 集成
  - [x] 14.1 更新 `skills/forge-spec/SKILL.md` 追加 --living-doc 子流程
  - [x] 14.2 实现 CLI flag 解析 + 调用 generator
  - [x] 14.3 输出：✅ Living doc generated at .tinkerman/docs/living/index.html (N scenarios)
  - 引用：R6.1

---

## Phase 7: Pack Lint Rules 引擎（≈ 1 天）

- [x] 15. 调整 R7/R8 实现策略到声明式 YAML（与 Design §4.4 一致）
  - [x] 15.1 在本 spec requirements.md 或 design.md 追加修订说明：规则从 TS plugin 调整为 YAML 声明式
  - [x] 15.2 设计 Lint Rule YAML schema

- [x] 16. `src/lint/pack-rules.ts` — 规则加载 + 执行器
  - [x] 16.1 RED：`test/lint/pack-rules.test.ts`
    - 加载 pack lint rules manifest
    - 按 target_globs 匹配文件
    - 应用 regex pattern → 产生 LintFinding
    - 未启用 pack → 0 规则（Zero-Pack）
    - escape hatch 注释 → 跳过
  - [x] 16.2 GREEN：实现 loadPackLintRules / applyLintRulesToFile
  - [x] 16.3 集成到 biome 或 CI lint 流程（通过单独脚本 `scripts/lint-pack-rules.mjs`）
  - 引用：R7.2-7.4, R8.3-8.4，Design §4.4

- [x] 17. PMS Money Lint 规则（YAML）
  - [x] 17.1 `packs/pms/lint-rules/money/no-number-for-money.yaml`
  - [x] 17.2 `packs/pms/lint-rules/money/require-money-factory.yaml`
  - [x] 17.3 `packs/pms/lint-rules/money/explicit-currency-exchange.yaml`
  - [x] 17.4 `packs/pms/lint-rules/manifest.yaml` 声明所有规则
  - [x] 17.5 Unit tests：每规则正反例
  - 引用：R7.1, R7.5-7.6

- [x] 18. PMS Time Lint 规则（YAML）
  - [x] 18.1 `packs/pms/lint-rules/time/no-raw-date-in-domain.yaml`
  - [x] 18.2 `packs/pms/lint-rules/time/prefer-business-day-clock.yaml`
  - [x] 18.3 更新 manifest.yaml
  - [x] 18.4 Unit tests
  - 引用：R8.1-8.4

---

## Phase 8: PMS 场景库扩展（≈ 1.5 天）

- [x] 19. Overbooking 场景（5 个）
  - [x] 19.1 `packs/pms/scenarios/overbooking/overbook-within-policy.feature`
  - [x] 19.2 `scenarios/overbooking/upgrade-to-resolve.feature`
  - [x] 19.3 `scenarios/overbooking/walk-the-guest.feature`
  - [x] 19.4 `scenarios/overbooking/declined-at-check-in.feature`
  - [x] 19.5 `scenarios/overbooking/compensation-policy.feature`

- [x] 20. Corporate 场景（5 个）
  - [x] 20.1 `scenarios/corporate/company-rate.feature`
  - [x] 20.2 `scenarios/corporate/direct-bill-setup.feature`
  - [x] 20.3 `scenarios/corporate/monthly-invoice.feature`
  - [x] 20.4 `scenarios/corporate/credit-limit-exceeded.feature`
  - [x] 20.5 `scenarios/corporate/contract-expiry.feature`

- [x] 21. POS Integration 场景（5 个）
  - [x] 21.1 `scenarios/pos-integration/charge-to-room-from-restaurant.feature`
  - [x] 21.2 `scenarios/pos-integration/split-bill.feature`
  - [x] 21.3 `scenarios/pos-integration/pos-offline-queue.feature`
  - [x] 21.4 `scenarios/pos-integration/chargeback.feature`
  - [x] 21.5 `scenarios/pos-integration/item-void-sync.feature`

- [x] 22. Invoice-Tax 场景（5 个）
  - [x] 22.1 `scenarios/invoice-tax/vat-invoice.feature`
  - [x] 22.2 `scenarios/invoice-tax/us-sales-tax.feature`
  - [x] 22.3 `scenarios/invoice-tax/split-tax-multi-jurisdiction.feature`
  - [x] 22.4 `scenarios/invoice-tax/refund-with-tax-adjustment.feature`
  - [x] 22.5 `scenarios/invoice-tax/void-invoice.feature`

- [x] 23. Loyalty 场景（5 个）
  - [x] 23.1 `scenarios/loyalty/earn-points-on-stay.feature`
  - [x] 23.2 `scenarios/loyalty/redeem-points.feature`
  - [x] 23.3 `scenarios/loyalty/tier-upgrade.feature`
  - [x] 23.4 `scenarios/loyalty/loyalty-rate.feature`
  - [x] 23.5 `scenarios/loyalty/partner-airline-miles.feature`

- [x] 24. 场景质量校验
  - [x] 24.1 所有 25 个新场景通过 Scenario Linter
  - [x] 24.2 所有场景对 PMS banned-patterns Leak Detector 扫描为空
  - [x] 24.3 `packs/pms/README.md` 更新场景索引到 50+
  - 引用：R9.1-9.4

---

## Phase 9: Customization Sample Pack（≈ 0.5 天）

- [x] 25. `packs/pms-marriott-sample/` 骨架
  - [x] 25.1 `pack.yaml`
    - `name: pms-marriott-sample`
    - `depends_on: [pms]`
    - `experimental: true`
  - [x] 25.2 README.md 说明"this is a sample, not production"
  - 引用：R10.1, R10.3, R10.5

- [x] 26. 覆盖层演示
  - [x] 26.1 新 Context：`contexts/bonvoy-loyalty.md`
  - [x] 26.2 新场景：`scenarios/bonvoy/earn-points.feature`
  - [x] 26.3 新场景：`scenarios/bonvoy/platinum-upgrade.feature`
  - [x] 26.4 覆盖 state machine：`state-machines/reservation.yaml` 插入 `AwaitingLoyaltyUpgrade` 状态
  - [x] 26.5 追加 glossary：`glossary/folio-billing.md` 加入 2 条 chain-specific 术语（union 加法）
  - 引用：R10.2

- [x] 27. 三层覆盖集成验证
  - [x] 27.1 手动测试：新建临时项目，`init --pack pms --pack pms-marriott-sample`
  - [x] 27.2 `/forge pack inspect pms-marriott-sample` 显示完整覆盖
  - [x] 27.3 写一个含 Bonvoy 术语的 spec，验证 leak detector 不误报
  - [x] 27.4 写一个 Reservation spec，验证 state machine 使用 sample pack 覆盖版本
  - [x] 27.5 `experimental: true` 在 list 中标注警示
  - 引用：R10.4, R10.6

---

## Phase 10: Zero-Pack 回归与集成测试（≈ 0.5 天）

- [x] 28. 扩展 `test/pack/zero-pack-invariant.test.ts`
  - [x] 28.1 添加用例：无 pack 时 business-analyst 不触发
  - [x] 28.2 添加用例：无 pack 时 context boundary hook no-op
  - [x] 28.3 添加用例：无 pack 时 money/time lint 规则不加载
  - [x] 28.4 添加用例：无 pack 时 living doc 生成空骨架页
  - [x] 28.5 添加用例：无 pack 时 DDD 战术模板不被自动引用
  - 引用：R12.5

- [x] 29. Sprint 3 集成测试
  - [x] 29.1 `test/sprint3/integration.test.ts`：
    - forge-storm 完整 5 阶段 → 输出 event-storm.md
    - 用 event-storm.md 作为 /forge spec 输入 → 生成 draft
    - Core 子域触发 business-analyst → 合并产出
    - 活文档从完整项目生成 → HTML 可用
    - Context boundary hook 阻断违规 import
  - [x] 29.2 CI 集成

---

## Phase 11: 文档与发布（≈ 0.5 天）

- [x] 30. README 与 CHANGELOG 更新
  - [x] 30.1 `README.md` 新增：DDD 战术模板使用、forge-storm 介绍、活文档、Pack Lint
  - [x] 30.2 `CHANGELOG.md` 追加 Sprint 3 变更
  - [x] 30.3 `.tinkerman/knowledge/adr-index.md` 追加 Sprint 3 ADR
  - [x] 30.4 生成 ADR `.tinkerman/decisions/ADR-NNNN-ddd-tactical-bdd.md`

- [x] 31. 发布前 smoke test
  - [x] 31.1 临时项目，init --pack pms，跑一轮完整 spec → plan → build → review → test → ship 流程
  - [x] 31.2 跑 forge-storm 生成一个 event-storm.md
  - [x] 31.3 基于 event-storm 写 spec，触发 business-analyst subagent
  - [x] 31.4 /forge spec --living-doc 生成 HTML，浏览器打开验证
  - [x] 31.5 故意写跨 context 非法 import，hook 阻断
  - [x] 31.6 故意用 `amount: number` 声明，Money Lint 报 warning
  - [x] 31.7 安装 `pms-marriott-sample`，验证三层覆盖工作
  - [x] 31.8 `npm run check` 全绿
  - [x] 31.9 `typedoc` 无错

---

## Task Dependencies

```
Phase 1 (Template Renderer + Core Templates) ─┐
Phase 2 (PMS Tactical Templates) ──────────────┤
Phase 3 (forge-storm) ─────────────────────────┤
Phase 4 (Context Boundary Hook) ───────────────┤
Phase 5 (business-analyst Agent) ──────────────┤── Phase 10 (Zero-Pack + Integration)
Phase 6 (Living Doc) ──────────────────────────┤
Phase 7 (Pack Lint Engine + PMS Rules) ────────┤
Phase 8 (Scenario Library +30) ────────────────┤
Phase 9 (Customization Sample Pack) ───────────┤
                                                │
                            Phase 11 最后 ◀────┘
```

## Exit Criteria

Sprint 3 完成判定：

1. 开发者能用 `/forge storm <context>` 完成一次事件风暴，产出 `event-storm.md`
2. `templates/ddd/` + `packs/pms/templates/ddd/` 至少 10 个模板可渲染编译
3. Context Boundary Hook 能阻断违规 import，合法 import 顺畅通过
4. Core 子域 spec 触发 business-analyst + product + architect 三方并行
5. `/forge spec --living-doc` 生成可浏览的 HTML 站点
6. PMS Money Lint + Time Lint 规则在 PMS 项目中生效，无 pack 项目不生效
7. `packs/pms/scenarios/` 场景数 ≥50，README 索引更新
8. `packs/pms-marriott-sample/` 演示三层覆盖工作
9. Zero-Pack 回归全绿
10. `npm run check` 全绿；`typedoc` 无错
11. **五方法论完整**：SDD ★★★★★ / TDD ★★★★★ / ATDD ★★★★☆ / DDD ★★★★☆ / BDD ★★★★☆
