---
topic: "forge-slimming-followups"
status: "approved"
date: "2026-05-14"
spec_ref: ".kiro/specs/forge-slimming-followups"
format: "lightweight"
---

## Objective

补齐 `forge-slimming-plan` 审核后发现的 4 个遗留缺口：迁移指南、命令数量 "28" 漂移修复、TypeDoc 快照重生成 + CI 防漂移、三通道 smoke matrix。不碰 `src/`，不新增运行时依赖，PBT 保持 green。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#1-迁移指南r1` | 迁移指南文档结构 + SKILL.md 更新 |
| `design.md#2---verify-count-扩展r2` | verify-count 扫描目标 + 历史括注规则 |
| `design.md#3-typedoc-重生成--ci-防漂移r3` | docs/api/ 重生成 + CI git diff 断言 |
| `design.md#4-smoke-matrix-workflowr4` | 3×2 matrix workflow + smoke scripts |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `docs/slimming-migration.md` | CREATE | 迁移指南文档 |
| `skills/forge-recap/SKILL.md` | MODIFY | 追加迁移指南引用 |
| `skills/forge-resume/SKILL.md` | MODIFY | 追加迁移指南引用 |
| `skills/forge-learn/SKILL.md` | MODIFY | 追加迁移指南引用 |
| `skills/forge-review/SKILL.md` | MODIFY | 追加迁移指南引用 |
| `skills/forge-resume/references/delegation-adapter.md` | MODIFY | 追加迁移指南引用 |
| `skills/forge-review/references/delegation-adapter.md` | MODIFY | 追加迁移指南引用 |
| `.claude-plugin/marketplace.json` | MODIFY | 28 → 22 |
| `ROADMAP.md` | MODIFY | 28 → 22 |
| `CHANGELOG.md` | MODIFY | 28 → 22 |
| `.tinkerman/decisions/2026-05-12-plugin-distribution.md` | MODIFY | 追加 historical 括注 |
| `scripts/gen-plugin-commands.mjs` | MODIFY | 扩展 --verify-count 扫描 |
| `.github/workflows/ci.yml` | MODIFY | verify-count 步骤 + docs diff 断言 |
| `scripts/smoke-install.sh` | CREATE | Channel 安装脚本 |
| `scripts/smoke-activate-pack.sh` | CREATE | Pack 激活脚本 |
| `.github/workflows/smoke-channels.yml` | CREATE | Smoke matrix workflow |
| `docs/api/*` | MODIFY (generated) | TypeDoc 重生成 |

## Task Breakdown

### Task 1: Create migration guide
- **Goal**: 创建 `docs/slimming-migration.md`，覆盖 5 个委托命令 + Pack 条件注册
- **File**: `docs/slimming-migration.md`
- **Design Reference**: `design.md#1-迁移指南r1` — 迁移指南文档结构与内容要求
- **Depends On**: (none)
- **Verify**: `test -f docs/slimming-migration.md && grep -q "forge-mutate" docs/slimming-migration.md && grep -c "### /forge " docs/slimming-migration.md | grep -q "5"`
- **Commit**: `docs(slimming): add migration guide for delegated commands`

### Task 2: Update SKILL.md deprecation references
- **Goal**: 在 4 个 SKILL.md + 2 个 delegation-adapter.md 追加迁移指南路径引用
- **File**: `skills/forge-recap/SKILL.md`, `skills/forge-resume/SKILL.md`, `skills/forge-learn/SKILL.md`, `skills/forge-review/SKILL.md`, `skills/forge-resume/references/delegation-adapter.md`, `skills/forge-review/references/delegation-adapter.md`
- **Design Reference**: `design.md#1-迁移指南r1` — SKILL.md Deprecation_Notice 更新
- **Depends On**: Task 1
- **Verify**: `grep -l "docs/slimming-migration.md" skills/forge-recap/SKILL.md skills/forge-resume/SKILL.md skills/forge-learn/SKILL.md skills/forge-review/SKILL.md | wc -l | grep -q "4"`
- **Commit**: `docs(slimming): add migration guide links to delegated SKILL.md files`

### Task 3: Fix command count in non-historical files
- **Goal**: 将 marketplace.json、ROADMAP.md、CHANGELOG.md 中的 "28" 替换为 SST (22)
- **File**: `.claude-plugin/marketplace.json`, `ROADMAP.md`, `CHANGELOG.md`
- **Design Reference**: `design.md#2---verify-count-扩展r2` — 非历史文件替换策略
- **Depends On**: (none)
- **Verify**: `! grep -n "28.*slash command" ROADMAP.md CHANGELOG.md .claude-plugin/marketplace.json`
- **Commit**: `fix(slimming): correct command count from 28 to 22 in public docs`

### Task 4: Add historical annotation to decision file
- **Goal**: 在 `.tinkerman/decisions/2026-05-12-plugin-distribution.md` 保留原文 "28" 并追加括注
- **File**: `.tinkerman/decisions/2026-05-12-plugin-distribution.md`
- **Design Reference**: `design.md#2---verify-count-扩展r2` — 历史决策文件括注策略
- **Depends On**: (none)
- **Verify**: `grep -q "(historical:" .tinkerman/decisions/2026-05-12-plugin-distribution.md`
- **Commit**: `docs(slimming): add historical count annotation to decision file`

