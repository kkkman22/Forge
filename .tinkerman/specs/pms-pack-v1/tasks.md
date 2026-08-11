---
feature: pms-pack-v1
layout: tasks
created: 2026-05-09
spec_ref: ".tinkerman/specs/pms-pack-v1/requirements.md"
---

# Implementation Plan

按 TDD 铁律（RED → GREEN → REFACTOR）执行。Sprint 2 依赖 Sprint 1 (pack-system) 已完成：Pack 发现、Custom Override Resolver、Spec Leak Detector、Scenario Linter、RED Verification Gate、Plan Expected Output 已在位。

**Sprint 2 的 src/ 新增模块**：`src/state-machine/`（3 文件）、`src/accept-gate.ts`、`src/mutate.ts`、`src/build-micro-review.ts`。src/ 既有改动：`src/build.ts`（集成 Micro_Review 调用）、`src/ship.ts`（集成 accept-gate 与 mutation verdict）。

**Sprint 2 的 packs/pms/ 新增内容**：pack.yaml + 8 contexts + 9 glossary 文件 + banned-patterns.yaml + 4 state machines + 20 scenarios + BusinessDayClock。

---

## Phase 1: Core 引擎 — State Machine（≈ 1 天）

- [x] 1. `src/state-machine/types.ts` — 类型定义
  - [x] 1.1 定义 `StateMachineDefinition`、`ValidationReport`、`TransitionSpec`、`InvariantSpec`
  - 引用：Design §3.2

- [x] 2. `src/state-machine/loader.ts` — YAML 加载
  - [x] 2.1 RED：`test/state-machine/loader.test.ts` 覆盖合法 YAML / 缺必填 / 类型错误 / 循环引用
  - [x] 2.2 GREEN：实现 `loadStateMachineDefinition(yamlContent, filePath)`
    - 使用 yaml 库（Sprint 1 已引入）
    - 返回强类型对象，字段缺失抛具名错误
  - [x] 2.3 REFACTOR：抽取字段验证辅助函数
  - 引用：R4.1-4.2，Design §4.1

- [x] 3. `src/state-machine/validator.ts` — 校验规则
  - [x] 3.1 RED：`test/state-machine/validator.test.ts` 覆盖 ST001-ST005 每条规则的正反例
  - [x] 3.2 GREEN：实现 `validateDefinition(def)` 返回 `ValidationReport`
  - [x] 3.3 Property test：合法定义 validate 后总是 `valid: true`
  - 引用：R4.3，Design §4.2

- [x] 4. `src/state-machine/property-derivation.ts` — Property test 派生
  - [x] 4.1 RED：`test/state-machine/property-derivation.test.ts` 覆盖 4 类 invariant 模板 + 未识别 invariant 占位注释
  - [x] 4.2 GREEN：实现 `deriveStatePropertyTests(def)` 返回 TS 代码字符串
    - 对 4 类已知 invariant expression 应用模板
    - 未识别的生成 `// TODO:` 占位
  - [x] 4.3 Integration test：派生代码能通过 `tsc --noEmit` 编译
  - 引用：R4.4，Design §4.3

---

## Phase 2: Core 引擎 — Forced Acceptance Gate（≈ 0.5 天）

- [x] 5. `src/accept-gate.ts` — Forced Acceptance 判定
  - [x] 5.1 RED：`test/accept-gate.test.ts` 覆盖 6 种组合：
    - context 不在强制列表 → no-block
    - context 在强制列表 + 无 Scenarios → no-block + warning
    - context 在强制列表 + 有 Scenarios + 无 artifact → block
    - context 在强制列表 + 有 Scenarios + fail > 0 → block
    - context 在强制列表 + 有 Scenarios + fail == 0 → no-block
    - enabledPacks 空 → no-block (Zero-Pack-Zero-Impact)
  - [x] 5.2 GREEN：实现 `shouldBlockShip(input)`
    - 解析 spec frontmatter.context
    - union enabledPacks 的 forced_acceptance_contexts
    - 读 artifact frontmatter.verdicts_summary
  - [x] 5.3 Property test：monotonicity（fail 数增加不会变 unblock）
  - 引用：R6.1-6.7，Design §4.4

