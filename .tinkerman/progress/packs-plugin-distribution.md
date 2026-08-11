# Progress — packs-plugin-distribution（切片 A'）

> Plan: `.tinkerman/specs/packs-plugin-distribution/tasks.md` (status: locked)
> Spec: `.tinkerman/specs/packs-plugin-distribution/requirements.md` (status: locked)
> Decision: `.tinkerman/decisions/2026-06-27-packs-plugin-distribution.md`
> Branch: `feat/domain-example-reference-impl`

## Wave 进度

- [x] **Wave 1** — T1/T2/T3 (build-dist.sh: copy packs + manifest + README)
  - commit `310e92cb` feat(build-dist): copy formal packs into CC + plugin bundles (REQ-01)
- [x] **Wave 2** — T4 (check-bundle-sync Layer 3)
  - commit `915af76f` feat(bundle-sync): add Layer 3 packs-integrity check (REQ-04)
- [x] **Wave 3** — T5 (init.sh manifest guard + telemetry)
  - commit `fc7c62e8` feat(init): pack manifest guard + --pack telemetry (REQ-05/06)
- [x] **Wave 4** — T6 (regression)
  - commit (style/biome + exec-bit Rule 3 fixes)
  - **`npm run check` EXIT=0**: 718 files / 8928 passed | 3 skipped, 0 failed
- [x] **Wave 4** — T7 (e2e: plugin --pack pms no longer warns)
  - commit `071cc0ed` test(smoke): add packs distribution + plugin e2e to plugin-dist smoke (T7)
  - commit `288be3e5` style(smoke): biome format plugin-dist e2e (Rule 3)
  - **核心修复验证**：真实 dist-plugin bundle + bundled init.sh，`CLAUDE_PLUGIN_ROOT=dist-plugin` 下 `--pack pms` → 不 warn"功能将不可用" + PMS pack 激活 + tool-health 埋点 `source=plugin`。固化为 smoke test 可重跑。

## §3.5 Final Validation

`npm run check`（= tsc + biome + vitest + readme-metrics + bundle-sync + docs-structure）**EXIT=0**：
- Test Files 718 passed (718)
- Tests 8933 passed | 3 skipped, 0 failed
- bundle-sync: `OK — 30 scripts verified, dist-plugin present, packs intact`

## DoD（Definition of Done）自检

- [x] 7 个 Task 全部 done
- [x] 7 个 REQ 各自 Evidence 齐全（build-dist packs 拷贝 / manifest / README / Layer 3 / init manifest+telemetry / regression / e2e）
- [x] `npm run check` 全绿（INV-4, INV-5）
- [x] bundle 体积增长 ≤ 1MB（INV-2: dist-plugin 444 文件，pms≈392K）
- [x] 无运行时网络请求（INV-3: 全静态拷贝，无 fetch/curl）
- [x] git clone 用户行为不变（INV-1: 7 个 init-*.test.sh 全绿）
- [x] 核心修复验证：plugin 场景 --pack pms 不再 warn（T7 smoke e2e）
- [x] sample + *.test.ts 不进 bundle（P2/P3 断言 + smoke 验证）
- [x] 原子提交（每 Task 一个 commit）

## INV 验证（全局不变式）

| INV | 不变式 | 状态 | 证据 |
|-----|--------|------|------|
| INV-1 | git clone 用户行为不变 | ✅ | 7 个 init-*.test.sh 全绿（capability 9 / companion-python 8 / companion-resilience 1 / flags 19 / recipe 17 / skip-hooks-marketplace 3） |
| INV-2 | plugin bundle 体积增长 ≤ 1MB | ✅ | dist-plugin 444 文件，pms≈392K << 1MB |
| INV-3 | 不引入运行时网络请求 | ✅ | 全静态拷贝，无 fetch/curl（代码审查） |
| INV-4 | check-bundle-sync / dist-sync / npm run check 不回归 | ✅ | `npm run check` EXIT=0；Layer 1+2 路径不变 |
| INV-5 | 每个改动验证（tsc + vitest + check） | ✅ | `npm run check` EXIT=0 |

## Deviations（记录于 commit message）

### Rule 2 — Auto-added missing critical functionality
- **packs 同时进 CC_BUNDLE 和 dist-plugin**：spec REQ-01 Evidence 只写 `${CC_BUNDLE}/packs/`，但 check-bundle-sync Layer 1 已校验 CC+Plugin 两份 bundle，且 plugin 安装从 dist-plugin/forge-plugin-{VERSION}.zip 走。仅拷 CC 会让 REQ-05（plugin 场景 --pack pms 不再 warn）继续是谎言。两段都拷，与 Layer 1 对称。
- **T1/T2/T3 合并实现 + 单一测试文件**：copy_packs / gen_packs_manifest / gen_packs_readme 共享 PACK_ALLOWLIST 和 bundle 上下文，同一处 build-dist.sh 挂载点，跨 commit 拆分会切碎一致状态。test/build-dist-packs.test.sh 单文件断言 P1-P5。

### Rule 3 — Auto-fix blocking issues
- biome format（import 排序 + 引号）on check-bundle-sync-packs.test.ts
- 恢复 build-dist.sh / init.sh 的 execute bit（Edit 工具丢失，contract.test.ts 阻断）

## 核心修复验证（待 T7）

plugin 场景 `--pack pms` 不再 warn"功能将不可用"——T5 的 D1 断言已验证（init-pack-distribution.test.sh）。T7 做完整端到端（真实构建 bundle + 真实 init）。
