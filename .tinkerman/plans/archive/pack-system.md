---
topic: "pack-system"
status: "approved"
date: "2026-05-09"
spec_ref: ".kiro/specs/pack-system"
format: "lightweight"
monolith_acknowledged: true
---

# Plan: Pack System

> 来源: `.kiro/specs/pack-system/` (requirements + design + tasks)

## Objective

为 Forge 引入可插拔领域包（Domain Pack）机制：Core（方法论）/ Pack（领域）/ Custom（项目特化）三层架构。新增 5 个纯函数引擎模块 + 1 个新 skill + 3 个现有 skill references 扩展。28 个原子任务，11 个执行阶段。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#1-overview` | 5 个 Core 纯函数模块 + 1 个新 skill + packs/ 目录约定 |
| `design.md#2-high-level-architecture` | 三层架构：Core Engines → Domain Layer → Project Layer |
| `design.md#3-data-model` | PackManifest、PackRegistry、EnabledPacks、ContextEntry、GlossaryEntry、LeakFinding、LintFinding 类型定义 |
| `design.md#4-1-src-pack-loader-ts` | Pack 扫描与解析，纯函数 + 注入 fs |
| `design.md#4-2-src-pack-resolver-ts` | 分层路径解析，resolvePath + resolveAllPaths |
| `design.md#4-3-src-pack-config-ts` | 项目级 Pack 启用，解析 .tinkerman/config.md frontmatter |
| `design.md#4-4-src-pack-commands-ts` | 7 个子命令纯函数实现 |
| `design.md#4-5-src-context-registry-ts` | Bounded Context 加载，合并 Resolution_Order |
| `design.md#4-6-src-context-map-ts` | Context Map 加载与合并 |
| `design.md#4-7-src-glossary-registry-ts` | 分 Context 术语加载，向后兼容单文件回退 |
| `design.md#4-8-src-glossary-mismatch-ts` | 跨 Context 术语误用检测 |
| `design.md#4-9-src-spec-leak-detector-ts` | 实现细节泄露检测，代码块豁免 + Glossary 白名单 |
| `design.md#4-10-src-scenario-linter-ts` | Gherkin scenario 格式校验 4 条默认规则 |
| `design.md#4-11-skill-集成点` | forge-pack 新 skill + forge-spec/forge-plan/forge-build/forge-review 扩展 |
| `design.md#5-execution-flow` | 启动时 lazy load 各引擎，按需加载 |
| `design.md#6-testing-strategy` | Unit + Property + Integration + Fixtures 四层测试 |
| `design.md#7-security-considerations` | 路径穿越防护、YAML safe parse、不执行 pack 代码 |
| `design.md#8-migration-path` | 向后兼容 glossary.md、legacy plan Expected Output、已 locked specs 豁免 |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `src/pack/types.ts` | CREATE | PackManifest、PackEntry、PackRegistry、EnabledPacks 类型定义 |
| `src/pack/loader.ts` | CREATE | Pack 扫描与解析纯函数 |
| `src/pack/resolver.ts` | CREATE | 分层路径解析（Custom > Pack > Core） |
| `src/pack/config.ts` | CREATE | 项目级 Pack 启用配置解析 |
| `src/pack/commands.ts` | CREATE | 7 个 forge-pack 子命令纯函数 |
| `src/context/registry.ts` | CREATE | Bounded Context 加载与合并 |
| `src/context/map.ts` | CREATE | Context Map 加载与合并 |
| `src/glossary/registry.ts` | CREATE | 分 Context 术语表加载 |
| `src/glossary/mismatch.ts` | CREATE | 跨 Context 术语误用检测 |
| `src/spec-leak-detector.ts` | CREATE | Spec 实现细节泄露检测引擎 |
| `src/scenario-linter.ts` | CREATE | Gherkin scenario 格式校验引擎 |
| `skills/forge-pack/SKILL.md` | CREATE | 新 skill：Pack 管理 |
| `src/spec.ts` | MODIFY | 集成 Leak Detector 自检第 7 项 + Scenario Linter |
| `src/plan.ts` | MODIFY | 集成 Expected Output Completeness 自检 |
| `src/build.ts` | MODIFY | 集成 RED Verification Gate 解析 |
| `skills/forge-spec/references/spec-leak-detector.md` | CREATE | Leak Detector 使用说明 |
| `skills/forge-spec/SKILL.md` | MODIFY | Self-check 表追加第 7-8 项 |
| `skills/forge-plan/references/atomic-task-format.md` | MODIFY | Run 步骤追加 Expected 行 |
| `skills/forge-build/references/tdd-rules.md` | MODIFY | 新增 RED Verification Gate 章节 |
| `skills/forge-review/SKILL.md` | MODIFY | Layer 1 追加 leak 再扫步骤 |
| `commands/forge.md` | MODIFY | 追加 pack 子命令路由 |