- [x] 6. 集成到 `src/ship.ts`
  - [x] 6.1 RED：`test/ship/forced-acceptance.test.ts` 端到端 ship 流程含 gate
  - [x] 6.2 GREEN：在现有 ship 门禁序列（Review/Test/Progress）后追加 accept-gate 检查
    - block → 阻断，按 `🚫 Ship 阻断 — <reason> 建议：<route>` 格式输出
    - warning → 非阻断，在输出中标注 notice
  - [x] 6.3 更新 `skills/forge-ship/SKILL.md` 门禁章节说明新步骤
  - 引用：R6.3

---

## Phase 3: Core 引擎 — Mutation Testing（≈ 1 天）

- [x] 7. 添加 `@stryker-mutator/core` 和 `@stryker-mutator/vitest-runner` 依赖
  - [x] 7.1 `npm install @stryker-mutator/core @stryker-mutator/vitest-runner --save-dev --save-exact`
  - [x] 7.2 更新 `check-deps.mjs` 白名单（如有）
  - [x] 7.3 `.gitignore` 追加 `reports/mutation/`
  - 引用：R7.2

- [x] 8. `src/mutate.ts` — Stryker 包装
  - [x] 8.1 RED：`test/mutate.test.ts` 覆盖
    - 空 enabledPacks → warn 退出 0
    - 有 targetGlobs → 生成 stryker.conf.json
    - mock Stryker 输出 → 正确解析 + 计算 score
    - 阈值比较 → verdict 正确
  - [x] 8.2 GREEN：实现 `runMutation(projectRoot, options)`
    - union enabledPacks 的 mutation_critical_modules
    - 生成临时 stryker.conf.json
    - spawn Stryker 并捕获 JSON 输出
    - 计算 score，判定 verdict
    - 原子写 `.tinkerman/mutation/<timestamp>.md`
  - [x] 8.3 集成到 ship：读最新 mutation artifact，verdict=fail 阻断，warn 通知
  - 引用：R7.2-7.8，Design §4.5

- [x] 9. `skills/forge-mutate/SKILL.md` — 新 skill
  - [x] 9.1 撰写 skill 主体 ≤150 行
    - 章节：Overview / Prerequisites / Subcommands / 8 Core Mutation Categories / Integration with ship / Examples
  - [x] 9.2 添加 `references/frameworks.md` — Stryker 配置细节和备选框架
  - [x] 9.3 更新 `commands/forge.md` 将 `mutate` 路由到本 skill
  - 引用：R7.1, R7.8，Design §4.8

---

## Phase 4: Core 扩展 — 单任务 Micro-Review（≈ 0.5 天）

- [x] 10. `src/build-micro-review.ts` — Micro_Review 引擎
  - [x] 10.1 RED：`test/build/micro-review.test.ts` 覆盖
    - v1 plan 全 covered → pass
    - v1 plan 有 missing → needs_iteration
    - v1 plan 有 overBuilt → needs_iteration
    - legacy plan → loose mode pass（有 diff 有 PASS 即可）
  - [x] 10.2 GREEN：实现 `runMicroReview(input)`
    - 检测 plan version（是否含 Expected Output）
    - v1：对每条 acceptance_criteria 在 diff 中找 file:line 证据
    - 扫描 diff 中新增文件/方法超出 `task.files` 声明
    - 格式化输出 covered / overBuilt / missing
  - [x] 10.3 Property test：idempotence（same input same output）
  - 引用：R9.1-9.7，Design §4.6

- [x] 11. 集成到 `src/build.ts`
  - [x] 11.1 RED：`test/build/micro-review-integration.test.ts`
  - [x] 11.2 GREEN：在每个 atomic task Verify GREEN 之后调用 `runMicroReview`
    - needs_iteration → 最多 3 轮修复（每轮回到 RED/GREEN）
    - 3 轮仍 needs_iteration → 触发 Three-Strike 重路由到 `/forge debug`
    - pass → 写 Micro_Review 结构化块到 progress 文件
  - [x] 11.3 更新 `skills/forge-build/SKILL.md` 执行流程说明新步骤
  - 引用：R9.1, R9.7

---

## Phase 5: TDD 狠度 — XML 标签 + Rationalization（≈ 0.5 天）

