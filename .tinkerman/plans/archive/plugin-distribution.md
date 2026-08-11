---
topic: "plugin-distribution"
status: "approved"
date: "2026-05-12"
spec_ref: ".kiro/specs/plugin-distribution"
format: "lightweight"
---

## Objective

实现 Forge 的 CC Plugin 化分发。Phase A 产出可行性报告（feasibility.md），对照 CC Plugin 系统实际 API 校准 spec 设计中的偏差；Phase B 依据 Phase A 结论决定是否实施。

**Research 关键发现**：spec design.md 假设的结构与 CC Plugin 实际 API 有 6 处重大偏差（见下方 Research Findings），Phase A 需优先修正这些偏差。

## Research Findings

### CC Plugin 系统实际结构（2026-05-12 验证）

通过检查已安装 plugin（caveman、karpathy-skills、claude-plugins-official）和 `claude plugin --help` 确认：

1. **Manifest 位置**：`.claude-plugin/plugin.json`（非 repo 根 `plugin.json`）
2. **Marketplace 位置**：`.claude-plugin/marketplace.json`（非 repo 根）
3. **Hooks 声明**：内联在 `plugin.json` 的 `hooks` 字段中，使用 `${CLAUDE_PLUGIN_ROOT}` 变量（非引用外部 `hooks.json`）
4. **Commands 格式**：`commands/*.md`（legacy）或 `commands/*.toml`（新格式），自动发现
5. **Skills 引用**：需逐个路径如 `["./skills/forge"]`，非目录级 `["./skills"]`
6. **无 `scripts` 字段**：已安装 plugin 均无 `postInstall`/`postUpdate`

### 已安装 Plugin 参考

| Plugin | 结构 | 值得借鉴 |
|--------|------|---------|
| caveman | hooks 内联、skills 逐路径、commands 用 `.toml` | hooks 用 `${CLAUDE_PLUGIN_ROOT}` 最完整 |
| karpathy-skills | 最小结构（仅 skills） | 简单 plugin 骨架 |
| example-plugin | commands 用 `.md`（legacy） | 完整 commands + skills + agents 示例 |
| claude-plugins-official | marketplace 含 40+ plugin | marketplace.json schema 参考 |

### Forge 现有资产兼容性预判

| 资产 | 兼容性 | 备注 |
|------|--------|------|
| `skills/*/SKILL.md` | (a) 兼容 | 结构与 caveman 一致 |
| `agents/*.md` | (a) 兼容 | 结构一致 |
| `hooks/hooks.json` | (c) 需重构 | 需转为 plugin.json 内联格式 |
| `commands/forge.md` | (a) 兼容 | 已存在，需新增 18+ 个子命令 |
| `scripts/*.sh` | (a) 兼容 | 通过 hooks 引用，`${CLAUDE_PLUGIN_ROOT}` 定位 |
| `templates/` | (a) 兼容 | skills 运行时引用 |
| `src/` + `dist/` | (d) 不属于 plugin | Forge Loop 独立功能，不随 plugin 分发 |
| `.tinkerman/` | (d) 不属于 plugin | 项目级状态，不随 plugin 分发 |

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#overview` | 两阶段策略：Phase A 评估 → Phase B 条件实施 |
| `design.md#architecture` | 三种分发路径并存策略 |
| `design.md#component-1-pluginjson` | plugin.json 骨架（需修正为 `.claude-plugin/` 位置） |
| `design.md#component-2-commands` | commands/ 目录生成脚本 |
| `design.md#component-3-marketplacejson` | marketplace.json 声明（需修正位置） |
| `design.md#component-4` | 现有 dist/clone 兼容性 |
| `design.md#component-5` | CI 增量 |
| `design.md#data-models` | Plugin_Manifest schema 和 Feasibility 报告结构 |
| `design.md#testing-strategy` | Phase A/B 测试策略 |
| `design.md#error-handling` | 错误场景矩阵 |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `.kiro/specs/plugin-distribution/feasibility.md` | CREATE | Phase A 可行性报告 |
| `.claude-plugin/plugin.json` | CREATE | Plugin manifest（Phase B） |
| `.claude-plugin/marketplace.json` | CREATE | Marketplace manifest（Phase B） |
| `commands/*.md` | CREATE | 18 个子命令 wrapper（Phase B） |
| `scripts/gen-plugin-commands.mjs` | CREATE | 从 skills frontmatter 生成 commands（Phase B） |
| `test/plugin-manifest.test.ts` | CREATE | Plugin schema 校验测试（Phase B） |
| `README.md` | MODIFY | 新增方式三 Plugin 安装 + 迁移指南（Phase B） |
| `CHANGELOG.md` | MODIFY | `[ADDED]` plugin distribution（Phase B） |
| `SECURITY.md` | MODIFY | Plugin trust model（Phase B） |
| `CONTRIBUTING.md` | MODIFY | 本地 plugin 调试方法（Phase B） |
| `scripts/build-dist.sh` | MODIFY | 新增 `build-dist-plugin()`（Phase B） |
| `.github/workflows/ci.yml` | MODIFY | 新增 `plugin-validate` job（Phase B） |
| `.tinkerman/decisions/<date>-plugin-distribution.md` | CREATE | ADR（Phase B） |

