---
id: "ADR-0010"
title: "Rename Forge → Tinkerman（补锅匠）— Name Aligns with Subtraction Positioning"
status: accepted
date: "2026-08-11"
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0009"
---

# ADR-0010: Rename Forge → Tinkerman（补锅匠）

## Context

ADR-0009 把项目定位从「Unified AI coding **workflow framework**」重塑为「**外部刹车 + 评审 + 组织记忆便携包**」——给 AI 补它做不到的漏洞、装它自己立不了的规矩。

「**Forge**」（熔炉 / 铁匠铺）这个名字暗示「打造框架 / 造一个大家伙」，恰恰是 ADR-0009 要剥离的「全流程框架」定位。名字与方向对冲。

**Tinkerman（补锅匠）**——Claudio Ranieri 的外号——字面即新定位的职责：

- 补锅匠不负责锅多华丽，负责**不漏**。对应文章框架那句「方法论决定你不会掉到多低」。
- 给 AI 这口锅补漏洞（prompt-injection / 未验证就声明完成 / 改冻结分支 / destructive 操作）、装刹车（Three-Strike / Verification 铁律 / P0P1 ship 阻断）——字面就是 ADR-0009 Existence Test 的四类外部性。
- 普通英文名词，自解释，不需要足球背景。

中文「补锅匠」民间偶有「修修补补」微贬，但创客 / 工匠语境正面；英文 **Tinkerman** 作为项目名无此负担。英文项目名用 `Tinkerman`，中文场合可辅以「补锅匠」或直接用英文。

## Decision

**改名：`Forge` → `Tinkerman`。** 覆盖包名、plugin 名、CLI、slash 命令、目录、MCP、环境变量、GitHub repo、文档。

本 ADR **只决策改名与范围**，**不执行**——执行单开 spec，分批迁移，每批验证（涉及外部契约，不能顺手改）。

### 命名映射表

| 维度 | 现（Forge） | 迁移后（Tinkerman） | 风险 |
|------|-------------|---------------------|------|
| npm 包名 | `forge-loop` | `tinkerman`（或 `tinkerman-loop`，spec 定） | 低 |
| plugin name | `forge` | `tinkerman` | 中（marketplace） |
| slash 命令 | `/forge` | `/tinkerman`（`/tink` 短形 alias 可选） | 中（用户肌肉记忆） |
| 状态目录 | `.forge/` | `.tinkerman/` | **高**（所有 spec/progress/decisions/knowledge 路径 + scripts 硬编码） |
| MCP server | `forge-context` | `tinkerman-context` | 低（bundle 重命名） |
| scripts 前缀 | `forge-*`（hook-dispatch / phase-worker / prompt-guard / read-injection-scanner / sync-runtime） | `tinkerman-*` | 中（hooks.json 注册路径） |
| 环境变量 | `FORGE_*` | `TINKERMAN_*` | 低 |
| GitHub repo | `kkkman22/Forge` | `kkkman22/Tinkerman` | 中（GitHub rename 自动重定向，但旧引用需更新） |
| 文档 / AGENTS.md / CLAUDE.md | 全文 `Forge` | `Tinkerman` | 低（量大但机械） |
| `plugin.json` description | "Unified AI coding workflow framework ... 38 internal subcommands" | 配合 ADR-0009 改为反映「刹车 + 评审 + 记忆」 | — |

## 迁移策略（原则，执行细节留 spec）

1. **`.forge/` → `.tinkerman/` 是最大风险点**。建议：迁移脚本（读旧路径写新路径 + 校验）+ **兼容期**（双路径读取，旧 `.forge/` 软链或 fallback），N 个版本后移除兼容。`init.sh` / 所有读 `.forge/` 的 scripts 须同步。
2. **`/forge` → `/tinkerman` 命令**：保留 `/forge` alias 一个版本（路由到同一 dispatcher），降低用户肌肉记忆成本。
3. **已安装 plugin 用户**：marketplace 上架 `tinkerman`，`forge` 标 deprecated 指向新名；旧 plugin 至少一个版本内提示迁移。
4. **GitHub repo rename**：GitHub 自动为旧 URL 设重定向，但 README / docs / 外部引用（文章 / 分享）需更新。
5. **分批执行**：包名 + plugin 元数据 → 命令 + scripts → 目录迁移（`.forge/`）→ 文档全文 → marketplace / repo。每批 `pre-push-ci-check.sh` + `check-dist-sync` 验证。

## Consequences

### Positive

- 名字即定位——`Tinkerman` 字面传达「补漏洞、装刹车」，与 ADR-0009 Existence Test 四类外部性一致
- 摆脱「框架 / 熔炉」的暗示，不再与「模型变强、项目变小」的方向对冲
- 自解释，降低对外说明成本（无需先解释"为什么叫 Forge"）
- 与文章「方法论决定下限」框架形成命名级呼应

### Negative

- 全仓库改动量大（机械但繁重）：`forge`/`Forge` 出现估计上千处
- 外部契约迁移成本：marketplace 旧用户、GitHub repo、已分发 dist、外部文档 / 分享链接
- `.forge/` → `.tinkerman/` 若处理不当，破坏既有 spec / progress / decisions / knowledge 的连续性（组织记忆丢失 = 违反 ADR-0009 保留项 #4）
- 短期搜索 / 引用混乱：过渡期 `forge` 与 `tinkerman` 并存