- [x] 12. `CLAUDE.md` 铁律 XML 化
  - [x] 12.1 将 §2.1 TDD 铁律包裹为 `<IRON-LAW name="tdd-delete-and-restart">`
  - [x] 12.2 将 §2.3 Verification 铁律包裹为 `<IRON-LAW name="verification-run-command">`
  - [x] 12.3 将 §2.4 Three-Strike 包裹为 `<IRON-LAW name="three-strike-reroute">`
  - [x] 12.4 将 §2.7 No Confirmation 包裹为 `<IRON-LAW name="no-mid-step-confirmation">`
  - [x] 12.5 文字内容不变，仅包裹标签
  - 引用：R10.1, R10.5

- [x] 13. Skill 级 Hard Gate XML 化
  - [x] 13.1 `skills/forge-spec/SKILL.md` 的 spec-lock 门禁包裹 `<HARD-GATE name="spec-lock">`
  - [x] 13.2 `skills/forge-plan/SKILL.md` 的 plan-approve 门禁包裹 `<HARD-GATE name="plan-approve">`
  - [x] 13.3 `skills/forge-review/SKILL.md` 的 P0/P1 block 包裹 `<HARD-GATE name="p0-p1-block-ship">`
  - [x] 13.4 `skills/forge-ship/SKILL.md` 的 ship 门禁序列包裹（每个门禁一个 tag）
  - [x] 13.5 `.tinkerman/config.md` 的 frozen zone 声明包裹 `<HARD-GATE name="frozen-zone-protection">`
  - 引用：R10.2

- [x] 14. `scripts/check-iron-laws.sh` — 唯一性校验
  - [x] 14.1 实现脚本（用 rg 提取 name 属性 + sort | uniq -d）
  - [x] 14.2 同时校验 HARD-GATE
  - [x] 14.3 在 `npm run check` 中集成（或加入 pre-commit）
  - [x] 14.4 CI 中运行
  - 引用：R10.3，Design §4.9

- [x] 15. Rationalization Catalog 扩展
  - [x] 15.1 修改 `skills/forge-build/references/tdd-rules.md` Rationalization 表
  - [x] 15.2 追加至少 15 条（覆盖 Superpowers 12 条 + Forge 原有 3+ 条）
  - [x] 15.3 分组为 5 个子类别（Test-after / Reference-keeping / Sunk-cost / Pragmatism / Scope）
  - [x] 15.4 每条中文反驳
  - 引用：R11.1-11.5

---

## Phase 6: PMS Pack 骨架与元数据（≈ 1 天）

- [x] 16. `packs/pms/pack.yaml` 与 README
  - [x] 16.1 创建 `packs/pms/pack.yaml` 含完整 feature_flags
  - [x] 16.2 创建 `packs/pms/README.md` 含：8 Context 目录、4 状态机说明、20 场景索引、BusinessDayClock 使用、customization 说明
  - [x] 16.3 `/forge pack validate pms` 通过
  - 引用：R1.1, R1.4, R1.5, R1.6

- [x] 17. 8 个 Bounded Context 文档
  - [x] 17.1 `packs/pms/contexts/reservations.md`（Core）
  - [x] 17.2 `packs/pms/contexts/folio-billing.md`（Core）
  - [x] 17.3 `packs/pms/contexts/night-audit.md`（Core）
  - [x] 17.4 `packs/pms/contexts/front-desk.md`（Supporting）
  - [x] 17.5 `packs/pms/contexts/housekeeping.md`（Supporting）
  - [x] 17.6 `packs/pms/contexts/rate-inventory.md`（Supporting）
  - [x] 17.7 `packs/pms/contexts/channel-integration.md`（Supporting）
  - [x] 17.8 `packs/pms/contexts/reporting.md`（Generic）
  - [x] 17.9 每个文件含完整 frontmatter（name / responsibility / aggregates / inbound_events / outbound_events / upstream / downstream）和 body 150-300 字
  - 引用：R1.2

- [x] 18. Context Map `_map.yaml`
  - [x] 18.1 声明至少 6 条边
  - [x] 18.2 覆盖 partnership / customer-supplier / acl / open-host 四种关系
  - [x] 18.3 验证：所有引用的 context 存在
  - 引用：R1.3

---

## Phase 7: PMS Glossary 与禁用词（≈ 1 天）

