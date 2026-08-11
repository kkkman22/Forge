---
slug: "code-slim-deprecated-exports"
created: "2026-06-13"
status: "resolved"
root_cause: "decide 阶段未检查 package.json exports map；deprecated.ts 是声明的公开 subpath（./deprecated），T1 删文件后 exports 条目悬空"
resolution: ""
---

# Current Focus
P0 修复方案裁决（等待用户确认）：移除 package.json `./deprecated` exports 条目 + 修 src/index.ts:10 悬空文档。

# Symptoms
- L4 adversarial review 报 P0：`src/deprecated.ts` 删除后，`package.json` exports 的 `"./deprecated": "./dist/src/deprecated.js"` 变悬空引用。
- `import "forge-loop/deprecated"` 将 ERR_PACKAGE_PATH_NOT_EXPORTED。
- 与任务硬约束"公开 API/CLI行为不变"表面冲突。
- `check-public-api.mjs` 未校验 exports↔文件（gap），故 `npm run check` 漏过。

# Hypotheses
## H1: ./deprecated 是真实公开契约，删除=破坏性变更，须回退 T1
- Prediction: 包已发布到 npm 且有外部消费者。
- Falsification test: `npm view forge-loop` + 仓库消费者 grep。
- Status: ❌ 排除（见 Evidence）

## H2: ./deprecated 是理论契约（未发布/零消费者/自我弃用逾期），可同步移除 exports 条目完成退役
- Prediction: 包未发布、无消费者、自身标注 v2.5.0 移除已逾期。
- Falsification test: 同上 + ci.yml 发布状态。
- Status: ✅ 确认

# Evidence
- `npm view forge-loop` → **404 Not Found**（未发布到 registry）。
- 仓库 grep `forge-loop/deprecated` → 零真实消费者（仅 .diff-context 回显 + axe.min.js vendor 噪声）。
- `grep "\"forge-loop\"" package.json` → 仅自身 name 字段，无下游依赖。
- ci.yml:183-222 有 publish job（registry.npmjs.org + npm publish + NPM_TOKEN），但近 commit `37cd2154 fix(ci): compile before check in publish job` 表明发布链路近期才修，从未成功发布。
- `src/deprecated.ts` 头部：`@deprecated Will be removed in v2.5.0`，当前 v3.4.0（逾期 9 版本）。
- package.json 无 description/keywords/bin → 非 CLI、非典型公开库，更像内部/个人工具。
- CHANGELOG.md:396 有 "Breaking Changes" 先例，可登记。

# Eliminated
- H1 排除：包未发布 + 零消费者 → 无真实破坏面。

# Structured Reasoning Checkpoint
- **Hypothesis**: H2 — ./deprecated 是理论契约，移除 exports 条目完成逾期弃用退役。
- **Confirming Evidence**: npm 404 + 零消费者 + 自我标注 v2.5.0 移除逾期 + 无 bin/description（内部工具）。
- **Falsification Test**: 若发现任何 git-install 消费者或历史发布记录 → 重评。
- **Fix Rationale**: 移除 `./deprecated` exports 条目使删除自洽；完成 @deprecated 承诺的退役（非意外破坏）；零真实影响。
- **Blind Spots**: (1) git-direct install 消费者无法穷举；(2) 严格 semver 仍是 major 变更，应在 CHANGELOG 登记。

# Resolution
P0 已解决（gated_auto 用户确认 "移除 exports 条目"）：
- 移除 `package.json` exports 的 `"./deprecated"` 条目（消除悬空引用）。
- 删除 `src/index.ts:9-11` 指向 `forge-loop/deprecated` 的悬空文档（顺带解决 L1 P3）。
- `CHANGELOG.md` [Unreleased] ### Removed 登记弃用退役（引用 ADR-0008）。
- 验证：`npm run dist:resync`（dist 无变化，注释不影响产物）；`check-public-api.mjs` exit 0；`npm run check` 全绿。
- L4 P0 #1（exports 悬空）+ #2（check 证据）+ L1 P3（悬空文档）全部解决。
- 根因：decide 阶段未检查 package.json exports map。教训：棕地"等价 refactor"删任何文件前，必查 package.json `exports`/`main`/`files` 公开导出面，非仅 grep src/test caller。
