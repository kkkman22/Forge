---
feature: plugin-distribution
layout: design
created: 2026-05-12
---

# Design Document: Forge Plugin Distribution

## Overview

本 spec 分两阶段：

- **Phase A（评估）**：走查 Forge 当前资产、对照 CC plugin 要求、产出 feasibility.md + go/no-go 建议。Phase A 是低风险的"文档工作"，可随时中止不影响现有用户。
- **Phase B（实施）**：仅在 Phase A 推荐 go 时进入。产出 `plugin.json` + `marketplace.json` + README 新章节 + CI 校验 + 迁移文档。

**变更范围**（仅 Phase B，Phase A 只产出文档）：
- 新增 `plugin.json`（repo 根）
- 新增 `marketplace.json`（repo 根或独立 branch）
- 新增 `commands/` 目录（若现在没有）
- 修改 `README.md`、`CHANGELOG.md`、`SECURITY.md`、`CONTRIBUTING.md`
- 修改 `scripts/build-dist.sh` 增加 plugin 打包分支
- 修改 `.github/workflows/ci.yml` 增加 `plugin validate` + install 冒烟测试
- 新增 `test/plugin-manifest.test.ts`
- 新增 ADR `.forge/decisions/<date>-plugin-distribution.md`

**关键不变**：`.forge/` 目录结构、现有 skill/agent/hook 文件、Forge Loop、18 个命令的行为。

## Architecture

### 三种分发路径的对比

```
┌─────────────────────────────────────────────────────────────┐
│                   三种分发路径并存                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Path 1: Clone (existing, Forge Loop 开发者)                  │
│    git clone → ~/.claude/skills/forge                        │
│    npm install && npx tsc                                    │
│    Pros: full source, Forge Loop                             │
│    Cons: needs Node, manual update, no versioning            │
│                                                             │
│  Path 2: Dist package (existing, 企业内网)                    │
│    build-dist.sh → dist/                                     │
│    install-dist.sh --target X                                │
│    Pros: no Node required, reproducible                      │
│    Cons: manual, no update path                              │
│                                                             │
│  Path 3: Plugin (NEW, 推荐默认)                               │
│    claude plugin marketplace add URL                         │
│    claude plugin install forge                               │
│    Pros: native update, version pinning, validate            │
│    Cons: requires CC ≥2.0.12, marketplace governance         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**共存策略**：三种路径访问的是相同的文件资产（`skills/`、`agents/`、`hooks/`、`scripts/`、`templates/`）。差别只在"如何把这些资产放到 CC 能发现的位置"。

### Plugin 层次结构

```
Forge repo root/
├── plugin.json              # NEW: plugin manifest
├── marketplace.json          # NEW: marketplace entry (or in separate branch)
├── package.json              # existing (version source of truth)
├── skills/                   # existing, referenced by plugin.json
├── agents/                   # existing, referenced
├── hooks/                    # existing
│   └── hooks.json
├── commands/                 # NEW: slash command wrappers
│   ├── forge.md
│   ├── forge-plan.md
│   └── ... (18 commands)
├── scripts/                  # existing (bin entries in plugin.json)
├── templates/                # existing
├── src/, dist/               # existing (Forge Loop; NOT part of plugin)
├── test/                     # existing + test/plugin-manifest.test.ts
└── .forge/                   # project state (NEVER in plugin distribution)
```

### 数据流：用户安装 plugin

```
User: claude plugin install forge
  │
  ▼
CC: clone <marketplace URL>
  │
  ▼
CC: read plugin.json
  │
  ▼
CC: copy referenced files (skills/, agents/, commands/, hooks/)
    → ~/.claude/plugins/forge/
  │
  ▼
CC: register /forge command, make skills discoverable
  │
  ▼
User: /forge init              # writes to project's .forge/
```

**关键分界**：plugin 安装只放 CC 能发现的"指令集"。每个项目的 `.forge/` 仍由 `/forge init` 在项目根创建，完全不受 plugin update 影响。

## Components and Interfaces

### Component 1: plugin.json

**位置**：repo 根

**最小骨架**：
```json
{
  "$schema": "https://claude.com/plugin.schema.json",
  "name": "forge",
  "version": "2.3.0",
  "description": "统一 AI 编码工作流框架 — 18 个命令覆盖完整开发生命周期",
  "author": "Forge contributors",
  "license": "MIT",
  "homepage": "https://github.com/kkkman22/Forge",
  "repository": "https://github.com/kkkman22/Forge",

  "skills": ["./skills"],
  "agents": ["./agents"],
  "commands": ["./commands"],
  "hooks": "./hooks/hooks.json",

  "keywords": ["workflow", "spec-driven", "tdd", "code-review"],

  "experimental": {},

  "scripts": {
    "postInstall": "echo '→ Forge 安装完成。运行 /forge init 初始化项目。'",
    "postUpdate": "echo '→ Forge 已更新。如遇问题，运行 /forge status 查看状态。'"
  }
}
```

**字段选择依据**：
- `skills` / `agents` / `commands` / `hooks` 使用相对路径数组，让 CC 直接从 repo 布局发现资源，无需 relocate
- `experimental: {}` 预留给未来的 `monitors`、`themes`
- `scripts.postInstall` / `postUpdate` 是非关键信息提示，不做实际副作用

### Component 2: commands/ 目录

**目的**：Plugin 的 `commands` 字段指向 `.md` 文件，每个 `.md` 是一个 slash command。Forge 当前把命令逻辑都写在 SKILL.md，需要新建一层 thin wrapper。

**示例 `commands/forge.md`**：
```markdown
---
description: "Forge 主命令，路由到相应子命令"
---

