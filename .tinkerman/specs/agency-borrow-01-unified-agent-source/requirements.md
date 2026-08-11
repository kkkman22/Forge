---
status: draft
feature: agency-borrow-01-unified-agent-source
layout: requirements
created: 2026-06-23
tier: standard
---

# 统一 Agent 源 + 多工具 convert — 需求文档

## 背景

调研 [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) 后识别的第一个借鉴点(详见调研报告 §二.1)。

**Forge 当前的痛点(已验证的漂移)**:同一批 agent 被手工维护在三处。

> **数字快照(2026-06-23)**:本 spec 写作时实测 `agents/` 13 个、`.claude/agents/` 22 个(含 1 个 README.md,即 21 个 agent)、`.codex/agents/` 20 个;三目录并集去重约 25 个。agent 总数会随演进变化,实现时以实际为准,本节数字仅作漂移论证。

| 目录 | 文件数(快照) | 格式 | 示例 description |
|------|--------|------|------------------|
| `agents/` | 13 | `.md`(中文,角色式) | `架构视角评估者。在 /forge decide...` |
| `.claude/agents/` | 21 agent(+1 README) | `.md`(英文,触发式) | `Use when evaluating technology choices...` |
| `.codex/agents/` | 20 | `.toml` | `Use when evaluating technology choices...` |

三处差集已确认漂移:
- `adversarial-check` / `frontend-check` / `validation-pass` **仅存在于 `agents/`**,`.claude/agents/` 与 `.codex/agents/` 缺失。
- `forge-decide-*` / `forge-build` / `forge-plan` / `forge-review` / `forge-ship` / `business-analyst` 等 **仅存在于 `.claude/agents/` 与 `.codex/agents/`**,`agents/` 缺失。
- 共有的 `architect` 的 `description` 在 `agents/` 是**角色描述**(架构视角评估者...),在 `.claude/agents/` 是**触发条件描述**(Use when evaluating...)——这是两个信息维度,统一时需合并而非单选(见 R1.5)。

Forge 已有 `forge-sync-runtime.mjs`(同步 hook shim)和 `check-bundle-sync.mjs`(同步 dist),但 **agent 层缺同类机制**——这正是 agency-agents 用"单一源 + convert.sh"彻底解决的问题。

## 目标

1. 建立 agent 定义的**唯一真相源**,消除三目录手工维护的漂移。
2. 提供自动化的 convert 生成器,从唯一源派生出各工具格式(`.md` / `.toml`)。
3. 提供同步校验门禁,CI 在三目录不一致时阻断(对齐 §2.2 分支隔离门禁、§2.3 验证铁律)。

## 术语

- **Agent 源(source of truth)**:agent 定义的权威文件,所有其他格式由它派生。
- **convert**:从源文件生成特定工具格式(如 `.claude/agents/*.md`、`.codex/agents/*.toml`)的过程。
- **派生目录(derived)**:由 convert 生成的目录,不应手工编辑。
- **漂移(drift)**:派生目录内容与源不一致的状态。

## 需求

### Requirement 1: 唯一真相源

**User Story:** 作为 Forge 维护者,我希望 agent 定义只有一个权威源,以消除三目录手工维护的漂移。

#### 验收标准

1. THE `agents/` 目录 SHALL 成为 agent 定义的唯一真相源,所有 agent 的 `name` / `description` / 指令正文 SHALL 以此处为准。
2. THE `.claude/agents/` 与 `.codex/agents/` SHALL 被标记为派生目录(通过 `.generated` 标记文件或 README 说明,禁止手工编辑)。
3. THE 当前漂移的三个 agent(`adversarial-check` / `frontend-check` / `validation-pass`)SHALL 回流到 `.claude/agents/` 与 `.codex/agents/`。
4. THE 当前仅在 `.claude/agents/` 的 11 个 `forge-*` agent SHALL 回流到 `agents/` 作为源。
5. THE `architect` 等共有 agent 的 description SHALL 统一,且**合并两个信息维度**:角色描述(是什么)与触发条件(何时用)都需保留,不得单选丢失(见背景表注)。语言(中文/英文)遵循 R4 的 i18n 决策。
6. THE 派生目录中已有的 `README.md`(如 `.claude/agents/README.md`)SHALL 被视为 convert 生成物或显式保留物——convert SHALL NOT 覆盖非 agent 的既有 README,除非该 README 本身声明为生成物。