- [x] 19. 分 Context Glossary
  - [x] 19.1 `packs/pms/glossary/_shared.md` 含跨 Context 通用术语（Hotel / Property / ADR / RevPAR 等）
  - [x] 19.2 `packs/pms/glossary/reservations.md` — Reservation / Booking / Confirmation / Guest Profile / Rate Plan / ...
  - [x] 19.3 `packs/pms/glossary/front-desk.md` — Check-In / Check-Out / Walk-In / Key Card / Registration Card / ...
  - [x] 19.4 `packs/pms/glossary/housekeeping.md` — Dirty / Clean / Inspected / OOO / OOS / Minibar / Turn-down / ...
  - [x] 19.5 `packs/pms/glossary/folio-billing.md` — Folio / Charge / Payment / Posting / Allowance / Deposit / ...
  - [x] 19.6 `packs/pms/glossary/night-audit.md` — Night Audit / Day Close / Rollover / No-Show Processing / ...
  - [x] 19.7 `packs/pms/glossary/rate-inventory.md` — Room Type / Rate / Inventory / MLOS / Stop Sell / Yield / ...
  - [x] 19.8 `packs/pms/glossary/channel-integration.md` — Channel / OTA / ARI / Availability / Push / Pull / ...
  - [x] 19.9 `packs/pms/glossary/reporting.md` — Occupancy / ADR / RevPAR / GOP / Flash Report / ...
  - [x] 19.10 "Room" 在 3+ context 分别定义（reservations / front-desk / housekeeping）
  - [x] 19.11 "Guest" 在 3+ context 分别定义
  - [x] 19.12 每条含 aliases 中文同义词
  - 引用：R2.1-2.6

- [x] 20. `packs/pms/banned-patterns.yaml`
  - [x] 20.1 `code` 类别：`\b\w+(Service|Repository|Manager|Engine|Handler)\b` + 具体 PMS 实现类名
  - [x] 20.2 `infrastructure` 类别：数据表 / API path / queue 名称
  - [x] 20.3 `framework` 类别：Controller / Middleware / NestJS / TypeORM / Prisma / Redux
  - [x] 20.4 `technical` 类别：Redis / Kafka / PostgreSQL / MongoDB / WebSocket / GraphQL
  - [x] 20.5 验证：union 后与 Sprint 1 Spec Leak Detector 集成测试通过
  - [x] 20.6 真实 PMS spec 样本测试：每个类别至少 1 个真实 leakage 示例能被捕获
  - 引用：R3.1-3.7

---

## Phase 8: PMS 4 核心状态机（≈ 0.5 天）

- [x] 21. `packs/pms/state-machines/reservation.yaml`
  - [x] 21.1 定义 6 个 states（Booked / Confirmed / CheckedIn / CheckedOut / NoShow / Cancelled）
  - [x] 21.2 至少 10 个 transitions 覆盖 confirmation / check-in / no-show / cancellation 等
  - [x] 21.3 至少 3 个 invariants
  - [x] 21.4 `/forge pack validate pms` 通过
  - [x] 21.5 `deriveStatePropertyTests` 输出代码能编译
  - 引用：R5.1, R5.2, R5.6, R5.7

- [x] 22. `packs/pms/state-machines/folio.yaml`
  - [x] 22.1 定义 4 个 states（Open / Posted / Closed / Voided）
  - [x] 22.2 invariant "Closed folio cannot be reopened except via Void → Open"
  - [x] 22.3 至少 6 个 transitions
  - 引用：R5.3

- [x] 23. `packs/pms/state-machines/room-status.yaml`
  - [x] 23.1 定义 7 个 states（Available / Occupied / Dirty / Clean / Inspected / OutOfService / OutOfOrder）
  - [x] 23.2 transitions 覆盖 check-in/out / housekeeping / inspection / maintenance
  - 引用：R5.4

- [x] 24. `packs/pms/state-machines/housekeeping-task.yaml`
  - [x] 24.1 定义 4 个 states（Pending / InProgress / Completed / Skipped）
  - [x] 24.2 Skipped 可从任何非终态达到
  - 引用：R5.5

---

## Phase 9: BusinessDayClock 工具（≈ 0.5 天）