## Task Breakdown

### Task 1: Phase A — 资产盘点与兼容性分类
- **Goal**: 列出所有 Forge 资产并分类 plugin 兼容性
- **File**: `.kiro/specs/plugin-distribution/feasibility.md`（Asset Inventory 章节）
- **Design Reference**: `design.md#overview` — Phase A 评估范围
- **Depends On**: (none)
- **Verify**: `grep -c "兼容性类别" feasibility.md` ≥ 1
- **Commit**: `docs(plugin): Phase A — asset inventory and compatibility classification`

### Task 2: Phase A — Layout 差异分析与 spec 设计偏差修正
- **Goal**: 对比当前布局 vs CC Plugin 实际要求，记录 spec design.md 的 6 处偏差及修正方案
- **File**: `.kiro/specs/plugin-distribution/feasibility.md`（Layout Diff 章节）
- **Design Reference**: `design.md#architecture` — Plugin 层次结构
- **Depends On**: Task 1
- **Verify**: feasibility.md 包含 6 处偏差对照表
- **Commit**: `docs(plugin): Phase A — layout diff and spec design deviation corrections`

### Task 3: Phase A — Install UX 基准对比
- **Goal**: 三种安装方式的 UX 对比表（步骤数、先决条件、更新路径、回退难度）
- **File**: `.kiro/specs/plugin-distribution/feasibility.md`（Install UX Benchmark 章节）
- **Design Reference**: `design.md#data-models` — Feasibility 报告结构
- **Depends On**: Task 2
- **Verify**: feasibility.md 包含 3 种方式的对比表
- **Commit**: `docs(plugin): Phase A — install UX benchmark comparison`

### Task 4: Phase A — 风险矩阵与 go/no-go 推荐
- **Goal**: 迁移风险、rollback 计划、go/no-go 推荐及 Phase B 触发条件
- **File**: `.kiro/specs/plugin-distribution/feasibility.md`（Risk Matrix + Recommendation 章节）
- **Design Reference**: `design.md#data-models` — Feasibility 报告结构
- **Depends On**: Task 3
- **Verify**: feasibility.md 有明确 go/no-go/conditional-go 推荐
- **Commit**: `docs(plugin): Phase A — risk matrix and go/no-go recommendation`

### Task 5: Phase B — `.claude-plugin/plugin.json` 编写
- **Goal**: 基于修正后的设计，创建 plugin manifest
- **File**: `.claude-plugin/plugin.json`
- **Design Reference**: `design.md#component-1-pluginjson` — 修正为 `.claude-plugin/` 位置
- **Property**: 需通过 `claude plugin validate`
- **Depends On**: Task 4（Phase A = go）
- **Verify**: `claude plugin validate .claude-plugin/` 通过
- **Commit**: `feat(plugin): add .claude-plugin/plugin.json manifest`

### Task 6: Phase B — commands/ 目录与生成脚本
- **Goal**: 生成 18+ 个 slash command wrapper + `gen-plugin-commands.mjs` 脚本
- **File**: `commands/*.md`, `scripts/gen-plugin-commands.mjs`
- **Design Reference**: `design.md#component-2-commands` — commands 自动发现
- **Depends On**: Task 5
- **Verify**: `ls commands/*.md | wc -l` ≥ 18
- **Commit**: `feat(plugin): generate commands/ directory with 18 slash commands`

