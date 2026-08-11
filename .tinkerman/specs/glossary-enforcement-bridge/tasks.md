---
feature: glossary-enforcement-bridge
layout: tasks
created: 2026-06-29
spec_ref: ".tinkerman/specs/glossary-enforcement-bridge/requirements.md"
slice: "C（glossary enforcement 桥接）"
estimated_total_minutes: 90
wave_structure: "W1[T1,T2,T3] → W2[T4,T5] → W3[T6,T7]"
---

# Tasks — Glossary Enforcement Bridge（切片 C）

> 轻量任务格式（spec 含 design.md）。5 REQ → 7 原子任务。Slice B REQ-6 deferred 项。
> 依赖：mergeGlossaries(T1) 是核心；loadEnforcementGlossary(T2) 组合它；phase 接线(T5) 引用导出名。

## 关键 API 事实（已核实）

- `runGlossaryCheck(input)`（`src/glossary-hook.ts:191`）接收 `glossary: Glossary`，遍历 `glossary.terms`——**不改它**，只喂更丰富的 Glossary。
- `detectConflict(glossary, candidate)`（`src/glossary.ts:473`）遍历 `glossary.terms` 建倒排索引；同名同定义→无冲突。
- `normalize(s)`（`src/glossary.ts`，detectConflict 内部用）——case/whitespace 不敏感。**需确认是否 export**（T1 实现时验证；若未 export 则内联等价 normalize）。
- `Glossary`（`src/glossary.ts:90`）：`{ schema_version, updated, terms: GlossaryTerm[], archivedTerms? }`。
- `GlossaryTerm`（`glossary.ts:60`）：`{ term, definition, aliases?, avoided_terms?, relations?, ambiguity_notes?, last_updated, source_session? }`。
- `GlossaryEntry`（`pack/types.ts:166`）：`{ term, context, definition, aliases[], updated, source, sourcePath, sourceLayer }`。
- `ensureGlossaryExists(fs: GlossaryFs, options)`（`glossary-driver.ts:159`）——**sync** fs 契约（exists/readFile/writeFile 同步）。
- `loadEnabledPacks(rootDir, fs)`（slice B, `pack/runtime.ts`）——async。
- `loadGlossary(enabledPacks, fs)`（`glossary/registry.ts`）——async，返回 `GlossaryRegistry.entries: Map`。
- fs 契约鸿沟：GlossaryFs(sync) vs FileSystem(async)。T2 用 async 读路径 + 仅缺失时 seed（见 design "fs-contract mismatch"）。

## Wave 1：核心桥接（TDD）

### Task 1: mergeGlossaries 纯函数（REQ-1, INV-1/3/5）
- **Depends On**: []
- **Files**: Create `src/glossary/merge.ts`; RED `test/glossary/merge.test.ts`
- **Target**: `mergeGlossaries(flat, packEntries): Glossary`——flat 主权，pack 补充，同名/alias 跳过，空 pack=identity。
- **Design Reference**: `design.md#component-1-srcglossarymergets-req-1`
- **RED**：`test/glossary/merge.test.ts` 断言：(a) 空 packEntries → 返回 flat 同引用（identity）；(b) pack 补充 flat 没有的术语 → 追加到 terms 末尾；(c) pack term 与 flat term 同名 → 跳过（flat 赢）；(d) pack alias 与 flat alias 撞 → 跳过；(e) 大小写/空格不敏感去重；(f) schema_version/updated 沿用 flat。
  - Run: `npx vitest run test/glossary/merge.test.ts` → FAIL（模块不存在）
- **GREEN**：按 design §Component 1 实现。normalize 复用 `glossary.ts` 的（若 export）或内联等价。纯函数无 I/O。
- **Verify Command**: `npx vitest run test/glossary/merge.test.ts`
- **Commit Message**: `feat(glossary): mergeGlossaries flat+pack bridge (slice C T1)`

### Task 2: loadEnforcementGlossary 加载器（REQ-2, INV-1/3）
- **Depends On**: [1]
- **Files**: Create `src/glossary/enforcement.ts`; RED `test/glossary/enforcement.test.ts`
- **Target**: `loadEnforcementGlossary(rootDir, fs, options?)` 组合 flat + pack + merge，返回 `{ glossary, packTermCount, warnings }`。
- **Design Reference**: `design.md#component-2-srcglossaryenforcementts-req-2` + `design.md#fs-contract-mismatch`
- **RED**：`test/glossary/enforcement.test.ts` 用 counting fs 断言：(a) 无 pack → 返回 flat，packTermCount=0，零 pack 读；(b) 有 pack → 合并，packTermCount=追加数；(c) warnings 聚合。
  - Run: `npx vitest run test/glossary/enforcement.test.ts` → FAIL
- **GREEN**：按 design §Component 2 实现。**fs 契约**：async 读 flat（fs.readFile + parseGlossary）；缺失时 seed（用 INITIAL_GLOSSARY_TERMS + renderGlossary + fs.writeFile）。不用 `as GlossaryFs` 不安全 cast。
- **Verify Command**: `npx vitest run test/glossary/enforcement.test.ts`
- **Commit Message**: `feat(glossary): loadEnforcementGlossary loader (slice C T2)`

