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

---

## Package 2 / Wave 2（中风险）

### T3: error-recovery 精简 — ⏭️ 跳过（无安全改动空间）

**扫描结果**：types.ts 25 export 全部经 barrel `src/error-recovery.ts` → `src/index.ts` 成为公共 API。零 src/ production caller，但删 export 违反 INV-1（公开 API 行为不变）。同构函数（parseGitLog、getNextPhase）与外部模块签名/语义不同，不可合并（设计约束 Critic #3）。

**结论**：模块为 "ghost API"——导出但内部未消费。保守策略：保持不变，待未来 major version 清理。

---

### T4: docs-governance 精简 — ✅ completed (commit f31419fa)

**扫描结果**：32 文件中 3 个死模块 + 0 个同构函数。

- `reporter/learn-docs-check.ts`（118 行）：零 production caller（src/ + scripts/ grep 验证）
- `reporter/learn-integration.ts`（87 行）：零 production caller
- `ssot/registry.ts`（98 行）：零 production caller（`ssot-loader.ts` 用的是 `renderer-registry.ts`，非 `registry.ts`）
- `root-whitelist.ts`：**非死**（3 external callers: scripts/check-docs-root-whitelist.ts 等）
- 死类型 export（HeadingEntry/ExtractedLink/DiffHunk/FrontmatterRange）：内部使用但 export 多余，不删仅 un-export 收益太小，跳过

**Commit**: `refactor: remove 3 dead docs-governance modules (learn-docs-check, learn-integration, ssot/registry)` (f31419fa)
**验证**: tsc ✓, vitest 7406 ✓, dist-sync 293 ✓, npm run check ✓

---

### T5: review-comment-bitbucket 精简 — ⏭️ 跳过（无安全改动空间）

**扫描结果**：全模块 44 export 零外部 production 调用者（排除 reconcile/finding-hash/marker）。但：
- skills/ 引用存在（SKILL.md + instructions.md）
- REQ-5 硬约束"不动 reconcile 主流程 / finding-hash / marker 正则"
- 模块虽无代码级 caller，但作为 skill 实现行可能有 skill 指令级消费

**结论**：超出 REQ-5 "仅删死代码"范围，保守跳过。

### Review P0 fix: 移除 ./deprecated exports 悬空 — ✅ completed

L4 adversarial 报 P0：`deprecated.ts` 是 `package.json` 声明的公开 subpath（`./deprecated`），T1 删文件后 exports 条目悬空。经 debug 深查（.tinkerman/debug/code-slim-deprecated-exports.md）：包未发布（npm 404）、零消费者、自我标注 v2.5.0 移除已逾期至 v3.4.0。用户 gated_auto 确认"移除 exports 条目"。

- 移除 `package.json` `"./deprecated"` exports 条目
- 删 `src/index.ts:9-11` 悬空文档（解 L1 P3）
- CHANGELOG [Unreleased] ### Removed 登记
- 验证：dist:resync（无变化）+ check-public-api exit 0 + npm run check 全绿

---

## Package 3 / Wave 3（高风险）

### T6: mcp forge-exec.ts 内部函数合并 — ✅ completed (commit 2348d299)

**Scan 结果（plan vs 实际）**：decide 标注 "forge-exec.ts 内部 12 个小函数合并候选"。逐函数 R10 核验后，**真正同构重复仅 1 处**——`execCommand`（原 288-353）的 simple/complex 双分支：两分支的 execFile options、`(error,stdout,stderr)` callback、`!child` fallback 完全相同，仅 execFile 前两参数不同。其余 11 个"候选"（isCommandAllowed/isCommandDenied/containsShellMetachars/isSimpleCommand/readDenyPatterns/splitSimpleCommand/legacyTypedReplacementWarning/execCommandTracked/reapProcessTree）均单一职责无重复；跨模块 `accept-driver.ts:281 execCommand(_cmd)` 签名不同（Critic #3 剔除）。与 T3/T5 同型：扫描后安全改动空间远小于 decide 估计。

**R2 Handoff Block**
- **task_id**: T6
- **completed**:
  - MODIFY `src/mcp/tools/forge-exec.ts` `execCommand`：双分支 → 单 `spawnTarget`（`isSimpleCommand ? splitSimpleCommand : {bin:"/bin/sh",args:["-c",command]}`）+ 单 `execFile(target.bin, target.args, opts, callback)`，镜像 `execCommandTracked` 既有模式。+30/−57（净 −27）。
  - SYNC `dist/src/mcp/tools/forge-exec.js`（dist:resync tsc 步重编；`dist/src/*` gitignored）
- **not_completed**: （无）
- **commands_executed**:
  - RED baseline：`npx vitest run` 6 文件（forge-exec/cleanup/rtk/forge-git/typed-capabilities/adversarial-mcp-boundaries）→ 115 passed
  - GREEN：合并后同 6 文件 → 115 passed（行为等价）
  - `npx tsc --noEmit` → exit 0
  - `git add src/mcp/tools/forge-exec.ts`（暂存以使 index 与重编 dist 一致，解 dist-sync drift）
  - `npm run dist:resync -- --yes` + `node scripts/check-dist-sync.mjs` → exit 0（293 matched）
  - `npm run check` → exit 0（vitest 7406 | public-api OK | dist-sync 293 | readme-metrics 全匹配）
- **issues_found**:
  - decide 估计的 "12 合并候选" 经 R10 证伪为 1（与 T3 ghost API / T5 skill 引用同型，scope 持续收敛）。真合并净 −27 行。
  - **会话级事故**：build 期间另一会话（外部 commit `6fbe3f8a` by Gruby.Wang @ 08:24 "fix: resolve 4 session issues"）并发操作同一仓库——reset 了 P2 checkpoint（`32a5a4b7`→`fd827765`，后丢弃）、rewrote 分支 HEAD、清空暂存区。T6 改动以 `/tmp/t6-forge-exec.patch` 保存，外部会话停止后在 `forge/code-slim-0612 @ f31419fa` 重新 apply+verify+commit（2348d299）。P2 状态文档从 reflog 中的 `fd827765` 恢复。
  - `dist/src/*` gitignored：dist:resync "No changes detected" 仅指 tracked `dist/test/*`；dist/src 由其 tsc 步重编。src 未 `git add` 暂存时 check-dist-sync 读 index 旧 src → 误报 drift（INV instinct：删除/修改后须 `git add` 暂存）。
- **procedure_compliance**: RED（115@6 files）→ GREEN（合并后 115@6 files，行为等价）→ REFACTOR；INV-5（tsc+vitest）✓；INV-6（dist-sync 293）✓；AC-6.1（未触碰 registerForgeExec / tool 名 `forge_exec` / 参数 schema）✓；INV-2（未改命令字符串构造，execFile 调用形态不变）✓；INV-1（MCP tool 行为不变，adversarial-mcp-boundaries 安全测试全绿）✓。