### Task 7: Phase B — `.claude-plugin/marketplace.json`
- **Goal**: 创建 marketplace manifest 声明 Forge plugin
- **File**: `.claude-plugin/marketplace.json`
- **Design Reference**: `design.md#component-3-marketplacejson` — 修正位置
- **Depends On**: Task 5
- **Verify**: `claude plugin validate .claude-plugin/` 通过（marketplace 校验）
- **Commit**: `feat(plugin): add marketplace.json for plugin discovery`

### Task 8: Phase B — build-dist.sh 扩展与 CI 增量
- **Goal**: `build-dist.sh` 新增 plugin 打包 + CI 新增 `plugin-validate` job
- **File**: `scripts/build-dist.sh`, `.github/workflows/ci.yml`
- **Design Reference**: `design.md#component-5` — CI 增量
- **Depends On**: Task 6, Task 7
- **Verify**: `bash scripts/build-dist.sh` 产出 `dist-plugin/`
- **Commit**: `feat(plugin): extend build-dist.sh and CI with plugin packaging`

### Task 9: Phase B — 测试
- **Goal**: `test/plugin-manifest.test.ts` + contract tests
- **File**: `test/plugin-manifest.test.ts`
- **Design Reference**: `design.md#testing-strategy` — Phase B 测试
- **Depends On**: Task 5
- **Verify**: `npx vitest run test/plugin-manifest.test.ts` 通过
- **Commit**: `test(plugin): add plugin manifest schema and contract tests`

### Task 10: Phase B — 冲突检测
- **Goal**: 更新 `/forge status` 检测 clone + plugin 同时安装
- **File**: `skills/forge-status/SKILL.md`
- **Design Reference**: `design.md#component-4` — 冲突检测
- **Depends On**: Task 5
- **Verify**: `/forge status` 在同时安装时输出警告
- **Commit**: `feat(plugin): add clone+plugin conflict detection to /forge status`

### Task 11: Phase B — 文档与迁移指南
- **Goal**: README/CHANGELOG/SECURITY/CONTRIBUTING 更新
- **File**: `README.md`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`
- **Design Reference**: `design.md#error-handling` — 文档更新
- **Depends On**: Task 6, Task 7
- **Verify**: README 包含"方式三"和"迁移指南"
- **Commit**: `docs(plugin): add plugin installation method and migration guide`

### Task 12: Phase B — ADR 与归档
- **Goal**: 记录 plugin distribution 决策的 ADR
- **File**: `.tinkerman/decisions/2026-05-12-plugin-distribution.md`
- **Design Reference**: `design.md#overview` — Phase B 归档
- **Depends On**: Task 11
- **Verify**: ADR 文件存在且含 Phase A 结论
- **Commit**: `docs(plugin): add ADR for plugin distribution decision`

### Task 13: Phase B — 可选 MCP bundle（条件）
- **Goal**: 若 Phase A 推荐包含 MCP bundle，创建 `forge-mcp-bundle/`
- **File**: `plugins/forge-mcp-bundle/`（条件创建）
- **Design Reference**: `design.md#component-5` — MCP 可选
- **Depends On**: Task 4（Phase A 推荐 = 包含 MCP）
- **Verify**: 跳过或 MCP bundle 通过 `claude plugin validate`
- **Commit**: `feat(plugin): add optional MCP bundle plugin`（或跳过）

### Task 14: 发布与观察期
- **Goal**: 发布 plugin 正式版 + 观察 2 周反馈
- **File**: (无新文件，CI/发布操作)
- **Design Reference**: `design.md#testing-strategy` — Phase B 验收
- **Depends On**: Task 12
- **Verify**: `claude plugin install forge` 在干净环境可用
- **Commit**: `release(plugin): v2.4.0 with plugin distribution`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| R1: Phase A 可行性评估 | Task 1, 2, 3, 4 |
| R2: Phase B Plugin_Package 基础布局 | Task 5, 6 |
| R3: Phase B Marketplace 分发入口 | Task 7 |
| R4: Phase B 兼容性与双分发期 | Task 8, 10, 11 |
| R5: Phase B Plugin 更新与版本管理 | Task 5 (version sync), Task 9 (contract test) |
| R6: Phase B MCP server 集成（可选） | Task 13 |
| R7: Phase B CI 与测试 | Task 8, 9 |
| R8: Phase B 文档与迁移指南 | Task 11, 12 |
