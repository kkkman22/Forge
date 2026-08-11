---
topic: code-slim-0612
package: P1-Wave1
date: 2026-06-13
result: pass
scope: package
reviewed_at_commit: 8529b468
methodology: subagent-parallel
layers: [spec-check, quality-check, security-check, adversarial]
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
---

# Review — code-slim-0612 Package 1 (Wave 1)

## Verdict: ✅ PASS (package-scoped)

等价 refactor：删除 `src/deprecated.ts`（死 shim）+ 移除 `error-recovery/index.ts` 幂等 re-export + 修复 P0。

## Layer Findings (initial 4-subagent review)

| Layer | P0 | P1 | P2 | P3 | Result |
|-------|----|----|----|----|--------|
| L1 spec-check | 0 | 0 | 0 | 1 | pass (P3: stale doc) |
| L2 quality-check | 0 | 0 | 0 | 0 | pass |
| L3 security-check | 0 | 0 | 0 | 0 | pass (INV-2/INV-4 preserved) |
| L4 adversarial | 2 | 0 | 3 | 0 | **block** → fix → re-review |

### P0 (L4 adversarial) — found & resolved

- **P0-1**: `deprecated.ts` 是 `package.json` exports 声明的公开 subpath `./deprecated`（`private:false`）。T1 删文件后 exports 条目悬空 → `import "forge-loop/deprecated"` ERR_PACKAGE_PATH_NOT_EXPORTED，与 INV-1 表面冲突。
- **P0-2**: `check-public-api.mjs` 不校验 exports↔文件（gap），故 `npm run check` 漏过。
- **Resolution** (gated_auto 用户确认 "移除 exports 条目"，commit 8529b468):
  - Debug 深查（`.tinkerman/debug/code-slim-deprecated-exports.md`）：包未发布（npm 404）、零消费者、`@deprecated` 自 v2.5.0 逾期至 v3.4.0。
  - 移除 `package.json` `"./deprecated"` exports 条目；删 `src/index.ts:9-11` 悬空文档（解 L1 P3）；CHANGELOG [Unreleased] 登记。

### P2 (L4, advisory — no action this PR)

- `export *` 覆盖性应逐个核验（勿泛化）；未来 Package 2/3 删 barrel re-export 前单独验证。
- barrel-file.test `toHaveLength(140)` 对本 refactor 无覆盖力（deprecated/error-recovery 内部符号不在公开 barrel）；真实安全证据= tsc + error-recovery.property.test.ts。

## Re-review (post-fix, proportionate — config-contract change, no logic)

- 无残余 `forge-loop/deprecated` / `./deprecated` 悬空引用（src/config/test grep clean）。
- exports 现 `{".":"./dist/src/index.js"}`。
- `npm run check` exit 0（无回归：tsc+biome+vitest+public-api+dist-sync+skill/doc 全绿）。
- P0-1/P0-2 + L1 P3 全部解决。

## INV Check

- INV-1 公开契约：`./deprecated` subpath 移除 = 完成已承诺（v2.5.0）且逾期的弃用退役；包未发布、零消费者。CHANGELOG 已登记。
- INV-2 安全控制 / INV-4 安全测试：未触碰（L3 确认）。
- INV-3 scripts dist 路径：未移动/重命名。
- INV-5 tsc+vitest / INV-6 dist-sync：每步绿。

## Ship gate

P0=0 P1=0 → 放行 test → ship。
