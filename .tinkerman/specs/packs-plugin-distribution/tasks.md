---
feature: packs-plugin-distribution
layout: tasks
created: 2026-06-27
brownfield: true
spec_ref: ".tinkerman/specs/packs-plugin-distribution/requirements.md"
plan_locked_at: 2026-06-27
estimated_total_minutes: 35
wave_structure: "W1[T1,T2,T3] → W2[T4] ∥ W3[T5] → W4[T6,T7]"
---

# Tasks — Packs Plugin Distribution（切片 A'）

> 7 个 REQ 拆为 7 个原子任务。每个任务一对 RED-GREEN（TDD vertical slice）。
> Wave 顺序遵循依赖：manifest(REQ-03) 先于 bundle-sync 断言(REQ-04) 和 init 校验(REQ-05)。
> **plan self-check 通过**：无 placeholder、依赖图无环（DAG）、每 task 有 Verify command。

## 测试惯例（匹配项目现有模式）

本切片改动集中在 shell 脚本（build-dist.sh / init.sh / check-bundle-sync.mjs），测试遵循项目现有模式：
- **shell 脚本测试用 `test/*.test.sh`**（bash 形式，参照 `test/build-dist-compile.test.sh`、`test/init-flags.test.sh`），不是 vitest。
- 这些 `.test.sh` 用临时 git worktree 副本运行 build-dist.sh，避免污染真实 repo dist/（参照 build-dist-compile.test.sh:34 `mk_repo_copy`）。
- **纯 JS 逻辑测试**（如 check-bundle-sync.mjs 的 packs 校验函数）可用 vitest，导入核心函数做单测。
- check-bundle-sync / dist-sync 等门禁脚本本身有 skip 机制，测试要覆盖 skip 路径。
- 现有 6 个 `test/init-*.test.sh` 是 INV-1（clone 用户不回归）的回归基线。

## Wave 1：构建期改动（build-dist.sh，独立可测）

### Task 1: build-dist.sh 拷贝正式 pack 进 bundle（REQ-01）
- **Depends On**: []
- **Files**: `scripts/build-dist.sh` + `test/build-dist-packs.test.sh`
- **RED**：新建 `test/build-dist-packs.test.sh`（参照 build-dist-compile.test.sh 的 mk_repo_copy 模式），断言构建后 `dist/claude-code/bundles/forge/packs/pms/` 存在，含 pack.yaml + contexts/ + state-machines/ + utils/business-day-clock.ts；不含 pms-marriott-sample；不含 *.test.ts。
  - Run: `bash test/build-dist-packs.test.sh`
  - Expected: FAIL — packs 目录不存在
- **GREEN**：build-dist.sh 在 skills/agents 拷贝段后加 packs 拷贝段：`PACK_ALLOWLIST=("pms")` 循环 `cp -r packs/${name}` 到 CC_BUNDLE/packs/；排除 *.test.ts（cp 后 find 删除，或 rsync --exclude）。
- **Verify**: `bash test/build-dist-packs.test.sh` → exit 0
- **引用**: REQ-01

### Task 2: 生成 packs/manifest.json（REQ-03 前半）
- **Depends On**: [1]
- **Files**: `scripts/build-dist.sh` + `test/build-dist-packs.test.sh`（扩展）
- **RED**：在 Task 1 测试中加断言：`${CC_BUNDLE}/packs/manifest.json` 存在，JSON 合法，含 generated_at/forge_version/packs[]，packs[] 每项有 name/forge_min_version/path。
  - Run: `bash test/build-dist-packs.test.sh`
  - Expected: FAIL — manifest 不存在
- **GREEN**：build-dist.sh 在 pack 拷贝后，用 node 内联脚本读各 pack.yaml 的 forge_min_version + package.json version，生成 manifest.json（schema 见 design.md §2.2）。
- **Verify**: exit 0
- **引用**: REQ-03

### Task 3: 生成 packs/README.md（REQ-02）
- **Depends On**: [1]
- **Files**: `scripts/build-dist.sh` + `test/build-dist-packs.test.sh`（扩展）
- **RED**：断言 `${CC_BUNDLE}/packs/README.md` 存在，含 pack 清单 + "可选领域知识，可忽略" + 可运行代码提示。
- **GREEN**：build-dist.sh 用 heredoc 生成 README.md（基于 allowlist + pack 描述）。
- **Verify**: 测试通过
- **引用**: REQ-02

## Wave 2：校验期改动（check-bundle-sync，依赖 manifest）

