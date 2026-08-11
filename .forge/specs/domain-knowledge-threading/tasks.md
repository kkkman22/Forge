---
feature: domain-knowledge-threading
layout: tasks
created: 2026-06-29
spec_ref: ".forge/specs/domain-knowledge-threading/requirements.md"
slice: "B（领域知识全栈接线）"
estimated_total_minutes: 120
wave_structure: "W1[T1,T2,T3,T4] → W2[T5,T6,T7] → W3[T8,T9]"
---

# Tasks — Domain Knowledge Threading（切片 B）

> 轻量任务格式（spec 含 design.md，完整代码由 build 阶段 TDD 补全）。
> 7 REQ → 9 原子任务。Wave 顺序遵循依赖：三新 loader(T1/T2/T3) + 公共导出(T4) 先于 phase 接线(T6/T7)；零包不变式(T5) 依赖 T1/T3；最后全量验证(T8) + ship(T9)。

## 关键 API 事实（design §Components 已核实）

- `loadPackRegistry(reposRoot, fs): Promise<PackRegistry>`（`src/pack/loader.ts`）—— 已存在，注入 fs。
- `parseEnabledPacks(configContent, registry, customLayerRoot): { enabled, errors }`（`src/pack/config.ts`）—— 已存在纯函数。
- `loadContexts(enabledPacks, fs)` / `loadGlossary(enabledPacks, fs)` —— 已存在，注入 fs，返回 Map-based registry。
- `loadStateMachineDefinition(yamlContent, filePath)` + `validateDefinition(def)` —— 已存在单数 loader + 校验器。
- `EnabledPacks.entries[i].extends.state_machines` —— pack.yaml 解析后已是绝对路径（loader.ts:128-135）。
- `FileSystem` 接口（`src/pack/types.ts`）：`readdir/readFile/writeFile/exists/stat`，全异步。

## Wave 1：核心库 + 公共 API（TDD）

### Task 1: runtime enabled-packs loader（REQ-1）
- **Depends On**: []
- **Files**: Create `src/pack/runtime.ts`; RED `test/pack/runtime.test.ts`
- **Target**: `loadEnabledPacks(rootDir, fs)` 组合 `loadPackRegistry` + `parseEnabledPacks`，读 `.forge/config.md`，返回 `{ enabled, errors, warnings }`。
- **Design Reference**: `design.md#component-1-srcpackruntimets-req-1`
- **RED**（先写测试）：`test/pack/runtime.test.ts` 用内存 `FileSystem` stub 断言 4 场景：
  (a) 合法 config.md + packs/ 目录 → enabled.order 正确；(b) config.md 无 `packs:` 字段 → enabled.order=[] 无 error；(c) config.md 缺失 → warning + empty enabled；(d) 未知 pack 名 → error 含"available packs"。
  - Run: `npx vitest run test/pack/runtime.test.ts`
  - Expected: FAIL（src/pack/runtime.ts 不存在）
- **GREEN**：按 design §Component 1 实现 `loadEnabledPacks`。customLayerRoot=`<rootDir>/.forge/custom`。无 node:fs 直接导入（INV-3）。
- **Verify Command**: `npx vitest run test/pack/runtime.test.ts`
- **Commit Message**: `feat(pack): runtime loadEnabledPacks loader (REQ-1)`

### Task 2: pack-aware state-machine loader R4.5.5（REQ-2）
- **Depends On**: []
- **Files**: Create `src/state-machine/registry.ts`; RED `test/state-machine/registry.test.ts`
- **Target**: `loadStateMachineDefinitions(enabledPacks, fs)` 遍历 enabled packs 的 `extends.state_machines` 目录，读 `*.yaml`，用单数 loader + validator，错误收集不抛。
- **Design Reference**: `design.md#component-2-srcstate-machineregistryts-req-2-r455`
- **RED**：`test/state-machine/registry.test.ts` 用 fs stub 断言：(a) 多 pack 多 yaml → machines 数 + sourceLayer="pack:<name>"；(b) 一个 malformed yaml → 进 errors[]，其余正常返回；(c) pack 无 state_machines extends → 跳过无错；(d) empty enabledPacks.order → 空列表空 errors。
  - Run: `npx vitest run test/state-machine/registry.test.ts`
  - Expected: FAIL（registry.ts 不存在）
