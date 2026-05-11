---
phase: A
status: conditional-go
recommended_at: 2026-05-12
---

# Plugin Distribution Feasibility Report

## Asset Inventory

### Skills (29 directories)

| Asset | Path | Class | Reason |
|-------|------|-------|--------|
| forge-abort | skills/forge-abort/ | (a) | Standard SKILL.md structure, plugin-compatible |
| forge-accept | skills/forge-accept/ | (a) | Standard |
| forge-build | skills/forge-build/ | (a) | Standard |
| forge-build-light | skills/forge-build-light/ | (a) | Standard |
| forge-control-cli | skills/forge-control-cli/ | (a) | Standard |
| forge-control-ui | skills/forge-control-ui/ | (a) | Standard |
| forge-debug | skills/forge-debug/ | (a) | Standard |
| forge-decide | skills/forge-decide/ | (a) | Standard |
| forge-fix | skills/forge-fix/ | (a) | Standard |
| forge-fix-conflicts | skills/forge-fix-conflicts/ | (a) | Standard |
| forge-grill | skills/forge-grill/ | (a) | Standard |
| forge-learn | skills/forge-learn/ | (a) | Standard |
| forge-loop | skills/forge-loop/ | (a) | Standard |
| forge-mutate | skills/forge-mutate/ | (a) | Standard |
| forge-pack | skills/forge-pack/ | (a) | Standard |
| forge-plan | skills/forge-plan/ | (a) | Standard |
| forge-recap | skills/forge-recap/ | (a) | Standard |
| forge-refactor | skills/forge-refactor/ | (a) | Standard |
| forge-resume | skills/forge-resume/ | (a) | Standard |
| forge-review | skills/forge-review/ | (a) | Standard |
| forge-router | skills/forge-router/ | (a) | Standard |
| forge-ship | skills/forge-ship/ | (a) | Standard |
| forge-spec | skills/forge-spec/ | (a) | Standard |
| forge-status | skills/forge-status/ | (a) | Standard |
| forge-storm | skills/forge-storm/ | (a) | Standard |
| forge-test | skills/forge-test/ | (a) | Standard |
| forge-verify | skills/forge-verify/ | (a) | Standard |
| forge-zoom-out | skills/forge-zoom-out/ | (a) | Standard |
| shared | skills/shared/ | (a) | Referenced by other skills, plugin-compatible |

**Count**: 29 skills, all class (a). Skills directory directly usable in plugin.

### Agents (11 files)

| Asset | Path | Class | Reason |
|-------|------|-------|--------|
| architect | agents/architect.md | (a) | Standard frontmatter, plugin-compatible |
| critic | agents/critic.md | (a) | Standard |
| debugger | agents/debugger.md | (a) | Standard |
| designer | agents/designer.md | (a) | Standard |
| explore | agents/explore.md | (a) | Standard |
| frontend-check | agents/frontend-check.md | (a) | Standard |
| product | agents/product.md | (a) | Standard |
| quality-check | agents/quality-check.md | (a) | Standard |
| security | agents/security.md | (a) | Standard |
| security-check | agents/security-check.md | (a) | Standard |
| spec-check | agents/spec-check.md | (a) | Standard |

**Count**: 11 agents, all class (a).

### Hooks (hooks/hooks.json)

| Asset | Path | Class | Reason |
|-------|------|-------|--------|
| hooks.json | hooks/hooks.json | (c) | 44 commands, 15 use `forge/` prefix, 7 use `~/.claude/skills/forge` hardcoded, 0 use `${CLAUDE_PLUGIN_ROOT}`. Substantial path migration required. |

**Detail**: Hook commands use dual-path fallback pattern:
```
bash forge/scripts/X.sh 2>/dev/null || bash ~/.claude/skills/forge/scripts/X.sh 2>/dev/null || true
```
This pattern works for clone installs (first path matches project-local `forge/`, second matches `~/.claude/skills/forge/`). For plugin context, both paths are wrong — must use `${CLAUDE_PLUGIN_ROOT}/scripts/X.sh`.