### Requirement 2: Convert 生成器

**User Story:** 作为 Forge 维护者,我希望运行一条命令即可从源重新生成所有工具格式,而非手工同步三处。

#### 验收标准

1. THE Forge SHALL 提供 `scripts/convert-agents.mjs`,从 `agents/*.md` 生成 `.claude/agents/*.md` 与 `.codex/agents/*.toml`。
2. THE 生成器 SHALL 复用现有 `forge-sync-runtime.mjs` / `check-bundle-sync.mjs` 的设计范式(纯 Node、无外部依赖、幂等可重跑)。
3. THE 生成器 SHALL 保留各工具特定的 frontmatter 字段(如 `.claude/agents/` 的 `disallowed-tools`、`effort`、`initialPrompt`,见已落地的 `agent-frontmatter-hardening` spec)。
4. THE 生成器 SHALL 支持工具特定的渲染差异(如 `.codex` 用 `developer_instructions` 字段、`name` 用 TOML 基本字符串转义)。
5. WHEN 源 agent 的 frontmatter 含工具不支持的字段,THE 生成器 SHALL 静默跳过并在 `--verbose` 时报告。

### Requirement 3: 同步校验门禁

**User Story:** 作为 Forge 维护者,我希望 CI 在派生目录与源不一致时阻断合并,以防止漂移再次发生。

#### 验收标准

1. THE Forge SHALL 提供 `scripts/check-agent-sync.mjs`,校验 `agents/` → `.claude/agents/` + `.codex/agents/` 的派生一致性。
2. THE 校验 SHALL 对齐 `check-bundle-sync.mjs` 的模式:支持 `FORGE_SKIP_AGENT_SYNC=1` 跳过、`[agent-sync-skip]` commit message 跳过。
3. THE 校验 SHALL 在 `npm run check` 与 pre-push hook(`scripts/pre-push-ci-check.sh`)中执行。
4. WHEN 派生目录与源不一致,THE 校验 SHALL 退出码 1 并输出差异文件清单与修复命令(`node scripts/convert-agents.mjs`)。
5. THE 此门禁 SHALL 借鉴 §2.2 "分支隔离门禁"的思想——派生目录漂移即阻断(注:§2.2 原文指工作树不干净阻断,本 spec 是类比应用,非 §2.2 字面涵盖)。

### Requirement 4: description 语言策略(依赖 i18n 决策)

**User Story:** 作为 Forge 维护者,我希望明确 agent description 的源语言策略,消除当前中英文混杂。

#### 验收标准

1. THE `agents/` 源文件的 `description` SHALL 采用统一语言策略(具体见 spec `agency-borrow-04-i18n-governance` 的决策结论)。
2. THE convert 生成器 SHALL 不做翻译——派生目录的 description 与源同语言,除非未来显式引入翻译层(本 spec 非目标)。

## 验收标准(整体)

- [ ] `agents/`、`.claude/agents/`、`.codex/agents/` 三目录文件集合完全一致(无仅存于一处的 agent)。
- [ ] `node scripts/convert-agents.mjs` 幂等:连续运行两次,`git status` 无变化。
- [ ] `node scripts/check-agent-sync.mjs` 在干净状态退出 0,人为改动派生目录后退出 1。
- [ ] `npm run check` 包含 agent-sync 校验。
- [ ] 现有 `npm test` 全部通过(回归)。

## 依赖

- spec `agency-borrow-04-i18n-governance`:R4 的 description 语言策略需其结论。
- 已落地 spec `agent-frontmatter-hardening`:其 frontmatter 字段(`disallowed-tools`/`effort`/`memory`/`initialPrompt`)必须被 convert 生成器保留。

## 非目标

- **不**引入对 agency-agents 的 13 种工具全量支持。本 spec 只覆盖 Forge 实际使用的两种(`.claude` / `.codex`),其他工具(Gemini/Cursor/Copilot 等)超出范围。
- **不**实现 description 的自动翻译。语言统一靠源文件一次性规范化,见 R4。
- **不**改变 agent 的指令逻辑,仅做载体格式统一。
- **不**引入 agent 的 `color`/`emoji`/`vibe` 等装饰字段(那是 spec `agency-borrow-03-agent-persona-template` 的范围)。