- **GREEN**：按 design §Component 2 实现。注意 import `path`（`path.join` 拼 filePath）。
- **Verify Command**: `npx vitest run test/state-machine/registry.test.ts`
- **Commit Message**: `feat(state-machine): pack-aware loadStateMachineDefinitions (R4.5.5)`

### Task 3: domain knowledge bundle composer（REQ-4）
- **Depends On**: [1, 2]
- **Files**: Create `src/pack/domain-bundle.ts`; RED `test/pack/domain-bundle.test.ts`
- **Target**: `composeDomainKnowledgeBundle(enabledPacks, fs)` 调 loadContexts/loadGlossary/loadStateMachineDefinitions，展平为 arrays。empty order → `{empty:true}` 零读。
- **Design Reference**: `design.md#component-3-srcpackdomain-bundlets-req-4`
- **RED**：`test/pack/domain-bundle.test.ts` 用 counting fs stub 断言：(a) empty order → empty:true 且 **readFile 调用次数=0**（INV-1）；(b) 有 pack → 三类数组非空，enabledPackNames 正确；(c) Promise.all 并发（可选断言）。
  - Run: `npx vitest run test/pack/domain-bundle.test.ts`
  - Expected: FAIL（domain-bundle.ts 不存在）
- **GREEN**：按 design §Component 3 实现。empty 快路径在 `Promise.all` 之前 return。
- **Verify Command**: `npx vitest run test/pack/domain-bundle.test.ts`
- **Commit Message**: `feat(pack): composeDomainKnowledgeBundle composer (REQ-4)`

### Task 4: 公共 API 导出 + typecheck（REQ-3）
- **Depends On**: [1, 2, 3]
- **Files**: Modify `src/index.ts`（追加导出）; Modify `src/state-machine/index.ts`（重导出 registry）
- **Target**: barrel 暴露 loadEnabledPacks/loadContexts/loadGlossary/loadStateMachineDefinitions/composeDomainKnowledgeBundle + 对应类型。
- **Design Reference**: `design.md#component-4-public-api-req-3`
- **RED**：`test/api-exports.test.ts`（新建）断言 `import { loadEnabledPacks, composeDomainKnowledgeBundle, loadStateMachineDefinitions, loadContexts, loadGlossary } from "../src/index.js"` 全为 function 且非 undefined。
  - Run: `npx vitest run test/api-exports.test.ts`
  - Expected: FAIL（未导出）
- **GREEN**：按 design §Component 4 加导出。新模块 TSDoc 完整（typedoc treatWarningsAsErrors，INV-2）。
- **Verify Command**: `npx tsc -p tsconfig.build.json --noEmit && npx vitest run test/api-exports.test.ts`
- **Commit Message**: `feat(api): export pack/domain-bundle/state-machine wiring (REQ-3)`

## Wave 2：零包验证 + Phase 接线

### Task 5: Zero-Pack runtime 不变式（REQ-7, INV-1）
- **Depends On**: [1, 3]
- **Files**: RED `test/pack/runtime-zero-pack.test.ts`
- **Target**: 证明无 pack 时 loadEnabledPacks + composeDomainKnowledgeBundle 零 pack 文件读取。
- **Design Reference**: `design.md#edge-cases` + requirements.md INV-1
- **RED→GREEN**：用 counting `FileSystem` stub（包装真实 fs，计数 readFile/readdir 调用）。config.md 无 `packs:` → enabled.order=[]，bundle.empty=true，且对 `packs/` 目录的 readdir 调用次数验证为 0 或仅 registry 扫描无后续 bundle 读。同时跑既有 `test/pack/zero-pack-invariant.test.ts` 确认仍绿（REQ-7.1）。
- **Verify Command**: `npx vitest run test/pack/runtime-zero-pack.test.ts test/pack/zero-pack-invariant.test.ts`
- **Commit Message**: `test(pack): zero-pack zero-impact on runtime+bundle (REQ-7)`