Test files (paired with source):

| Test File Path | Operation | Description |
|---------|------|------|
| `test/pack/types.test.ts` | CREATE | 类型定义可 import 验证 |
| `test/pack/loader.test.ts` | CREATE | Pack 扫描：空/坏/正常 |
| `test/pack/loader.property.test.ts` | CREATE | fast-check：loader 不崩溃 |
| `test/pack/resolver.test.ts` | CREATE | 路径解析：empty/single/multi/custom |
| `test/pack/resolver.property.test.ts` | CREATE | Custom 优先 + Resolution_Order |
| `test/pack/config.test.ts` | CREATE | 启用配置：缺/空/未知/重复/正常 |
| `test/pack/commands.test.ts` | CREATE | 7 子命令正/错路径 |
| `test/pack/zero-pack-invariant.test.ts` | CREATE | Zero-Pack 回归 |
| `test/context/registry.test.ts` | CREATE | Context 加载：empty/single/multi |
| `test/context/map.test.ts` | CREATE | Context Map：无/冲突边 |
| `test/glossary/registry.test.ts` | CREATE | Glossary：空/单/多/回退 |
| `test/glossary/registry.property.test.ts` | CREATE | 同 term 不同 context 不冲突 |
| `test/glossary/mismatch.test.ts` | CREATE | 跨 Context 误用检测 |
| `test/spec-leak-detector.test.ts` | CREATE | 代码块豁免/白名单/空/union |
| `test/spec-leak-detector.property.test.ts` | CREATE | 空 banned 空 ∀ spec |
| `test/spec-leak/banned-loader.test.ts` | CREATE | banned-patterns 加载与 union |
| `test/spec/leak-integration.test.ts` | CREATE | leak 集成 lock 前 |
| `test/scenario-linter.test.ts` | CREATE | 4 条规则正反例 |
| `test/build/red-gate.test.ts` | CREATE | RED Verification Gate |
| `test/build/expected-comparison.test.ts` | CREATE | Expected Output 比对 |
| `test/plan/expected-output-check.test.ts` | CREATE | Expected Output Completeness |

Fixtures:

| Fixture Path | Operation | Description |
|---------|------|------|
| `test/pack/fixtures/packs/demo-empty/pack.yaml` | CREATE | 空 pack fixture |
| `test/pack/fixtures/packs/demo-full/*` | CREATE | 完整 pack fixture（9 类 extends） |
| `test/pack/fixtures/packs/demo-bad-manifest/pack.yaml` | CREATE | 缺必填字段 fixture |
| `test/pack/fixtures/custom/glossary/folio.md` | CREATE | Custom override fixture |
| `test/pack/fixtures/specs/*` | CREATE | 含/不含 leak 的 spec 样本 |

## Task Breakdown

### Phase 1: 依赖与基础设施

### Task 1: 确认 yaml 依赖
- **Goal**: 确认 yaml npm 包已在 package.json 中
- **File**: `package.json`
- **Design Reference**: `design.md#4-1-src-pack-loader-ts` — loader 使用 yaml 库解析 manifest
- **Depends On**: (none)
- **Verify**: `grep '"yaml"' package.json`
- **Commit**: `chore: verify yaml dependency for pack system`

### Task 2: 建立 Pack 测试 fixtures
- **Goal**: 创建测试用 pack fixture 目录（empty/full/bad-manifest/custom/specs）
- **File**: `test/pack/fixtures/`
- **Design Reference**: `design.md#6-4-fixtures` — 4 类 fixture：demo-empty、demo-full、demo-bad-manifest、custom
- **Depends On**: Task 1
- **Verify**: `ls test/pack/fixtures/packs/demo-empty/pack.yaml test/pack/fixtures/packs/demo-full/pack.yaml test/pack/fixtures/packs/demo-bad-manifest/pack.yaml test/pack/fixtures/custom/glossary/folio.md`
- **Commit**: `test: add pack system fixtures`