- [x] 25. `packs/pms/utils/business-day-clock.ts`
  - [x] 25.1 RED：`packs/pms/utils/business-day-clock.test.ts`
    - 基本功能：getBusinessDay / nextCutoff / isSameBusinessDay / addBusinessDays
    - DST 边界（America/New_York Spring Forward / Fall Back）
    - 时区覆盖：Asia/Shanghai / America/New_York / Europe/London
    - cutoff 边界（跨 cutoff 瞬间）
  - [x] 25.2 GREEN：实现 `BusinessDayClock` 类
    - 使用 `Intl.DateTimeFormat` 处理时区
    - 不引入 moment / date-fns
    - 不内部使用 `new Date()`
  - [x] 25.3 实现 `withBusinessDay` fixture
  - [x] 25.4 Property test：同日检测反身对称 / addBusinessDays 零 delta 不变 / round-trip
  - [x] 25.5 Performance test：每方法 ≤1ms
  - 引用：R12.1-12.6，Design §4.7

---

## Phase 10: PMS 预置场景（≈ 1 天）

- [x] 26. Check-in 场景（5 个）
  - [x] 26.1 `packs/pms/scenarios/check-in/walk-in.feature`
  - [x] 26.2 `packs/pms/scenarios/check-in/early-arrival.feature`
  - [x] 26.3 `packs/pms/scenarios/check-in/late-arrival.feature`
  - [x] 26.4 `packs/pms/scenarios/check-in/group-check-in.feature`
  - [x] 26.5 `packs/pms/scenarios/check-in/payment-failure.feature`
  - 引用：R14.1, R14.4

- [x] 27. Check-out 场景（3 个）
  - [x] 27.1 `packs/pms/scenarios/check-out/express-checkout.feature`
  - [x] 27.2 `packs/pms/scenarios/check-out/late-checkout-with-fee.feature`
  - [x] 27.3 `packs/pms/scenarios/check-out/dispute.feature`

- [x] 28. Night Audit 场景（4 个）
  - [x] 28.1 `packs/pms/scenarios/night-audit/normal-run.feature`
  - [x] 28.2 `packs/pms/scenarios/night-audit/no-show-processing.feature`
  - [x] 28.3 `packs/pms/scenarios/night-audit/room-move-reconciliation.feature`
  - [x] 28.4 `packs/pms/scenarios/night-audit/interrupted-and-resumed.feature`

- [x] 29. Reservation 场景（4 个）
  - [x] 29.1 `packs/pms/scenarios/reservation/individual.feature`
  - [x] 29.2 `packs/pms/scenarios/reservation/group.feature`
  - [x] 29.3 `packs/pms/scenarios/reservation/modification.feature`
  - [x] 29.4 `packs/pms/scenarios/reservation/cancellation-within-policy.feature`

- [x] 30. Folio 场景（4 个）
  - [x] 30.1 `packs/pms/scenarios/folio/charge-posting.feature`
  - [x] 30.2 `packs/pms/scenarios/folio/split-folio.feature`
  - [x] 30.3 `packs/pms/scenarios/folio/tax-adjustment.feature`
  - [x] 30.4 `packs/pms/scenarios/folio/deposit-refund.feature`

- [x] 31. 场景质量校验
  - [x] 31.1 所有 20 个场景通过 Sprint 1 Scenario Linter（SCN001-SCN004）
  - [x] 31.2 所有场景对 PMS banned-patterns 的 Leak Detector 扫描为空
  - [x] 31.3 每个场景文件含业务 context comment block
  - 引用：R14.2, R14.3, R14.5

---

## Phase 11: Init Template 扩展（≈ 0.5 天）

- [x] 32. `scripts/init.sh` 支持 `--pack` 参数
  - [x] 32.1 解析 multi-valued `--pack <name>` 参数
  - [x] 32.2 写入 `.tinkerman/config.md` frontmatter `packs:` 列表
  - [x] 32.3 若 pack 不存在 → warning 但继续
  - [x] 32.4 幂等：重新运行无副作用
  - 引用：R13.1, R13.4, R13.5

- [x] 33. PMS 专属交互
  - [x] 33.1 `--pack pms` 启用时提示 business_day_cutoff_hour（默认 4）
  - [x] 33.2 提示 business_day_timezone（默认 `Asia/Shanghai`）
  - [x] 33.3 写入 `.tinkerman/config.md` frontmatter
  - [x] 33.4 创建 `.tinkerman/custom/` 空目录
  - [x] 33.5 打印欢迎消息含 README 引用和场景数量
  - 引用：R13.2, R13.3

