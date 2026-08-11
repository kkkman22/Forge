---
feature: forge-slimming-followups
layout: design
created: 2026-05-14
---

# Design Document — forge-slimming-followups

## Overview

本 spec 补齐 `forge-slimming-plan` 审核后发现的 4 个遗留缺口：迁移指南缺失、命令数量 "28" 漂移、TypeDoc 快照过期、三通道 smoke matrix 缺失。所有变更不触碰 `src/`，不新增运行时依赖，保持 PBT green。

**覆盖 R1-R8**

---

## Architecture

### 执行依赖图

```mermaid
flowchart LR
    R1[R1 迁移指南] --> R2[R2 命令数量修复]
    R2 --> R3[R3 TypeDoc 重生成]
    R3 --> R4[R4 Smoke Matrix]
    R1 -.->|SKILL.md 引用指南路径| R2
    R2 -.->|verify-count 扩展| R4
```

**执行顺序**：R1 → R2 → R3 → R4（R1 产出的 `docs/slimming-migration.md` 被 R2 中 SKILL.md 更新引用；R2 修复 ROADMAP.md 后 R3 重生成才不含过期数字；R4 的 smoke 依赖前三步产物稳定）。

---

## Components and Interfaces

### 1. 迁移指南（R1）

**输出文件**：`docs/slimming-migration.md`

**文档结构**：

```markdown
# Forge Slimming 迁移指南

## 概述
简述 T2 命令委托的背景与目标。

## 受影响命令

### /forge recap
- 变更内容：基础层委托给 /compact + /context
- 委托的 Native_Command：/compact, /context
- 最低推荐版本：2.0+（引用 skills/shared/native-command-matrix.md）
- 低版本 Fallback：遗留 recap 行为
- 检查 Deprecation_Notice 锁文件：.tinkerman/.deprecation-notice/<sid>/forge-recap.lock

### /forge resume
（同结构）

### /forge abort
### /forge learn
### /forge review

## Pack_Conditional_Skill 注册
- 为什么 forge-mutate 可能不在命令列表
- 如何通过 pack 启用：激活 pms pack → feature_flags.mutation_critical_modules → 重跑 gen-plugin-commands

## FAQ
```

**SKILL.md 更新**：每个受影响 skill 的 Deprecation_Notice 文本末尾追加 `迁移指南：docs/slimming-migration.md`。涉及文件：
- `skills/forge-recap/SKILL.md`
- `skills/forge-resume/SKILL.md`
- `skills/forge-learn/SKILL.md`
- `skills/forge-review/SKILL.md`

### 2. --verify-count 扩展（R2）

**新增扫描目标**（追加到 `scripts/gen-plugin-commands.mjs` 的 `targets` 数组）：

| 文件 | 模式 |
|------|------|
| `.claude-plugin/marketplace.json` | 已有，保持 |
| `ROADMAP.md` | `/(\d+)\s*(?:个\s*slash\s*command|slash\s*command)/gi` |
| `CHANGELOG.md` | `/(\d+)\s*(?:个\s*slash\s*command|slash\s*command\s*wrappers?)/gi` |
| `.tinkerman/decisions/*.md` | 同上模式，但匹配时**跳过**含 `(historical:` 的行 |

**历史决策文件处理**：
- 检测到 `.tinkerman/decisions/*.md` 中的裸数字 ≠ SST 时，若该行已含 `(historical:` 括注则视为合规（跳过）。
- 若无括注则报告漂移，提示开发者添加 `(historical: count at time of writing was N; current SST={FORGE_COMMAND_COUNT})`。

**裸数字检测正则**：`/(\d+)\s*(?:个\s*)?(?:slash\s*)?command/gi` — 匹配 "28 commands"、"28 个 slash command"、"22 slash command wrappers" 等变体。

**修复策略**：
- `marketplace.json`、`ROADMAP.md`、`CHANGELOG.md`：直接替换为 SST 值（22）。
- `.tinkerman/decisions/2026-05-12-plugin-distribution.md`：保留原文 "28"，追加括注。

### 3. TypeDoc 重生成 + CI 防漂移（R3）

**决策**：`docs/api/` 保持 committed（已有 CI 步骤 `npm run docs` 在 check job 中运行）。不加入 `.gitignore`。

**CI 步骤设计**（扩展现有 `ci.yml` check job）：

```yaml
- name: Verify docs generation is up-to-date
  run: |
    npm run docs
    if [ -n "$(git diff --stat docs/api/)" ]; then
      echo "::error::docs/api/ is out of date. Run 'npm run docs' locally and commit."
      git diff --stat docs/api/
      exit 1
    fi
```