### Task 3: 公共 API 导出（REQ-3）
- **Depends On**: [1, 2]
- **Files**: Modify `src/index.ts`（合并进既有 re-export block）
- **Target**: barrel 暴露 mergeGlossaries / loadEnforcementGlossary / EnforcementGlossary 类型。
- **Design Reference**: `design.md#component-3-public-api-req-3`
- **RED**：`test/api-exports-glossary.test.ts`（新建）断言 `import { mergeGlossaries, loadEnforcementGlossary } from "../src/index.js"` 为 function。
- **GREEN**：按 design §Component 3 加导出。barrel-file.test.ts golden 更新（新增 2 value exports → 计数 +2，数组加 2 项按字母序）。
- **Verify Command**: `npx tsc -p tsconfig.build.json --noEmit && npx vitest run test/api-exports-glossary.test.ts test/barrel-file.test.ts`
- **Commit Message**: `feat(api): export glossary enforcement bridge (slice C T3)`

## Wave 2：零包验证 + Phase 接线

### Task 4: Zero-Pack enforcement 不变式（REQ-5, INV-1）
- **Depends On**: [1, 2]
- **Files**: RED `test/glossary/enforcement-zero-pack.test.ts`
- **Target**: 证明无 pack 时 loadEnforcementGlossary + mergeGlossaries 返回纯 flat，零 pack 读，行为不变。
- **RED→GREEN**：counting fs，config.md 无 packs 字段 → glossary===flat（identity），packTermCount=0，零 pack 文件读。同时确认既有 glossary-hook.test.ts / glossary/registry.test.ts 仍绿。
- **Verify Command**: `npx vitest run test/glossary/enforcement-zero-pack.test.ts test/glossary-hook.test.ts`
- **Commit Message**: `test(glossary): zero-pack enforcement invariance (slice C T4/INV-1)`

### Task 5: Phase instructions 接线（REQ-4, INV-4/5）
- **Depends On**: [3]
- **Files**: Modify `skills/forge/lib/{spec,decide,plan,grill,build,review}/references/function-contracts.md` + 相关 `instructions.md` glossary-hook 段
- **Target**: glossary 来源从"扁平 .tinkerman/glossary.md"改为"loadEnforcementGlossary（flat + enabled pack）"；保留 flat 写主权说明。
- **Design Reference**: `design.md#component-4-phase-instruction-wiring-req-4`
- **实施**：6 个 function-contracts.md 的 `glossary` 描述更新；instructions.md 的 runGlossaryCheck 调用段加来源说明。skill-function-sync 双向必须过（registry 已有 runGlossaryCheck 条目，无需新增）。
- **Verify Command**: `npm run check`（含 skill-function-sync + lib manifest 重建）
- **Commit Message**: `feat(skills): glossary enforcement sees pack terms (slice C T5)`

## Wave 3：验证 + ship

### Task 6: 全量验证 + DoD（INV-2）
- **Depends On**: [4, 5]
- **Files**: `npm run check` 全绿 + `tsc -p tsconfig.build.json` + typedoc + dist resync + 写 `.tinkerman/progress/glossary-enforcement-bridge.md`
- **Verify Command**: `npm run check && npx tsc -p tsconfig.build.json`
- **Commit Message**: `docs(glossary-bridge): progress + DoD (slice C)`

### Task 7: PR + CI 绿
- **Depends On**: [6]
- **Files**: `gh pr create` against main
- **Verify Command**: `gh pr checks --watch`
- **Commit Message**: —

## Spec Coverage Matrix

| REQ | Tasks | INV |
|-----|-------|-----|
| REQ-1 mergeGlossaries | T1 | INV-1/3/5 |
| REQ-2 loadEnforcementGlossary | T2 | INV-1/3 |
| REQ-3 public API | T3 | — |
| REQ-4 phase 接线 | T5 | INV-4/5 |
| REQ-5 zero-pack verify | T4 | INV-1 |
| INV-2 dist emit | T6 | — |

## 风险与缓解

- **enforcement 语义变化（false-positive）**：pack 术语进 enforcement 后可能新增冲突报告。**缓解**：flat 主权 + 同名跳过（只补充 flat 未覆盖的）；block policy 不变（plan/review/build 不阻断）。这是 slice B REQ-6 明确推迟的原因，本切片承受该语义变化以闭合割裂。
- **fs 契约鸿沟（sync GlossaryFs vs async FileSystem）**：T2 用 async 读路径 + 仅缺失 seed，避免不安全 cast（design 已详述）。
- **normalize 是否 export**：T1 实现时验证；未 export 则内联等价（case/whitespace trim+lowercase）。
- **typedoc treatWarningsAsErrors**：新模块完整 TSDoc + @example。
- **barrel 预算**：导出合并进既有 block，不新增 export 语句（保持 20/20）。