---

## Phase 12: Zero-Pack 回归扩展（≈ 0.5 天）

- [x] 34. 扩展 `test/pack/zero-pack-invariant.test.ts`
  - [x] 34.1 添加用例：Forced Acceptance gate 在空 pack 下返回 no-block
  - [x] 34.2 添加用例：Mutation engine 在空 pack 下 warn 退出 0
  - [x] 34.3 添加用例：Micro_Review 对 legacy plan 走 loose mode
  - [x] 34.4 添加用例：State Machine 引擎在无 pack 定义时 importable 且空输入返回空结果
  - 引用：R15.4

- [x] 35. PMS Pack 集成测试
  - [x] 35.1 `test/pms-pack/integration.test.ts` 覆盖：
    - 启用 pms pack 后 detectSpecLeak 捕获 PMS 典型 leakage
    - detectContextTermMismatch 正确报跨 context "Room" 误用
    - 4 个状态机 property 派生代码通过 tsc
  - [x] 35.2 CI 集成：`.github/workflows/ci.yml` 运行本组测试

---

## Phase 13: 文档与发布（≈ 0.5 天）

- [x] 36. 更新 README 与 CHANGELOG
  - [x] 36.1 `README.md` 新增 "PMS Pack" 章节
  - [x] 36.2 `CHANGELOG.md` 追加 Sprint 2 变更
  - [x] 36.3 `.tinkerman/knowledge/adr-index.md` 追加 ADR 条目
  - [x] 36.4 生成 ADR `.tinkerman/decisions/ADR-NNNN-pms-pack-v1.md`

- [x] 37. 发布前 smoke test
  - [x] 37.1 新建临时项目目录，执行 `forge init --pack=pms`
  - [x] 37.2 写一个含 leakage 的 PMS spec，验证 leak detector 阻断 lock
  - [x] 37.3 写一个 Scenario 缺句号，验证 linter 报 SCN001
  - [x] 37.4 模拟 acceptance fail，验证 ship 被 accept-gate 阻断
  - [x] 37.5 对 PMS 关键模块跑 mutation，验证 artifact 生成
  - [x] 37.6 跑 Build 流程，验证 Micro_Review 在每任务后输出
  - [x] 37.7 清理临时项目
  - [x] 37.8 `npm run check` 全绿
  - [x] 37.9 `typedoc` 无错

---

## Task Dependencies

```
Phase 1 (State Machine) ──────────────────────────┐
Phase 2 (Accept Gate) ────────────────────────────┤
Phase 3 (Mutation) ───────────────────────────────┤
Phase 4 (Micro Review) ───────────────────────────┤── Phase 12 (Zero-Pack 回归)
Phase 5 (XML / Rationalization) ──────────────────┤
Phase 6 (PMS Pack 骨架) ──┐                       │
Phase 7 (Glossary/Banned) ┤                       │
Phase 8 (State Machines) ─┼───── Phase 10 (Scenarios) ──┤
Phase 9 (BusinessDayClock)┘                             │
Phase 11 (Init) ────────────────────────────────────────┤
                                                        │
                                        Phase 13 最后 ◀───┘
```

## Exit Criteria

Sprint 2 完成判定：

1. `packs/pms/` 完整：pack.yaml + 8 contexts + 9 glossary 文件 + banned-patterns + 4 state machines + 20 scenarios + BusinessDayClock
2. `/forge pack enable pms` 在新项目中成功启用 PMS Pack
3. PMS spec 中的实现 leakage 被 Sprint 1 Leak Detector 用 PMS 禁用词清单精确捕获
4. `/forge mutate` 能运行 Stryker 对 PMS 关键模块产生 mutation 报告
5. `/forge ship` 在 accept-gate 和 mutation gate 下能阻断或放行
6. `/forge build` 每任务后输出 Micro_Review 块
7. Iron Law / Hard Gate 唯一性校验绿
8. Zero-Pack 回归扩展全绿
9. `npm run check` 全绿；`typedoc` 无错
10. PMS Pack README 可让新用户在 5 分钟内启用并写出第一个 spec
