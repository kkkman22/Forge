---
status: draft
feature: agency-borrow-02-catalog-governance
layout: requirements
created: 2026-06-23
tier: standard
---

# Catalog 治理四件套 — 需求文档

## 背景

调研 [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) 后识别的第二个借鉴点(详见调研报告 §二.2)。

agency-agents 用 4 个脚本把 catalog 一致性钉死,**堪称 catalog 治理的工程化范本**:

| agency-agents 脚本 | 作用 | Forge 对应缺口 |
|-------------------|------|----------------|
| `check-divisions.sh` | 真相源 `divisions.json` 校验磁盘/各脚本数组/CI 全一致 | Forge 的 agent 分类无统一注册 |
| `check-tools.sh` | 工具渲染契约校验 | Forge 多工具分发无契约 |
| `lint-agents.sh` | 强制 frontmatter + 推荐 section + 拒 CRLF + 内容下限 | Forge 的 `agents/*.md` 无 lint |
| `check-agent-originality.sh` | **8-gram shingle + Jaccard 查重**,实体中性化查"换皮" | Forge 无此能力,review/decide agent 易语义重叠 |

**Forge 的痛点**:review 三层(spec-check/quality-check/security-check)和 decide 团队(architect/product/security)的 agent 定义容易语义重叠却无机制检测;agent frontmatter 字段无强制校验;`.forge/specs`、`.forge/features`、`.forge/plans` 等"目录即分类"的隐式约定缺真相源校验。

## 目标

1. 引入 agent 查重门禁,防止语义重叠的"换皮" agent 进入库。
2. 引入 agent lint,强制 frontmatter 字段与内容下限。
3. 引入 catalog 分类真相源校验(可选,适用于未来 agent 分组需求)。
4. 与 spec #1(`unified-agent-source`)的 `check-agent-sync` 协同,形成完整的 agent 质量门禁链。

## 术语

- **catalog**:Forge 的 agent 集合及其分类(当前扁平,未来可能分组)。
- **shingle**:文本的 n-gram 重叠片段,用于查重的单位。
- **Jaccard 相似度**:两集合交集/并集,衡量文本重叠度。
- **实体中性化(entity-neutralized)**:查重前把专有名词(如 agent 名、工具名)替换为占位符,防"换名不换内容"绕过。

## 需求

### Requirement 1: Agent 查重门禁(check-agent-originality)

**User Story:** 作为 Forge 维护者,我希望新增 agent 时自动检测它与现有 agent 的语义重叠,防止"又一个长得像 quality-check 的 agent"。

#### 验收标准

1. THE Forge SHALL 提供 `scripts/check-agent-originality.mjs`,移植 agency-agents 的 8-gram shingle + Jaccard 算法。
2. THE 查重 SHALL 在比对前做实体中性化(至少覆盖:agent 自身的 `name`、其他 agent 的 `name`、常见工具名如 `Read/Grep/Bash`)。
3. THE 默认阈值 SHALL 为 WARN≥20% / FAIL≥40%(对齐 agency-agents 校准;其 184-agent 库基线中位数 0%、最差 1.5%)。
4. THE 阈值 SHALL 可经环境变量 `ORIGINALITY_FAIL` / `ORIGINALITY_WARN` 覆盖。
5. THE 查重 SHALL 在 CI(对 PR 改动的 agent 文件)与本地(全库审计模式)两种模式运行。
6. WHEN 某 agent 与现有库最高相似度 ≥ FAIL 阈值,THE 脚本 SHALL 退出 1 并输出最相似 agent 名与相似度。

### Requirement 2: Agent lint(lint-agents)

**User Story:** 作为 Forge 维护者,我希望所有源 agent 满足 frontmatter 与内容质量的最低标准。

#### 验收标准

1. THE Forge SHALL 提供 `scripts/lint-agents.mjs`,校验 `agents/*.md`(spec #1 确立的唯一源)。
2. THE lint SHALL 强制(ERROR)frontmatter 含 `name` / `description` 字段。
3. THE lint SHALL 推荐(WARN)正文含 `Identity` / `Mission` / `Critical Rules` section。**单向依赖**:这些 section 名以 spec #3(`agent-persona-template`)的 `templates/AGENT-TEMPLATE.md` 为权威定义,lint 从该模板动态读取 section 名,而非硬编码——确保单向 #3→#2(模板先定义,lint 后校验),无循环。
4. THE lint SHALL 拒绝(ERROR)CRLF 行结尾。注:Forge 当前**无**显式 LF 约定配置(`.gitattributes`/`.editorconfig`/biome `endOfLine` 均不存在),agent 文件实测为 LF;本 lint 的 CRLF 检测**自身就是 LF 约定的承载者**,而非"对齐某既有配置"。
5. THE lint SHALL 警告(WARN)正文 <50 词。
6. THE lint SHALL 接入 `npm run check`。

### Requirement 3: 分类真相源校验(可选,P2)

**User Story:** 作为 Forge 维护者,当未来 agent 需要分组(decide/review/build 等)时,我希望有一个真相源校验防止分组注册与磁盘/脚本/CI 漂移。

#### 验收标准

1. IF Forge 引入 agent 分组机制,THEN Forge SHALL 提供 `divisions.json`(或等价真相源)作为分类唯一源。
2. THE 校验脚本 SHALL 确保磁盘目录、各脚本的分组数组、CI path filter 三处与真相源一致(移植 `check-divisions.sh` 逻辑)。
3. THE 此需求标记为 P2——仅在 Forge 真的引入分组时落地;当前扁平 agent 集合无需。

### Requirement 4: 门禁链协同

**User Story:** 作为 Forge 维护者,我希望 agent 相关门禁形成完整链条,在 CI 统一执行。

#### 验收标准

1. THE `npm run check` SHALL 按序执行:lint-agents → check-agent-originality(对改动文件)→ check-agent-sync(spec #1)。
2. THE 前置门禁失败时 SHALL 不执行后续(短路)。
3. THE pre-push hook SHALL 包含此链。

## 验收标准(整体)

- [ ] 新建一个与 `quality-check.md` 内容 90% 相同的 agent → `check-agent-originality` FAIL 退出 1。
- [ ] 删除某 agent 的 `description` 字段 → `lint-agents` ERROR 退出 1。
- [ ] `npm run check` 在干净状态退出 0。
- [ ] 现有全部 agent(spec#1 快照约 25 个,以实际为准)通过 lint 与 originality(基线审计)。

## 依赖

- spec `agency-borrow-01-unified-agent-source`:lint 与 originality 都作用于 `agents/`(唯一源),需先确立源。
- spec `agency-borrow-03-agent-persona-template`:lint 的推荐 section 名以该 spec 的 `templates/AGENT-TEMPLATE.md` 为权威(单向 #3→#2,lint 动态读取模板 section 名,无循环依赖)。

## 非目标

- **不**引入 agency-agents 的 `divisions.json` 全套(R3 仅在未来分组时落地)。
- **不**实现 agent 的语义级查重(向量嵌入)——shingle + Jaccard 足够检测"换皮",且无外部依赖。
- **不**把 lint 扩展到 SKILL 文档(那是另一套规范)。
- **不**强制 `color`/`emoji`/`vibe` 字段(agency-agents 的装饰字段,见调研报告 §三"不应照搬")。