### Task 4: check-bundle-sync 增加 packs 完整性校验（REQ-04）
- **Depends On**: [2]
- **Files**: `scripts/check-bundle-sync.mjs` + `test/check-bundle-sync-packs.test.ts`（vitest，纯 JS 逻辑）
- **RED**：断言 (a) 正常 bundle → Layer 3 packs 校验 exit 0；(b) 删 bundle 内某 pack 目录 → exit 1 报告缺失；(c) FORGE_SKIP_BUNDLE_SYNC=1 → skip。
  - Run: `npx vitest run test/check-bundle-sync-packs.test.ts`
  - Expected: FAIL — 无 Layer 3 逻辑
- **GREEN**：check-bundle-sync.mjs 加 `checkPacksIntegrity()`：读 CC_BUNDLE/packs/manifest.json，校验每个 packs[].path 存在且非空；manifest 不存在则 warn 跳过。复用现有 checkSkip。
- **Verify**: exit 0（正常）/ exit 1（删 pack）
- **引用**: REQ-04

## Wave 3：运行期改动（init.sh，依赖 manifest + 拷贝）

### Task 5: init.sh manifest 校验 + 埋点（REQ-05 + REQ-06）
- **Depends On**: [2]
- **Files**: `scripts/init.sh` + `test/init-pack-distribution.test.sh`
- **RED**：新建 `test/init-pack-distribution.test.sh`（参照 init-flags.test.sh 模式），断言 (a) plugin 场景（CLAUDE_PLUGIN_ROOT 指向含 packs 的 bundle）`--pack pms` 不再 warn"功能将不可用"；(b) clone 场景（FORGE_ROOT 非 plugin）行为不变（现有 init-flags 等测试仍绿 = INV-1）；(c) 成功启用后 `.tinkerman/knowledge/tool-health.md` 含 pack-enabled 记录行。
  - Run: `bash test/init-pack-distribution.test.sh`
  - Expected: FAIL
- **GREEN**：init.sh 在 pack 定位命中后，读 `${FORGE_ROOT}/packs/manifest.json` 校验 pack 在清单（manifest 缺失则 warn 跳过，保持 clone 场景兼容）；成功后 `echo` 追加埋点（格式见 design §2.4）到 PROJECT_ROOT/.tinkerman/knowledge/tool-health.md（.forge 不可写则跳过）。
- **Verify**: `bash test/init-pack-distribution.test.sh` → exit 0；现有 6 个 init-*.test.sh 仍全绿（INV-1）
- **引用**: REQ-05, REQ-06

## Wave 4：回归保障

### Task 6: npm run check + bundle 完整性回归（REQ-07）
- **Depends On**: [1,2,3,4,5]
- **Files**: 无新文件（验证任务）
- **RED**：无（回归保障任务）
- **GREEN**：运行 `npx tsc --noEmit && npx biome check src/ test/ && npx vitest run && npm run check`，修复任何回归。
- **Verify**: `npm run check` exit 0；contract.test.ts bundle 完整性通过
- **引用**: REQ-07, INV-4

### Task 7: 核心修复端到端验证（plugin 场景 --pack pms 不再 warn）
- **Depends On**: [1,2,3,5]
- **Files**: 无（验证任务，并入 Task 5 的测试或单独 e2e）
- **RED**：无
- **GREEN**：模拟 plugin 场景（设 CLAUDE_PLUGIN_ROOT 指向构建好的 bundle），跑 `bash ${CLAUDE_PLUGIN_ROOT}/scripts/init.sh --pack pms --non-interactive`，断言输出不含"功能将不可用"，断言 pack 配置正确写入。
- **Verify**: 端到端通过（可并入 Task 5 的 init-pack-distribution.test.sh 的 plugin 场景用例）
- **引用**: 验收标准"核心修复验证"

## DoD（Definition of Done）

- [x] 7 个 Task 全部 done
- [x] 7 个 REQ 各自 Evidence 齐全
- [x] `npm run check` 全绿（INV-4, INV-5）
- [x] bundle 体积增长 ≤ 1MB（INV-2）
- [x] 无运行时网络请求（INV-3，代码审查 + grep）
- [x] git clone 用户行为不变（INV-1，现有 init 测试全绿）
- [x] 核心修复验证：plugin 场景 --pack pms 不再 warn
- [x] sample + *.test.ts 不进 bundle
- [x] 原子提交（每 Task 一个 commit）

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| build-dist.sh 在 CI 跑，本地测试需手动重建 bundle | 测试用临时构建或 mock bundle 路径 |
| init.sh 测试需模拟 plugin 环境（CLAUDE_PLUGIN_ROOT） | 测试设 env + 临时目录，hermetic |
| packs/ 是 gitignored？需确认 build-dist 拷的是仓库 packs 还是 dist packs | 仓库 packs/（git 跟踪，clone 可见），build-dist 直接拷源 |
| bundle 体积断言阈值 | 实测 pms≈392K，阈值设 1MB 留余量（INV-2）|