**Count**: 1 file, class (c). ~15 hook commands need `${CLAUDE_PLUGIN_ROOT}` path conversion.

### Commands

| Asset | Path | Class | Reason |
|-------|------|-------|--------|
| forge.md | commands/forge.md | (a) | Existing command, plugin-compatible |

**Count**: 1 command exists. Need 18+ additional commands for plugin completeness.

### Scripts (40 files)

| Asset | Path | Class | Reason |
|-------|------|-------|--------|
| auto-resume.sh | scripts/auto-resume.sh | (b) | Referenced by hooks, needs `${CLAUDE_PLUGIN_ROOT}` |
| build-dist.sh | scripts/build-dist.sh | (d) | Build-time tool, not runtime plugin asset |
| check-context-boundary.mjs | scripts/check-context-boundary.mjs | (b) | Referenced by hooks |
| check-dist-sync.mjs | scripts/check-dist-sync.mjs | (d) | Build-time tool |
| check-frozen.sh | scripts/check-frozen.sh | (b) | Referenced by hooks |
| check-iron-laws.sh | scripts/check-iron-laws.sh | (b) | Referenced by hooks |
| hook-check-frozen.sh | scripts/hook-check-frozen.sh | (b) | Referenced by hooks |
| inject-plan-context.mjs | scripts/inject-plan-context.mjs | (b) | Referenced by hooks |
| persistent-loop.sh | scripts/persistent-loop.sh | (b) | Referenced by hooks |
| init.sh | scripts/init.sh | (b) | Called by /forge init |
| dist-resync.sh | scripts/dist-resync.sh | (d) | Build-time tool |
| validate-*.sh/mjs | scripts/validate-*.sh/mjs | (d) | Build-time/CI tools |
| rebuild-feature-dossier.mjs | scripts/rebuild-feature-dossier.mjs | (b) | Called by hooks |
| record-evolved-rule-violation.mjs | scripts/record-evolved-rule-violation.mjs | (b) | Called by hooks |
| check-evolution-marker-zones.mjs | scripts/check-evolution-marker-zones.mjs | (b) | Called by hooks |
| cmux-mirror/ | scripts/cmux-mirror/ | (b) | Called by hooks |

**Count**: ~10 runtime scripts (class b), ~10 build/CI scripts (class d).

### Templates (13 files)