### Task 3: Pack 类型定义
- **Goal**: 定义 PackManifest、PackEntry、PackRegistry、EnabledPacks 等核心类型
- **File**: `src/pack/types.ts`
- **Design Reference**: `design.md#3-2-pack-registry` — PackRegistry/PackEntry/EnabledPacks 接口; `design.md#3-1-pack-manifest` — pack.yaml schema
- **Property**: 类型可被 import 且 TSDoc 完整
- **Depends On**: Task 1
- **Verify**: `npx tsc --noEmit`
- **Commit**: `feat(pack): add core type definitions`

---

### Phase 2: Pack 发现与加载

### Task 4: Pack Loader — 扫描与解析
- **Goal**: 实现 loadPackRegistry 纯函数，扫描 packs/*/pack.yaml 构建内存索引
- **File**: `src/pack/loader.ts`, `test/pack/loader.test.ts`
- **Design Reference**: `design.md#4-1-src-pack-loader-ts` — 纯函数 + 注入 fs，坏 pack 进 warnings 不抛异常
- **Property**: R1.1-1.6（发现、schema 验证、重名 dedupe、可序列化）
- **Depends On**: Task 3
- **Verify**: `npx vitest run test/pack/loader.test.ts`
- **Commit**: `feat(pack): implement pack loader with schema validation`

### Task 5: Pack Loader Property Tests
- **Goal**: fast-check 生成随机 manifest，断言 loader 不崩溃且 registry 序列化后反解析不变
- **File**: `test/pack/loader.property.test.ts`
- **Design Reference**: `design.md#6-2-property-tests-fast-check` — idempotence
- **Depends On**: Task 4
- **Verify**: `npx vitest run test/pack/loader.property.test.ts`
- **Commit**: `test(pack): add loader property tests`

### Task 6: Pack Resolver — 分层路径解析
- **Goal**: 实现 resolvePath 和 resolveAllPaths，按 Custom > Pack 顺序解析
- **File**: `src/pack/resolver.ts`, `test/pack/resolver.test.ts`, `test/pack/resolver.property.test.ts`
- **Design Reference**: `design.md#4-2-src-pack-resolver-ts` — resolvePath 首个命中、resolveAllPaths 全部命中、路径穿越防护
- **Property**: R11.1-11.5, R12.3
- **Depends On**: Task 3
- **Verify**: `npx vitest run test/pack/resolver.test.ts test/pack/resolver.property.test.ts`
- **Commit**: `feat(pack): implement layer-aware path resolver`

### Task 7: Pack Config — 项目级启用
- **Goal**: 实现 parseEnabledPacks，解析 .tinkerman/config.md frontmatter packs 字段
- **File**: `src/pack/config.ts`, `test/pack/config.test.ts`
- **Design Reference**: `design.md#4-3-src-pack-config-ts` — 错误累计不抛异常，dedupe 保持顺序
- **Property**: R2.1-2.6
- **Depends On**: Task 4
- **Verify**: `npx vitest run test/pack/config.test.ts`
- **Commit**: `feat(pack): implement project-level pack enablement parser`

---

### Phase 3: Pack 管理命令

### Task 8: Pack Commands — 7 个子命令
- **Goal**: 实现 commandList/Enable/Disable/Inspect/Override/Validate/New 纯函数
- **File**: `src/pack/commands.ts`, `test/pack/commands.test.ts`
- **Design Reference**: `design.md#4-4-src-pack-commands-ts` — 每个子命令返回输出 + 文件修改列表
- **Property**: R4.1-4.9
- **Depends On**: Task 6, Task 7
- **Verify**: `npx vitest run test/pack/commands.test.ts`
- **Commit**: `feat(pack): implement 7 pack management commands`

### Task 9: forge-pack SKILL.md
- **Goal**: 新增 skills/forge-pack/SKILL.md，含 Overview / 7 子命令 / Execution Flow
- **File**: `skills/forge-pack/SKILL.md`
- **Design Reference**: `design.md#4-11-skill-集成点` — forge-pack 新 skill
- **Depends On**: Task 8
- **Verify**: `grep "forge-pack" skills/forge-pack/SKILL.md`
- **Commit**: `feat(skill): add forge-pack skill`

### Task 10: 路由注册
- **Goal**: 更新 commands/forge.md 追加 pack 子命令路由
- **File**: `commands/forge.md`
- **Design Reference**: `design.md#4-11-skill-集成点` — pack 路由到 forge-pack
- **Depends On**: Task 9
- **Verify**: `grep "pack" commands/forge.md`
- **Commit**: `feat(commands): register pack subcommand`

---

### Phase 4: Bounded Context 引擎

### Task 11: Context Registry — 加载与合并
- **Goal**: 实现 loadContexts，遍历 custom + pack 的 contexts/*.md，合并同名覆盖
- **File**: `src/context/registry.ts`, `test/context/registry.test.ts`
- **Design Reference**: `design.md#4-5-src-context-registry-ts` — Custom > Pack 同名覆盖，按名称字母序
- **Property**: R5.1-5.3, R5.6
- **Depends On**: Task 6
- **Verify**: `npx vitest run test/context/registry.test.ts`
- **Commit**: `feat(context): implement bounded context registry`

### Task 12: Context Map — 加载与合并
- **Goal**: 实现 loadContextMap，合并各 layer _map.yaml，冲突边按优先级解决
- **File**: `src/context/map.ts`, `test/context/map.test.ts`
- **Design Reference**: `design.md#4-6-src-context-map-ts` — 同 source+target 边 Custom > 先声明 pack > 后声明 pack
- **Property**: R5.4-5.5
- **Depends On**: Task 11
- **Verify**: `npx vitest run test/context/map.test.ts`
- **Commit**: `feat(context): implement context map loader`

---

### Phase 5: Glossary 引擎

### Task 13: Glossary Registry — 分 Context 术语加载
- **Goal**: 实现 loadGlossary，按 context 组织术语表，向后兼容单文件回退
- **File**: `src/glossary/registry.ts`, `test/glossary/registry.test.ts`, `test/glossary/registry.property.test.ts`
- **Design Reference**: `design.md#4-7-src-glossary-registry-ts` — 文件名即 context，多 ## Term 段，空输入回退 .tinkerman/glossary.md
- **Property**: R6.1-6.3, R6.5-6.6
- **Depends On**: Task 6
- **Verify**: `npx vitest run test/glossary/registry.test.ts test/glossary/registry.property.test.ts`
- **Commit**: `feat(glossary): implement per-context glossary registry`

### Task 14: Glossary Mismatch — 跨 Context 术语误用检测
- **Goal**: 实现 detectContextTermMismatch，tokenize 文本查跨 context 术语
- **File**: `src/glossary/mismatch.ts`, `test/glossary/mismatch.test.ts`
- **Design Reference**: `design.md#4-8-src-glossary-mismatch-ts` — tokenize + 查 byTerm + 排除 currentContext 和 _shared
- **Property**: R6.4
- **Depends On**: Task 13
- **Verify**: `npx vitest run test/glossary/mismatch.test.ts`
- **Commit**: `feat(glossary): implement cross-context term mismatch detection`

---

### Phase 6: Spec Leak Detector

### Task 15: Spec Leak Detector 引擎
- **Goal**: 实现 detectSpecLeak，按行扫描、代码块豁免、Glossary 白名单、多 pattern 类型
- **File**: `src/spec-leak-detector.ts`, `test/spec-leak-detector.test.ts`, `test/spec-leak-detector.property.test.ts`
- **Design Reference**: `design.md#4-9-src-spec-leak-detector-ts` — in_code_block 状态、字面量 vs regex、glossary 白名单
- **Property**: R7.1-7.6, R7.9, R12.2
- **Depends On**: Task 13
- **Verify**: `npx vitest run test/spec-leak-detector.test.ts test/spec-leak-detector.property.test.ts`
- **Commit**: `feat(leak): implement spec leak detector engine`

### Task 16: Banned Patterns 加载与 Union
- **Goal**: 实现 loadBannedPatterns，用 resolveAllPaths 拿到所有 layer 并 union
- **File**: `test/spec-leak/banned-loader.test.ts` (logic in spec-leak-detector.ts or resolver)
- **Design Reference**: `design.md#4-2-src-pack-resolver-ts` — resolveAllPaths 用于 union 场景
- **Property**: R7.3, R11.4
- **Depends On**: Task 6, Task 15
- **Verify**: `npx vitest run test/spec-leak/banned-loader.test.ts`
- **Commit**: `feat(leak): implement banned patterns loader with union`

### Task 17: 集成 Leak Detector 到 forge-spec
- **Goal**: 修改 src/spec.ts 在 self-check 后追加第 7 项 Spec Leak Check
- **File**: `src/spec.ts`, `test/spec/leak-integration.test.ts`, `skills/forge-spec/references/spec-leak-detector.md`, `skills/forge-spec/SKILL.md`
- **Design Reference**: `design.md#4-11-skill-集成点` — forge-spec 扩展
- **Property**: R7.7
- **Depends On**: Task 15, Task 16
- **Verify**: `npx vitest run test/spec/leak-integration.test.ts`
- **Commit**: `feat(spec): integrate leak detector into spec self-check`

### Task 18: 集成 Leak Detector 到 forge-review Layer 1
- **Goal**: 修改 spec-check agent 追加 leak 再扫步骤
- **File**: `.claude/agents/spec-check.md`, `skills/forge-review/SKILL.md`
- **Design Reference**: `design.md#4-11-skill-集成点` — forge-review 扩展
- **Property**: R7.8
- **Depends On**: Task 17
- **Verify**: `grep "leak" .claude/agents/spec-check.md`
- **Commit**: `feat(review): integrate leak detector into spec-check agent`

---

### Phase 7: Scenario Linter

### Task 19: Scenario Linter 引擎 — 4 条默认规则
- **Goal**: 实现 lintScenarios，SCN001-SCN004 四条规则 + additionalRules 扩展
- **File**: `src/scenario-linter.ts`, `test/scenario-linter.test.ts`
- **Design Reference**: `design.md#4-10-src-scenario-linter-ts` — 句号结尾/结构完整/外部可观察/标题规则
- **Property**: R8.1-8.3, R8.6
- **Depends On**: (none)
- **Verify**: `npx vitest run test/scenario-linter.test.ts`
- **Commit**: `feat(linter): implement scenario linter with 4 default rules`

### Task 20: 集成 Scenario Linter 到 forge-spec
- **Goal**: 修改 src/spec.ts lock 前调 lintScenarios，error 阻断 lock
- **File**: `src/spec.ts`, `skills/forge-spec/references/spec-format.md`, `skills/forge-spec/SKILL.md`
- **Design Reference**: `design.md#4-11-skill-集成点` — forge-spec self-check
- **Property**: R8.4
- **Depends On**: Task 19
- **Verify**: `npx vitest run test/scenario-linter.test.ts`
- **Commit**: `feat(spec): integrate scenario linter into spec lock gate`

### Task 21: 集成 Scenario Linter 到 forge-accept
- **Goal**: 修改 forge-accept 加载时调 linter，lint-failed 的 scenario 标记为 skip
- **File**: `skills/forge-accept/`
- **Design Reference**: `design.md#4-11-skill-集成点`
- **Property**: R8.5
- **Depends On**: Task 19
- **Verify**: `grep "lintScenarios" skills/forge-accept/SKILL.md`
- **Commit**: `feat(accept): integrate scenario linter into accept flow`

---

### Phase 8: RED Verification Gate

### Task 22: 扩展 tdd-rules.md — RED Verification Gate
- **Goal**: 在 tdd-rules.md 新增 RED Verification Gate 章节，三段证据字段 + 2 个示例
- **File**: `skills/forge-build/references/tdd-rules.md`
- **Design Reference**: `design.md#4-11-skill-集成点` — tdd-rules.md 扩展
- **Property**: R9.1-9.3, R9.5-9.6
- **Depends On**: (none)
- **Verify**: `grep "RED Verification Gate" skills/forge-build/references/tdd-rules.md`
- **Commit**: `docs(tdd): add RED Verification Gate specification`

### Task 23: src/build.ts 集成 RED Gate
- **Goal**: 在 build subagent 输出解析处追加 RED Verification Gate 检查
- **File**: `src/build.ts`, `test/build/red-gate.test.ts`
- **Design Reference**: `design.md#4-11-skill-集成点` — build 最小集成
- **Property**: R9.4
- **Depends On**: Task 22
- **Verify**: `npx vitest run test/build/red-gate.test.ts`
- **Commit**: `feat(build): integrate RED verification gate`

---

### Phase 9: Plan Expected Output

### Task 24: 扩展 atomic-task-format.md — Expected 行
- **Goal**: Run 步骤格式追加 Expected: 行，3 种合法形式
- **File**: `skills/forge-plan/references/atomic-task-format.md`
- **Design Reference**: `design.md#4-11-skill-集成点` — atomic-task-format 扩展
- **Property**: R10.1, R10.4
- **Depends On**: (none)
- **Verify**: `grep "Expected:" skills/forge-plan/references/atomic-task-format.md`
- **Commit**: `docs(plan): add Expected Output field to atomic task format`

### Task 25: src/plan.ts self-check 扩展
- **Goal**: 添加 Expected Output Completeness 检查，扫描 Run 步骤缺 Expected
- **File**: `src/plan.ts`, `test/plan/expected-output-check.test.ts`
- **Design Reference**: `design.md#4-11-skill-集成点` — plan self-check 扩展
- **Property**: R10.2-10.3, R10.6
- **Depends On**: Task 24
- **Verify**: `npx vitest run test/plan/expected-output-check.test.ts`
- **Commit**: `feat(plan): add Expected Output completeness self-check`

### Task 26: src/build.ts 比对 Expected
- **Goal**: subagent 执行完成后比对 actual 与 Expected，不匹配记 P1 finding
- **File**: `src/build.ts`, `test/build/expected-comparison.test.ts`
- **Design Reference**: `design.md#4-11-skill-集成点` — build Expected 比对
- **Property**: R10.5
- **Depends On**: Task 23, Task 25
- **Verify**: `npx vitest run test/build/expected-comparison.test.ts`
- **Commit**: `feat(build): add Expected Output comparison`

---

### Phase 10: Zero-Pack 回归测试

### Task 27: Zero-Pack Invariant 回归测试
- **Goal**: 完整回归测试：packs 为空时 forge-spec lock、forge-plan approve、forge-build TDD、forge-review 全流程行为不变
- **File**: `test/pack/zero-pack-invariant.test.ts`
- **Design Reference**: `design.md#6-3-integration-tests` — 全流程 Zero-Pack 回归
- **Property**: R3.1-3.6
- **Depends On**: Task 17, Task 20, Task 23, Task 25
- **Verify**: `npx vitest run test/pack/zero-pack-invariant.test.ts`
- **Commit**: `test(pack): add zero-pack invariant regression tests`

### Task 28: CI 集成与全量验证
- **Goal**: npm run check 全绿 + typedoc 无错 + 基准性能测试
- **File**: `.github/workflows/ci.yml` (可选)
- **Design Reference**: `design.md#6-testing-strategy` — CI + 性能基准
- **Property**: R3.2, R12.1-12.2, R12.6
- **Depends On**: Task 27
- **Verify**: `npm run check`
- **Commit**: `ci: add pack system test coverage`

---

## Task Dependencies

```
Phase 1 (Task 1-3) → Phase 2 (Task 4-7) → Phase 3 (Task 8-10)
                                     ↘
                                       Phase 4 (Task 11-12) → Phase 5 (Task 13-14) → Phase 6 (Task 15-18) → Phase 10 (Task 27-28)
                                                                                      ↘
                                                                                        Phase 7 (Task 19-21) ──→ Phase 10
                                     Phase 8 (Task 22-23) ──────────────────────────────→ Phase 10
                                     Phase 9 (Task 24-26) ──────────────────────────────→ Phase 10
```

## Spec Coverage

| Requirement | Covering Tasks |
|-------------|----------------|
| R1 Pack 发现与清单 | Task 4, Task 5 |
| R2 项目级 Pack 启用 | Task 7 |
| R3 Zero-Pack-Zero-Impact | Task 27, Task 28 |
| R4 Pack 管理命令 | Task 8, Task 9, Task 10 |
| R5 Bounded Context 引擎 | Task 11, Task 12 |
| R6 分 Context 统一语言 | Task 13, Task 14 |
| R7 Spec Leak Detector | Task 15, Task 16, Task 17, Task 18 |
| R8 Scenario Linter | Task 19, Task 20, Task 21 |
| R9 RED Verification Gate | Task 22, Task 23 |
| R10 Plan Expected Output | Task 24, Task 25, Task 26 |
| R11 Custom Override | Task 6 (resolver 基础), Task 8 (override 命令) |
| R12 非功能需求 | Task 5, Task 6 (property tests), Task 28 (CI/性能) |