### Task 6: plan instruction R4.5.5 + domain injection（REQ-5）
- **Depends On**: [4]
- **Files**: Modify `skills/forge/lib/plan/instructions.md`（加 Domain Knowledge Injection 小节 + R4.5.5 Task Breakdown 规则）; Modify `skills/forge/lib/plan/references/atomic-task-format.md:149-152`（移除"未实现"说明）
- **Target**: plan skill 入口调 loadEnabledPacks + composeDomainKnowledgeBundle 注入摘要；Task Breakdown 对状态驱动模块引用真实 transitions（R4.5.5）。
- **Design Reference**: `design.md#component-5-phase-instruction-integration-req-5` + `design.md#state-machine-task-matching-convention-r455`
- **实施**：按 design §Component 5 的 plan-only 段加小节。atomic-task-format.md:149-152 改为"loadStateMachineDefinitions(enabledPacks) 已交付（src/state-machine/registry.ts）"。
- **Verify Command**: `npm run check`（lint/grep 巡检通过）
- **Commit Message**: `feat(plan): domain knowledge injection + R4.5.5 state-machine (REQ-5)`

### Task 7: decide/build/review injection（REQ-5）
- **Depends On**: [4]
- **Files**: Modify `skills/forge/lib/{decide,build,review}/instructions.md`（各加 Domain Knowledge Injection 小节）
- **Target**: 三 phase 入口调 loadEnabledPacks + composeDomainKnowledgeBundle 注入摘要（共享 body，见 design §Component 5）。
- **Design Reference**: `design.md#component-5-phase-instruction-integration-req-5`
- **实施**：三文件各加相同结构的 Domain Knowledge Injection 小节（无 R4.5.5 额外段，那是 plan 专属）。
- **Verify Command**: `npm run check`
- **Commit Message**: `feat(skills): domain knowledge injection in decide/build/review (REQ-5)`

## Wave 3：验证 + ship

### Task 8: 全量验证 + 进度落盘（INV-2）
- **Depends On**: [5, 6, 7]
- **Files**: `npm run check`（全绿）+ `npx tsc -p tsconfig.build.json`（dist emit 含新模块无错）+ typedoc（新模块 TSDoc 无 warning）+ 写 `.forge/progress/domain-knowledge-threading.md`
- **Target**: 所有 INV 满足；新模块进 dist（非 src/domain 排除）；typedoc 通过。
- **Verify Command**: `npm run check && npx tsc -p tsconfig.build.json`
- **Commit Message**: `docs(domain-threading): progress + DoD (slice B)`

### Task 9: PR + CI 绿
- **Depends On**: [8]
- **Files**: `gh pr create` against main
- **Target**: CI 全绿（check/test-matrix/smoke/security-audit/ultrareview）。
- **Verify Command**: `gh pr checks --watch`
- **Commit Message**: —

## Spec Coverage Matrix

| REQ | Tasks | INV |
|-----|-------|-----|
| REQ-1 runtime loader | T1 | INV-3 |
| REQ-2 state-machine loader (R4.5.5) | T2 | INV-3 |
| REQ-3 public API | T4 | — |
| REQ-4 bundle composer | T3 | INV-1 |
| REQ-5 phase injection | T6, T7 | INV-4 |
| REQ-6 glossary scope-bounded | (design 界定，不改 runGlossaryCheck) | — |
| REQ-7 zero-pack verify | T5 | INV-1 |
| INV-2 dist emit | T8 | — |