用户调用 `/forge <args>`。请调用 `forge` skill（`skills/forge/SKILL.md`）处理。
```

**示例 `commands/forge-build.md`**：
```markdown
---
description: "执行 build 阶段（TDD + Subagent）"
---

调用 `forge-build` skill。
```

**批量生成**：用一个脚本 `scripts/gen-plugin-commands.mjs` 从 `skills/*/SKILL.md` 的 frontmatter 生成对应 `commands/*.md`。纳入 CI。

### Component 3: marketplace.json

**位置**：repo 根

**内容**：
```json
{
  "$schema": "https://claude.com/marketplace.schema.json",
  "name": "forge-official",
  "description": "Forge 官方 marketplace",
  "plugins": [
    {
      "name": "forge",
      "description": "统一 AI 编码工作流框架",
      "source": {
        "type": "git",
        "url": "https://github.com/kkkman22/Forge"
      }
    }
  ]
}
```

**版本锁定**：用户通过 `claude plugin install forge@<tag>` 锁到特定 tag；marketplace.json 不硬编码 ref，让用户决定滚动或锁定。

### Component 4: 现有 dist/clone 路径的兼容

**scripts/build-dist.sh 修改**：
- 保留原有 dist 产物
- 新增 `build-dist-plugin()` 函数，产出 `dist-plugin/forge-plugin-<version>.zip`（适合企业内网分发）

**scripts/install-dist.sh**：完全不动。它装到 `~/.claude/skills/forge/`，与 plugin 装到 `~/.claude/plugins/forge/` 互不影响。

**冲突检测**：`/forge status` 或 `/doctor` 检查以下路径同时存在：
- `~/.claude/skills/forge/` (clone 或 dist)
- `~/.claude/plugins/forge/` (plugin)

同时存在时提示用户选择一个。CC 会让 plugin 优先。

### Component 5: CI 增量

**`.github/workflows/ci.yml` 新 job**：
```yaml
  plugin-validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Claude Code
        run: curl -fsSL https://claude.ai/install.sh | bash
      - name: Validate plugin manifest
        run: claude plugin validate
      - name: Install plugin locally
        run: claude plugin install . --plugin-dir .
      - name: Smoke test
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: claude -p "/forge status" || exit 1
```

**`test/plugin-manifest.test.ts`**：用 Node 的 JSON schema validator 校验 `plugin.json` 结构：
- 必需字段齐全
- 所有路径字段指向存在的文件/目录
- `version` 与 `package.json` 一致
- `commands/` 下每个 `.md` 文件都有 `description` frontmatter

## Data Models

### Plugin_Manifest schema（关键字段）

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `name` | string | 是 | 匹配 `^[a-z][a-z0-9-]{2,}$` |
| `version` | string | 是 | semver，= package.json |
| `description` | string | 是 | ≤140 字符 |
| `author` | string | 是 | |
| `license` | string | 是 | `"MIT"` |
| `skills` | string[] | 否 | 每项存在 |
| `agents` | string[] | 否 | 每项存在 |
| `commands` | string[] | 否 | 每项存在且含 `.md` |
| `hooks` | string | 否 | 存在且合法 JSON |
| `mcpServers` | object | 否 | 本 spec 默认不含 |

### Feasibility 报告结构（Phase A 产出）

```markdown
---
phase: A
status: <go|no-go|conditional-go>
recommended_at: YYYY-MM-DD
---

# Plugin Distribution Feasibility Report

## Asset Inventory
(table of every Forge asset, compatibility class)

## Layout Diff
(current vs required)

## Refactor Cost
(estimated in person-days per refactor class)

## Risk Matrix
(migration risks, rollback plan)

## Install UX Benchmark
(table: steps, time, error prone)

## Recommendation

**Decision**: go / no-go / conditional-go
**Rationale**: ...
**Blockers (if any)**: ...

## Phase B Trigger
(under what conditions Phase B starts)
```

## Error Handling

| 场景 | 行为 |
|---|---|
| `plugin.json` 格式错误 | CI `plugin validate` fail → PR block |
| `commands/` 下文件缺失 | `plugin validate` fail |
| `version` 与 `package.json` 不一致 | 本项目的自定义 contract test fail |
| 用户同时 clone + plugin 安装 | `/doctor` 警告，plugin 优先 |
| Marketplace URL 不可达 | CC 标准错误，非 Forge 责任 |
| 用户组织 `blockedMarketplaces` 命中 | 安装失败，无部分状态 |

## Testing Strategy

1. **Phase A 产出**：feasibility.md 至少 1 位 maintainer review 并 approve
2. **Phase B 进入条件**：Phase A recommendation = go 或 conditional-go
3. **Phase B 测试**：
   - `test/plugin-manifest.test.ts` unit test
   - CI 集成 `plugin validate` + install smoke test
   - 手动验证：在干净机器上 `claude plugin install forge` + 跑典型 `/forge` 命令
   - 跨平台：macOS、Linux、Windows（CC 原生 binary 已跨平台）
4. **Phase B 验收**：
   - 三种分发路径都能独立完成"从零到 `/forge status`"
   - Current_Dist_Script 未被破坏
   - 迁移指南有至少 1 位用户验证
