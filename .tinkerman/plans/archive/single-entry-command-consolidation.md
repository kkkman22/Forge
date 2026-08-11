---
topic: "single-entry-command-consolidation"
status: "approved"
date: "2026-05-16"
spec_ref: ".kiro/specs/single-entry-command-consolidation/requirements.md"
format: "full"
---

# Plan: Single-Entry Command Consolidation

> 来源: `.kiro/specs/single-entry-command-consolidation/tasks.md`

## Objective

把 Forge plugin 的入口模型从「`/forge` + 28 个 `/forge-<sub>` wrapper」收敛为「只有 `/forge` 一个 slash command」。解决 commands/forge.md 内 `Skill(skill="forge", args="...")` 调用不存在 skill 的 bug。

## Research Findings

- **28 个 wrapper 需删除**：commands/ 目录含 forge.md + 28 个 forge-*.md wrapper
- **gen-plugin-commands.mjs 存在**：当前会生成 wrapper，需改为 single-entry mode
- **commands/forge.md 含 bug**：`Skill(skill="forge", args="...")` 形式调不到任何 skill
- **下游声明文件 6 个**：README.md / plugin.json / marketplace.json / reference-commands.md / ROADMAP.md / CHANGELOG.md
- **ADR 基础设施**：需检查 src/adr-registry.ts 是否存在

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `commands/forge-*.md` (28 files) | DELETE | 删除全部 wrapper command |
| `commands/forge.md` | MODIFY | Skill 调用语法对齐到真实 skill 名 |
| `scripts/gen-plugin-commands.mjs` | MODIFY | 改为 single-entry mode |
| `test/single-entry/forge-md-skill-syntax.test.ts` | CREATE | R2: Skill 调用语法测试 |
| `test/single-entry/subcommand-table.test.ts` | CREATE | R1: 子命令完整性测试 |
| `test/single-entry/gen-script-verify-count.test.ts` | CREATE | R3: 生成脚本测试 |
| `README.md` | MODIFY | 计数声明更新 |
| `CHANGELOG.md` | MODIFY | v2.5.0 breaking changes |
| `.claude-plugin/plugin.json` | MODIFY | description 更新 |
| `.claude-plugin/marketplace.json` | MODIFY | description 更新 |
| `docs/reference-commands.md` | MODIFY | 单入口 banner |
| `ROADMAP.md` | MODIFY | 计数声明更新 |
| `.tinkerman/decisions/ADR-0003-single-entry-command-consolidation.md` | CREATE | ADR |
| `.tinkerman/decisions/2026-05-12-plugin-distribution.md` | MODIFY | 追加 Update 章节 |

## Tasks

### Task 1: Wave 1 RED — R2 测试

**Depends On**: []
**Files**:
- Create: `test/single-entry/forge-md-skill-syntax.test.ts`
- Create: `test/single-entry/subcommand-table.test.ts`

**TDD**: 先写测试，验证全部 RED。

_Requirements: R1.AC3, R2.AC1-R2.AC5_

### Task 2: Wave 1 GREEN — 改写 commands/forge.md

**Depends On**: ["1"]
**Files**:
- Modify: `commands/forge.md`

**TDD**: 改写后测试全部 GREEN。替换 `Skill(skill="forge", args="...")` 为 `Skill(forge-<sub>)`。

_Requirements: R2.AC1-R2.AC6_

### Task 3: Wave 2 RED — R3 测试

**Depends On**: ["2"]
**Files**:
- Create: `test/single-entry/gen-script-verify-count.test.ts`

**TDD**: 先写测试，验证全部 RED。

_Requirements: R3.AC1-R3.AC6_

### Task 4: Wave 2 GREEN — 改写 gen-plugin-commands.mjs

**Depends On**: ["3"]
**Files**:
- Modify: `scripts/gen-plugin-commands.mjs`

**TDD**: single-entry mode。不写 wrapper。--verify-count 兼容。

_Requirements: R3.AC1-R3.AC6_

### Task 5: Wave 3 — 删除 28 个 wrapper

**Depends On**: ["4"]
**Files**:
- Delete: `commands/forge-*.md` (28 files)

git rm 全部 wrapper。不删 forge.md。

_Requirements: R1.AC1-R1.AC4_

### Task 6: Wave 4 — 同步下游计数声明

**Depends On**: ["5"]
**Files**:
- Modify: `README.md`
- Modify: `.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json`
- Modify: `docs/reference-commands.md`
- Modify: `ROADMAP.md`
- Modify: `CHANGELOG.md`

_Requirements: R4.AC1, R4.AC4, R4.AC6_

### Task 7: Wave 4 — ADR-0003 + Update 章节

**Depends On**: ["5"]
**Files**:
- Create: `.tinkerman/decisions/ADR-0003-single-entry-command-consolidation.md`
- Modify: `.tinkerman/decisions/2026-05-12-plugin-distribution.md`

_Requirements: R4.AC2, R4.AC3_

### Task 8: Wave 4 — ADR registry 测试

**Depends On**: ["7"]
**Files**:
- Create or modify: `test/adr-registry.test.ts`

_Requirements: R4.AC5_

### Task 9: Wave 5 — 全量验证

**Depends On**: ["6", "7", "8"]

运行全部测试 + verify-count + dry-run + diagnostics。

_Requirements: 全部_
