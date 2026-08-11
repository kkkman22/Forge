---
feature: agency-borrow-01-unified-agent-source
layout: design
created: 2026-06-23
spec_ref: ".tinkerman/specs/agency-borrow-01-unified-agent-source/requirements.md"
---

# 统一 Agent 源 + 多工具 convert — 设计文档

## 概述

将 `agents/` 确立为唯一真相源,新增 `scripts/convert-agents.mjs`(派生生成器)与 `scripts/check-agent-sync.mjs`(一致性门禁)。复用 Forge 现有的 `forge-sync-runtime.mjs` / `check-bundle-sync.mjs` 范式,不引入新依赖。

## 设计决策

### D1: 源格式选型——沿用 `.md` + YAML frontmatter

- **问题**:源 agent 文件用什么格式?
- **候选**:(a) 纯 `.md` + YAML frontmatter(现状 `agents/`);(b) 结构化 `.yaml` + 独立正文;(c) agency-agents 式 `<division>/<name>.md`。
- **选择**:**a**。理由:`agents/` 现状已是此格式,零迁移成本;YAML frontmatter 可读、git diff 友好;Forge 无"division"概念(不是 catalog 库)。
- **风险**:YAML 解析需处理多行/转义。**缓解**:用 Forge 已在 `package.json` 声明的 `yaml` 包(2.8.4)而非手写正则。

### D2: 工具特定字段的承载——源 frontmatter 分区

- **问题**:`.claude/agents/` 有 `disallowed-tools`/`effort`,`.codex/agents/` 用 `developer_instructions`。源文件如何承载工具差异?
- **候选**:(a) 源放通用字段,工具特定字段放独立映射表;(b) 源 frontmatter 用命名空间分区(`claude:` / `codex:` 子对象)。
- **选择**:**b**(命名空间分区)。理由:agent 的完整定义集中一处,避免源与映射表二次漂移;某工具不支持的子字段 convert 时静默丢弃(R2.5)。
- **示例源 frontmatter**:
  ```yaml
  ---
  name: architect
  description: 架构视角评估者...
  tools: Read, Glob, Grep
  claude:
    disallowed-tools: []
    effort: xhigh
  codex:
    model: gpt-5
  ---
  ```
- **风险**:frontmatter 变复杂。**缓解**:claude/codex 子对象可选,缺省时用工具默认值。

### D3: convert 生成器的渲染契约

- **问题**:如何保证从同一源生成 `.md` 与 `.toml` 的确定性(幂等)?
- **选择**:借鉴 agency-agents 的 `format` 契约——每种工具一个 render 函数,输入(源 frontmatter + 正文)、输出(目标文件字节)。两个契约:
  - `renderClaude(src) → {path, content}`:展平 frontmatter(合并 claude 子对象到顶层),正文原样。
  - `renderCodex(src) → {path, content}`:TOML,`name`/`description` 用基本字符串转义,正文进 `developer_instructions`(对齐 `.codex/agents/architect.toml` 现状)。
- **确定性约定**:frontmatter 字段输出 SHALL 按固定 key 排序(字母序或显式优先级:name/description/tools 在前,工具子对象在后),保证源文件 key 顺序变化不产生 git diff 噪音、不触发门禁误报。
- **风险**:TOML 转义。**缓解**:复用 agency-agents `toml_escape_string` 的逻辑(已是验证过的实现),移植为 Node。

### D4: 派生目录的"禁止手编"标记

- **问题**:如何防止开发者误改 `.claude/agents/`?
- **选择**:在 `.claude/agents/README.md` 与 `.codex/agents/README.md`(或 `.generated` 哨兵文件)顶部写明 "本目录由 convert-agents.mjs 生成,勿手编,改 `agents/` 后运行生成器"。CI 门禁是最终防线。
- **理由**:标记是软约束(文档),门禁是硬约束(CI)。两者互补,对齐 agency-agents 的做法。

### D5: 一次性的"回流"迁移

- **问题**:现状三目录都有独有文件,如何收敛到唯一源?
- **选择**:迁移任务分三类处理(见 tasks.md Task 0):
  1. 仅在 `.claude/`/`.codex/` 的 11 个 `forge-*` → 以 `.claude/` 版为源回流到 `agents/`(因为 `.claude/` 版含更完整的 frontmatter)。
  2. 仅在 `agents/` 的 3 个(`adversarial-check` 等)→ 保留为源,convert 补齐到 `.claude/`/`.codex/`。
  3. 共有的(如 `architect`)→ description 统一(R4),以语义更完整者为准。
- **风险**:回流可能丢失 `.codex/` 独有的 TOML 字段。**缓解**:迁移前 diff 三版本,差异登记到迁移清单。

## 接口设计

```
scripts/convert-agents.mjs   # 生成器
  --check                    # 只校验不写(= check-agent-sync 的实现)
  --tool claude|codex|all    # 限定工具
  --verbose                  # 报告跳过的字段

scripts/check-agent-sync.mjs # 门禁(薄包装,调 convert-agents.mjs --check)
  环境变量 FORGE_SKIP_AGENT_SYNC=1 / [agent-sync-skip] 跳过
```

## 数据模型

源 agent 文件结构(收敛后):

```
agents/
├── architect.md          # 源(含 claude/codex 命名空间)
├── adversarial-check.md
├── business-analyst.md   # 从 .claude/ 回流
├── forge-build.md        # 从 .claude/ 回流
├── ... (共约 25 个,三目录并集去重;快照见 requirements 背景)
└── README.md             # "本目录是唯一源"说明

.claude/agents/           # 派生(generated)
└── README.md             # "勿手编"标记 + 生成命令

.codex/agents/            # 派生(generated)
└── README.md             # 同上
```

## 风险

| 风险 | 缓解 |
|------|------|
| 回流迁移中丢失某工具特有字段 | Task 0 迁移前做三目录 diff 登记,迁移后 `check-agent-sync` 必过 |
| description 中英统一引发语义偏差 | R4 明确以 spec-04 i18n 决策为准,本 spec 不擅自翻译 |
| convert 生成器与现有 `init.sh` 的 agent 复制逻辑冲突 | **职责不重叠,不冲突**:init.sh(L778-794)是「7 个精选 agent 子集安装到外部用户项目」,convert 是「仓库内三目录全量派生同步」。convert 只作用于仓库内,init.sh 从 `agents/`(唯一源)读取子集,两者共存(见 tasks Task 4) |
| 工具 frontmatter 字段未来新增(如 Claude Code 新增字段) | 命名空间分区(D2)使新字段只加在对应子对象,不影响其他工具 |
