# Progress — code-slim-0612

> 全项目代码精简与重构（等价 refactor）。3 Execution Packages，每 Package 一次 build→review→test→ship。

---

## Package 1 / Wave 1（低风险）

### T1: 删除 deprecated.ts — ✅ completed (commit pending)

**R2 Handoff Block**
- **task_id**: T1
- **completed**:
  - DELETE `src/deprecated.ts`（152 行 v2.4→v2.5 shim，契约已到期 v3.4.0）
  - DELETE `dist/src/deprecated.{js,d.ts,js.map}`（dist 为 gitignored，未跟踪）
  - MODIFY `test/barrel-file.test.ts`：移除 `:13` `import * as deprecated` + section 4（原 :331-366）deprecated re-export 断言块
  - `:185` `toHaveLength(140)` **不变**（deprecated 不在 barrel `src/index.ts`，删除不影响 barrel export 计数）
- **not_completed**: （无）
- **commands_executed**:
  - `grep -rn "from.*deprecated" src/` → 仅 comment（RED 覆盖确认，AC-1.1）
  - `npx tsc --noEmit` → OK
  - `npx vitest run test/barrel-file.test.ts` → 34 passed（基线 40 − section 4 的 6 个 = 34）
  - `node scripts/check-dist-sync.mjs` → OK（296 src matched with dist）
  - `npm run check` → 全绿（tsc+biome+vitest+public-api+dist-sync+skill/doc 校验）
- **issues_found**:
  - `check-dist-sync.mjs` 用 `git ls-files`（读**索引**非工作树）；`rm` 删工作树后索引仍跟踪 → 误报 drift；需 `git add` 暂存删除使索引更新。dist 为 gitignored 未跟踪文件。
- **procedure_compliance**: RED（基线 40 passed）→ GREEN（删 + 34 passed）→ REFACTOR；INV-5（tsc+vitest）✓；INV-6（dist-sync）✓；INV-1~4 未触碰公开契约/安全控制/scripts dist 路径/安全测试。

**Commit**: `refactor: remove deprecated.ts v2.4→v2.5 migration shim (contract expired at v3.4.0)` (e611f51c)

---

### T2: barrel re-export 冗余清理 — ✅ completed (commit pending)

**Scan 结果（plan vs 实际）**：plan 预期 error-recovery/decide/schemas/review 多处。实际扫描（`grep export * + export {` 同文件）仅 **1 处真幂等**：
- `src/error-recovery/index.ts:12` `export { PHASE_SEQUENCES, TEST_FILE_PATTERNS } from "./types.js"` — 已由 `:11 export * from "./types.js"` 覆盖。
- grill/decide/schemas/review 仅有 `export *`，无显式 re-export（核验通过，无改动）。

**R2 Handoff Block**
- **task_id**: T2
- **completed**: DELETE `src/error-recovery/index.ts:12`（幂等 re-export，export * 已覆盖）；公开 barrel `src/index.ts` 140 计数**不变**（PHASE_SEQUENCES/TEST_FILE_PATTERNS 不在公开 barrel，error-recovery 内部符号）。
- **not_completed**: （无）
- **commands_executed**:
  - `grep -rln export * src/ --include=index.ts` + 同文件 `export {` 候选扫描 → 仅 error-recovery
  - `npx tsc --noEmit` → OK
  - `npx vitest run test/barrel-file.test.ts` → 34 passed @ 140（**真幂等确认，计数无变化**）
  - `npm run dist:resync -- --yes` → 重新生成 dist
  - `npm run check` → 全绿（含 check-dist-sync）
- **issues_found**:
  - dist 模型：`dist/src/*` gitignored，`dist/test/*` 被跟踪。T1 未运行 dist:resync，dist/test/barrel-file.test.js 滞后，T2 的 dist:resync 一并追平（chore(dist): resync 提交）。
- **procedure_compliance**: RED（140@34）→ GREEN（删 :12，仍 140@34）→ REFACTOR；INV-5 ✓；INV-6 ✓；INV-1~3 未触碰。

**Commit**: `refactor: remove idempotent barrel re-export in error-recovery/index.ts` + `chore(dist): resync compiled test output`

---

### Review P0 fix: 移除 ./deprecated exports 悬空 — ✅ completed

L4 adversarial 报 P0：`deprecated.ts` 是 `package.json` 声明的公开 subpath（`./deprecated`），T1 删文件后 exports 条目悬空。经 debug 深查（.forge/debug/code-slim-deprecated-exports.md）：包未发布（npm 404）、零消费者、自我标注 v2.5.0 移除已逾期至 v3.4.0。用户 gated_auto 确认"移除 exports 条目"。

- 移除 `package.json` `"./deprecated"` exports 条目
- 删 `src/index.ts:9-11` 悬空文档（解 L1 P3）
- CHANGELOG [Unreleased] ### Removed 登记
- 验证：dist:resync（无变化）+ check-public-api exit 0 + npm run check 全绿