此步骤已存在（`Verify docs generation`），只需确认其 `git diff` 断言覆盖 `docs/api/` 路径。若当前步骤仅运行 `npm run docs` 而未做 diff 断言，则追加上述 diff 检查。

### 4. Smoke Matrix Workflow（R4）

**文件**：`.github/workflows/smoke-channels.yml`

**YAML 结构**：

```yaml
name: Smoke Channels

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  smoke:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        channel: [clone, dist, plugin]
        pack: [none, pms]
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci

      - name: Install via channel (${{ matrix.channel }})
        run: bash scripts/smoke-install.sh ${{ matrix.channel }}

      - name: Activate pack (${{ matrix.pack }})
        if: matrix.pack != 'none'
        run: bash scripts/smoke-activate-pack.sh ${{ matrix.pack }}

      - name: Verify forge status
        run: node scripts/gen-plugin-commands.mjs --dry-run

      - name: Assert forge-mutate visibility
        run: |
          COMMANDS=$(ls commands/*.md | xargs -I{} basename {} .md)
          if [ "${{ matrix.pack }}" = "none" ]; then
            if echo "$COMMANDS" | grep -q "^forge-mutate$"; then
              echo "::error::[${​{ matrix.channel }}×${{ matrix.pack }}] forge-mutate should NOT be registered"
              exit 1
            fi
          else
            if ! echo "$COMMANDS" | grep -q "^forge-mutate$"; then
              echo "::error::[${​{ matrix.channel }}×${{ matrix.pack }}] forge-mutate SHOULD be registered"
              exit 1
            fi
          fi

      - name: Verify Delegation_Adapter version detection
        run: |
          # Exercise version detection path without requiring Native_Command success
          bash -c 'source skills/shared/native-command-matrix.md 2>/dev/null || true'
          echo "Version detection path exercised for [${{ matrix.channel }}×${{ matrix.pack }}]"
```

**每个 cell 的断言**：
- `channel=clone`：直接使用 checkout 的仓库。
- `channel=dist`：运行 `scripts/build-dist.sh` → 在 dist 目录执行。
- `channel=plugin`：运行 `scripts/build-dist.sh` → 使用 `dist-plugin/` 目录。
- `forge-mutate` 可见性：`pack=none` 时不在 `commands/` 中；`pack=pms` 时存在。
- 错误消息格式：`[channel×pack] <message>`，满足 R4.4。

---

## Data Models

本 spec 无新数据模型。涉及的数据结构沿用 `forge-slimming-plan` design 中已定义的：
- Deprecation_Notice 锁文件（`.tinkerman/.deprecation-notice/<sid>/<cmd>.lock`）
- Command_Count_Declaration（`{FORGE_COMMAND_COUNT}` 占位符 + `.tinkerman/.command-count`）
- Pack_Conditional_Skill 注册记录

---

## Error Handling

| 场景 | 处理 |
|------|------|
| `--verify-count` 在 decisions/ 文件中发现裸数字但无括注 | 报告文件路径 + 行号 + 当前值 vs SST，exit 1 |
| `npm run docs` 后 `git diff docs/api/` 非空 | CI 打印 diff stat，exit 1，提示本地重跑 |
| Smoke matrix cell 失败 | 错误消息含 `[channel×pack]` 标识，`fail-fast: false` 确保其他 cell 继续 |
| 迁移指南路径在 SKILL.md 中已存在 | 幂等：不重复追加 |

---

## Testing Strategy

### PBT 不适用性说明

本 spec 的 8 条需求均属于文档创建、CI 配置、固定文件内容修复类任务。无需求满足 PBT 适用条件（无纯函数 + 大输入空间 + 100 次迭代比 3 次发现更多 bug）。采用 example-based 单元测试 + CI smoke 覆盖。

### 测试分层

| 层 | 覆盖 | 工具 |
|----|------|------|
| Example-based unit | verify-count 扩展逻辑（含括注跳过）、forge-mutate 可见性断言 | vitest |
| CI smoke | TypeDoc drift、smoke-channels matrix、plugin-validate --verify-count | GitHub Actions |
| Existing PBT | 133 条 fast-check 属性测试保持 green | fast-check |

### 回归保护

- `npm run test` 全量通过（R7）
- `plugin-validate` job 含扩展后的 `--verify-count`（R2.6）
- `smoke-channels` matrix 6 cells 全绿（R4）
- `docs/api/` drift check 在 check job 中执行（R3.3）