| Asset | Path | Class | Reason |
|-------|------|-------|--------|
| All templates | templates/* | (a) | Static files referenced by /forge init, plugin-compatible |

**Count**: 13 templates, all class (a).

### Locales (2 files)

| Asset | Path | Class | Reason |
|-------|------|-------|--------|
| en.json | locales/en.json | (a) | Standard i18n |
| zh.json | locales/zh.json | (a) | Standard i18n |

### Project-Level Assets (NOT part of plugin)

| Asset | Path | Class | Reason |
|-------|------|-------|--------|
| src/ | src/ | (d) | Forge Loop engine source — not needed for /forge commands |
| dist/ | dist/ | (d) | Build output for Forge Loop |
| .forge/ | (per-project) | (d) | Project state directory, always local |
| .github/ | .github/ | (d) | CI/issue templates |
| cmux-skills/ | cmux-skills/ | (d) | Optional cmux integration |
| package.json | package.json | (d) | Node.js project config |
| README.md | README.md | (d) | Repo documentation |
| CHANGELOG.md | CHANGELOG.md | (d) | Repo changelog |
| SECURITY.md | SECURITY.md | (d) | Repo security policy |
| CONTRIBUTING.md | CONTRIBUTING.md | (d) | Repo contributing guide |
| CLAUDE.md | CLAUDE.md | (d) | Project-level CC instructions |

### Inventory Summary

| Class | Count | Description |
|-------|-------|-------------|
| (a) Compatible as-is | ~56 | Skills, agents, templates, locales, commands |
| (b) Minor path adaptation | ~12 | Runtime scripts referenced by hooks |
| (c) Substantial refactor | 1 | hooks.json (15 command paths) |
| (d) Not part of plugin | ~20 | Source, build tools, CI, docs |

## Layout Diff

### Spec Design.md 偏差修正

Spec design.md 编写时基于对 CC Plugin API 的假设。实际验证发现 6 处重大偏差：

| # | Spec 假设 | CC Plugin 实际 | 影响 | 修正方案 |
|---|----------|---------------|------|---------|
| 1 | `plugin.json` 在 repo 根 | `.claude-plugin/plugin.json` | 新增 `.claude-plugin/` 目录 | 将 plugin.json 放入 `.claude-plugin/` |
| 2 | `marketplace.json` 在 repo 根 | `.claude-plugin/marketplace.json` | 同上 | 同上 |
| 3 | `hooks` 引用外部 `hooks.json` | Hooks 内联在 `plugin.json` 的 `hooks` 字段 | 重构 hooks 声明方式 | 将 hooks.json 内容转为 plugin.json 内联 |
| 4 | `scripts.postInstall/postUpdate` | 无此字段（已安装 plugin 均未使用） | 去除依赖此字段的逻辑 | 改用 hooks SessionStart 提示 |
| 5 | `skills: ["./skills"]` 目录级引用 | 需逐个路径 `["./skills/forge", "./skills/forge-plan", ...]` | plugin.json skills 字段需枚举 | 生成脚本自动枚举 |
| 6 | `commands/*.md` 格式 | `.md` 和 `.toml` 均支持，CC 自动发现 | 无偏差 | 保持 .md 格式即可 |

**实际 CC Plugin 结构（基于 caveman、example-plugin 验证）**：

```
repo-root/
├── .claude-plugin/
│   ├── plugin.json          # Plugin manifest
│   └── marketplace.json     # Marketplace entry
├── skills/
│   └── <name>/SKILL.md      # 自动发现
├── agents/
│   └── <name>.md            # 自动发现
├── commands/
│   └── <name>.md            # 自动发现（slash commands）
├── scripts/                 # hooks 引用，${CLAUDE_PLUGIN_ROOT}/scripts/...
└── templates/               # skills 运行时引用
```

### `src/` 分析

`src/` 包含 Forge Loop 引擎（73 个 .ts 文件）。Forge Loop 需要 `@anthropic-ai/claude-agent-sdk` 和 Node.js >=20，是独立于 `/forge` 命令的高级功能。

**结论**：`src/` 和 `dist/` **不适合**放进 plugin。Plugin 只分发 skills/agents/hooks/commands/scripts/templates。Forge Loop 用户仍需 clone 安装。

### `.forge/` 与 Plugin 关系

`.forge/` 是项目级状态目录，由 `/forge init` 在项目根创建。它：
- 不随 plugin 分发
- 不受 plugin update 影响
- 与 plugin 安装位置（`~/.claude/plugins/forge/`）完全独立

**结论**：无冲突，设计正确。

## Install UX Benchmark

### 方式一：Clone 安装

| 维度 | 值 |
|------|-----|
| 命令数 | 3（`git clone` + `cd` + `npm install && npx tsc`） |
| 先决条件 | git, Node.js >=20, npm |
| 安装耗时 | ~2-5 分钟（含 npm install） |
| 更新方式 | `git pull && npm install && npx tsc`（手动） |
| 卸载清理 | `rm -rf ~/.claude/skills/forge`（手动） |
| 版本锁定 | 无（始终 main） |
| 适用场景 | Forge Loop 开发者、需要修改 Forge 源码 |

### 方式二：Dist 包安装

| 维度 | 值 |
|------|-----|
| 命令数 | 4（`git clone` + `bash build-dist.sh` + `bash install-dist.sh` + `rm -rf /tmp/forge`） |
| 先决条件 | git, bash |
| 安装耗时 | ~1-2 分钟 |
| 更新方式 | 重新执行全部步骤（手动） |
| 卸载清理 | `rm -rf ~/.claude/skills/forge`（手动） |
| 版本锁定 | 无 |
| 适用场景 | 企业内网、无 Node.js 环境、统一部署 |

### 方式三：Plugin 安装（新）

| 维度 | 值 |
|------|-----|
| 命令数 | 2（`claude plugin marketplace add <url>` + `claude plugin install forge`） |
| 先决条件 | Claude Code >=2.0.12 |
| 安装耗时 | ~30 秒 |
| 更新方式 | `claude plugin update forge`（原生） |
| 卸载清理 | `claude plugin uninstall forge`（原生，干净） |
| 版本锁定 | 支持（`forge@v2.3.0`） |
| 适用场景 | 所有新用户（推荐默认） |

### 对比总结

| 维度 | Clone | Dist | Plugin |
|------|-------|------|--------|
| 步骤数 | 3 | 4 | **2** |
| 先决条件 | git + Node | git + bash | **CC only** |
| 耗时 | 2-5 min | 1-2 min | **30s** |
| 自动更新 | 无 | 无 | **有** |
| 版本锁定 | 无 | 无 | **有** |
| 企业内网 | 可行 | **最佳** | 需内网 marketplace |

**结论**：Plugin 安装 UX 在所有维度（除企业内网外）优于现有方式。

## Risk Matrix

### 迁移风险

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| hooks 路径转换不完整导致部分 hook 失效 | 中 | 高 — 冻结区保护失效 | 逐条验证每个 hook command 在 plugin context 下可执行 |
| `forge/` 前缀路径残留 | 中 | 中 — 部分 hook 静默失败（`2>/dev/null`） | grep 全仓库扫描 `forge/` 和 `~/.claude/skills/forge` 残留 |
| clone + plugin 同时安装冲突 | 低 | 中 — 路径优先级混乱 | `/forge status` 冲突检测 + 明确提示 |
| skills 引用 scripts/ 时路径错误 | 低 | 高 — /forge init 等关键命令失效 | 集成测试验证 plugin install 后核心命令可用 |
| CC Plugin API 未来 breaking change | 低 | 中 — 需重新适配 | marketplace.json + plugin.json 版本锁定 |
| 用户误以为 plugin 包含 Forge Loop | 中 | 低 — 功能期望不符 | README 明确说明 plugin 不含 Forge Loop |

### Rollback 计划

1. **Plugin 安装失败**：`claude plugin uninstall forge` → 回到 clone/dist 安装
2. **Plugin 发布后发现问题**：`claude plugin update forge` 回滚到上一版本
3. **决定放弃 Plugin**：删除 `.claude-plugin/` 目录 + 还原 README 即可
4. **同时保留三种方式**：Plugin 推荐但非强制，现有方式持续可用

## Recommendation

**Decision**: **conditional-go**

**Rationale**:

1. **高度可行**：56/89 个资产（63%）已兼容，12 个仅需路径前缀替换
2. **UX 提升显著**：安装步骤从 3-4 步降至 2 步，自动更新、版本锁定
3. **风险可控**：hooks 路径转换是最复杂的单一变更，但范围明确（~15 个 command 字段）
4. **向后兼容**：三种方式并存，不强制迁移

**Conditions for Phase B**:

1. hooks 路径转换必须使用 `${CLAUDE_PLUGIN_ROOT}` 逐条替换，保留 `2>/dev/null || true` 兜底
2. 必须有集成测试验证 `claude plugin install . --plugin-dir .` 后核心命令可用
3. Phase B 首先完成 `.claude-plugin/plugin.json` + commands/ 生成，通过 `claude plugin validate` 后再推进后续 task

**Blockers**: 无不可解阻断项。

**Refactor Cost Estimate**:
- hooks 路径转换：1-2 小时
- commands/ 生成：1-2 小时
- plugin.json + marketplace.json：30 分钟
- 测试：2-3 小时
- 文档更新：1 小时
- **Total**: ~6-9 小时（1 个工作日）

## Phase B Trigger

Phase B 启动条件（全部满足）：
- [x] Phase A recommendation = conditional-go
- [x] 无不可解阻断项
- [x] Refactor cost < 1 人天

**进入 Phase B**。