### Task 5: Extend --verify-count in gen-plugin-commands.mjs
- **Goal**: 扩展 verify-count 扫描 ROADMAP.md、CHANGELOG.md、decisions/*.md，含历史括注跳过
- **File**: `scripts/gen-plugin-commands.mjs`
- **Design Reference**: `design.md#2---verify-count-扩展r2` — 扫描目标、正则、括注跳过逻辑
- **Property**: Property — verify-count exit non-zero on drift, exit 0 on clean
- **Depends On**: Task 3, Task 4
- **Verify**: `node scripts/gen-plugin-commands.mjs --verify-count`
- **Commit**: `feat(slimming): extend verify-count to scan ROADMAP/CHANGELOG/decisions`

### Task 6: Wire verify-count into CI + add docs diff assertion
- **Goal**: 在 ci.yml plugin-validate 添加 verify-count；在 check job 的 docs 步骤添加 git diff 断言
- **File**: `.github/workflows/ci.yml`
- **Design Reference**: `design.md#3-typedoc-重生成--ci-防漂移r3` + `design.md#2---verify-count-扩展r2`
- **Depends On**: Task 5
- **Verify**: `grep -q "verify-count" .github/workflows/ci.yml && grep -A5 "Verify docs generation" .github/workflows/ci.yml | grep -q "git diff"`
- **Commit**: `ci(slimming): add verify-count to plugin-validate + docs drift guard`

### Task 7: Regenerate TypeDoc
- **Goal**: 运行 `npm run docs` 刷新 docs/api/，确认无 ⏳ 残留
- **File**: `docs/api/*` (generated)
- **Design Reference**: `design.md#3-typedoc-重生成--ci-防漂移r3`
- **Depends On**: Task 3 (ROADMAP.md 修正后重生成才不含过期数字)
- **Verify**: `npm run docs && ! grep -r "⏳" docs/api/media/ROADMAP.md`
- **Commit**: `docs(slimming): regenerate TypeDoc from current source`

### Task 8: Create smoke-install.sh
- **Goal**: 创建 channel 安装脚本，支持 clone/dist/plugin 三种模式
- **File**: `scripts/smoke-install.sh`
- **Design Reference**: `design.md#4-smoke-matrix-workflowr4` — channel 安装逻辑
- **Depends On**: (none)
- **Verify**: `test -x scripts/smoke-install.sh && bash scripts/smoke-install.sh clone`
- **Commit**: `ci(slimming): add smoke-install.sh channel setup script`

### Task 9: Create smoke-activate-pack.sh
- **Goal**: 创建 pack 激活脚本，支持 pms pack
- **File**: `scripts/smoke-activate-pack.sh`
- **Design Reference**: `design.md#4-smoke-matrix-workflowr4` — pack 激活逻辑
- **Depends On**: (none)
- **Verify**: `test -x scripts/smoke-activate-pack.sh`
- **Commit**: `ci(slimming): add smoke-activate-pack.sh script`

### Task 10: Create smoke-channels.yml workflow
- **Goal**: 创建 3×2 matrix CI workflow，覆盖 channel×pack 组合
- **File**: `.github/workflows/smoke-channels.yml`
- **Design Reference**: `design.md#4-smoke-matrix-workflowr4` — YAML 结构、断言、错误消息格式
- **Property**: Property — fail-fast: false, [channel×pack] error format
- **Depends On**: Task 8, Task 9
- **Verify**: `grep -q "matrix:" .github/workflows/smoke-channels.yml && grep -q "fail-fast: false" .github/workflows/smoke-channels.yml`
- **Commit**: `ci(slimming): add smoke-channels matrix workflow`

### Task 11: Final checkpoint — all green
- **Goal**: npm run test 通过，verify-count 退出 0，无 src/ 修改，无新 dependencies
- **File**: (verification only)
- **Design Reference**: (cross-cutting R5-R8)
- **Depends On**: Task 1-10 all complete
- **Verify**: `npm run test && node scripts/gen-plugin-commands.mjs --verify-count && git diff --stat src/ | test -z`
- **Commit**: (no commit — verification only)

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| R1 (migration guide) | Task 1, Task 2 |
| R2 (command count fix) | Task 3, Task 4, Task 5, Task 6 |
| R3 (TypeDoc + CI drift) | Task 7, Task 6 |
| R4 (smoke matrix) | Task 8, Task 9, Task 10 |
| R5 (no new deps) | Task 11 |
| R6 (frozen zone unchanged) | Task 11 |
| R7 (PBT green) | Task 11 |
| R8 (backward compat) | Task 11 |

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "3", "4", "8", "9"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["5"] },
    { "id": 3, "tasks": ["6", "7", "10"] },
    { "id": 4, "tasks": ["11"] }
  ]
}
```
