---
feature: skills-cross-pollination
layout: design
created: 2026-05-05
---

# 设计文档：skills-cross-pollination

## Overview

本设计把 8 个需求分为 4 个 phase 推进，按价值降序实施。整体原则与 `engineering-governance-hardening` spec 对齐：

1. **零外部服务**：所有能力本地可运行，无新增运行时依赖
2. **纯函数优先**：所有核心模块 FCIS 风格，IO 注入到 driver 层
3. **渐进迁移**：按 skill 增量改造，主 skill 行为保持不变
4. **与现有 spec 正交**：本 spec 的需求 2（ADR 三问筛）作为 `engineering-governance-hardening` 需求 1（ADR Registry）的前置门，两者可独立合并但建议后者先落地
5. **不自动改 SKILL.md**：本 spec 引入的所有自动化沉淀机制（需求 8）只写入受保护区（reviews / progress / findings / knowledge 开放区），不修改冻结区（skills/**/SKILL.md）

### Phase 规划

| Phase | 需求 | 预期工作量 | 依赖 |
|---|---|---|---|
| Phase 1.1 | 需求 1 Glossary | 1-2 天 | 无 |
| Phase 1.2 | 需求 2 ADR 三问筛 | 1 天 | 建议 engineering-governance-hardening 需求 1 先行 |
| Phase 1.3 | 需求 3 description 重写 | 0.5-1 天 | 无 |
| Phase 2.1 | 需求 4 Grill skill | 2-3 天 | 需求 1（glossary） |
| Phase 2.2 | 需求 5 渐进披露 | 2-3 天 | 无 |
| Phase 3.1 | 需求 6 Zoom-out | 1 天 | 无 |
| Phase 4.1 | 需求 7 Episode & Confidence | 2-3 天 | 无（可并行） |
| Phase 4.2 | 需求 8 Evolution 标记 & 失败自动沉淀 | 2 天 | 需求 7（episode 数据结构） |

---

## Architecture

### 模块总览

```
┌────────────────────────────────────────────────────────────────────┐
│                  Skills Cross-Pollination Layer                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Glossary     │  │ ADR Criteria │  │ Description  │              │
│  │ Registry     │  │ Screen       │  │ Validator    │              │
│  │ (需求 1)     │  │ (需求 2)     │  │ (需求 3)     │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                      │
│         v                 v                 v                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Grill Skill  │  │ Progressive  │  │ Zoom-out     │              │
│  │ (需求 4)     │  │ Disclosure   │  │ Skill        │              │
│  │              │  │ Validator    │  │ (需求 6)     │              │
│  │              │  │ (需求 5)     │  │              │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │       Self-Improvement Loop（借鉴 self-improving-agent）     │  │
│  │  ┌────────────────┐       ┌──────────────────────────┐       │  │
│  │  │ Episode + Conf │ <───→ │ Evolution Markers +      │       │  │
│  │  │ Lifecycle (R7) │       │ Failure Auto-sink (R8)   │       │  │
│  │  └────────────────┘       └──────────────────────────┘       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│              Existing Forge Core (minimal changes)                 │
│  decide.ts | learn.ts | router.ts | state.ts | ship.ts | review.ts │
└────────────────────────────────────────────────────────────────────┘
```

### 数据流（以一次全量任务为例）

```
用户输入 /forge <task>
   │
   v
[Router classifyTask] ← 需求 3：改写后的 "Use when" description 提升 skill 选择精度
   │
   v
[forge-grill（可选前置）] ← 需求 4：苏格拉底式追问
   │   └─> 产出 .forge/findings/grill-<topic>.md
   │   └─> 提取新术语候选 → glossary 待合并
   v
[forge-decide] ← 需求 2：Round 2 Critic 阶段内嵌 ADR 三问筛
   │   └─> 三问 yes → 生成 ADR 文件
   │   └─> 任一 no → 行内注释或丢弃
   v
[forge-spec] ← 需求 1：扫描术语，glossary-miss 提示
   │
   v
[forge-plan] ← 需求 1：任务命名优先使用已定义术语
   │
   v
[forge-build → review → test → ship]
   │   │
   │   └─> 需求 8：TDD 连续 3 次失败 / review 发现新模式 / ship gate 拦截
   │         → 自动写 failure episode + Evolution 标记
   │
   v
[forge-learn] ← 需求 1 + 7 + 8 联合收尾：
   │   ├─> 提取新术语候选回写 glossary
   │   ├─> 自动生成 success/partial episode（需求 7）
   │   ├─> 扫描 Evolution 标记 → 生成 evolution-report.md（需求 8）
   │   ├─> 检测陈旧 instinct pattern → 待归档清单（需求 7）
   │   └─> 高频 episode 升级建议 → instinct 草稿
   │
   v
（用户可随时 /forge zoom-out）← 需求 6：退后一步三段式
```

---

## Components and Interfaces

### Phase 1.1 — Glossary Registry (需求 1)

#### 文件组织

```
.forge/
└── glossary.md                   新增术语表（开放区）

src/glossary.ts                   新增核心模块
src/glossary-extractor.ts         新增术语提取（纯函数）
test/glossary.property.test.ts    property-based test
```

#### `.forge/glossary.md` 格式

```markdown
---
schema_version: 1
updated: "2026-05-05"
---

# Forge Glossary

## Tier
**定义**：Forge 三维路由中的复杂度维度，决定运行哪些命令。取值 light / standard / full。
**别名**：档位、复杂度档位
**更新**：2026-05-05
**来源**：初始预置

## Spec
**定义**：需求锁定的产物，位于 `.forge/specs/<feature>/spec.md`，一旦 locked 即进入冻结区。
**更新**：2026-05-05
**来源**：初始预置
```

#### 核心类型

```typescript
// src/glossary.ts
export interface GlossaryTerm {
  term: string;
  definition: string;
  aliases?: string[];
  last_updated: string;        // ISO 8601 date
  source_session?: string;
}

export interface Glossary {
  schema_version: number;
  updated: string;
  terms: GlossaryTerm[];
}

export function parseGlossary(content: string): Glossary;
export function renderGlossary(glossary: Glossary): string;
export function findTerm(glossary: Glossary, query: string): GlossaryTerm | null;

export interface ConflictResult {
  hasConflict: boolean;
  conflictingTerm?: GlossaryTerm;
  reason?: "same_term_different_definition" | "same_alias_different_term";
}

export function detectConflict(glossary: Glossary, candidate: GlossaryTerm): ConflictResult;

export function mergeTerm(
  glossary: Glossary,
  term: GlossaryTerm,
  strategy: "append" | "replace" | "add_alias",
): Glossary;

export function findStaleterms(glossary: Glossary, now: Date, maxAgeDays: number): GlossaryTerm[];
```

#### 术语提取

```typescript
// src/glossary-extractor.ts
export interface TermCandidate {
  term: string;
  context: string;
  frequency: number;
}

export function extractCandidates(text: string, existingTerms: string[]): TermCandidate[];
export function filterCandidates(candidates: TermCandidate[], rules: ExtractionRules): TermCandidate[];

export interface ExtractionRules {
  minFrequency: number;          // 默认 2
  minLength: number;             // 默认 3
  excludePatterns: RegExp[];
  maxCandidatesPerSession: number; // 默认 10
}
```

#### 集成点

| Skill | 集成点 | 行为 |
|-------|--------|------|
| `forge-spec` | 输出结尾 | `extractCandidates(specText, glossaryTerms)` → 打印 `[glossary-miss]` |
| `forge-plan` | 任务命名阶段 | `findTerm(glossary, keyword)` → 替换为规范术语 |
| `forge-learn` | 收尾阶段 | `extractCandidates(sessionNotes, glossaryTerms)` → 提示用户确认追加 |
| `forge-decide`（Round 1） | 四视角输出前 | 冲突检测：用户新术语 vs glossary 现有定义 |

#### 初始预置术语

`Tier, Spec, Plan, Hint, Subagent, Frozen Zone, Guarded Zone, Open Zone, Restatement Checkpoint, Three-Strike, Closure-First Probe, Vertical Slice`（共 12 个）

---

### Phase 1.2 — ADR 三问筛 (需求 2)

#### 文件组织

```
src/adr-criteria.ts                   新增三问筛纯函数
test/adr-criteria.property.test.ts    property test
```

#### 核心类型

```typescript
// src/adr-criteria.ts
export interface DecisionCandidate {
  title: string;
  context: string;
  decision: string;
  consequences: string;
  alternatives?: string[];
}

export interface AdrCriteriaResult {
  reversibility: "hard" | "soft";
  surprising: boolean;
  tradeOff: boolean;
  alternatives: string[];
  shouldBecomeAdr: boolean;
  verdict: "WRITE_ADR" | "INLINE_NOTE" | "DISCARD";
  reasoning: string;
}

export interface DecisionSignals {
  reversalCostAssessment: "low" | "medium" | "high";
  hasExplicitTradeoff: boolean;
  inferFromKeywords: boolean;
}

export function evaluateAdrCriteria(
  decision: DecisionCandidate,
  signals: DecisionSignals,
): AdrCriteriaResult;

export function renderCriteriaCheck(result: AdrCriteriaResult): string;

export function decideOutputTarget(
  result: AdrCriteriaResult,
  upstreamFile: string,
): { target: "adr" | "inline" | "discard"; path?: string };
```

#### 判定逻辑

```typescript
export function evaluateAdrCriteria(
  decision: DecisionCandidate,
  signals: DecisionSignals,
): AdrCriteriaResult {
  const reversibility = signals.reversalCostAssessment === "low" ? "soft" : "hard";
  const surprising = detectSurprising(decision, signals);
  const alternatives = decision.alternatives ?? [];
  const tradeOff = signals.hasExplicitTradeoff && alternatives.length > 0;
  const shouldBecomeAdr = reversibility === "hard" && surprising && tradeOff;

  let verdict: AdrCriteriaResult["verdict"];
  let reasoning: string;
  if (shouldBecomeAdr) {
    verdict = "WRITE_ADR";
    reasoning = "Hard to reverse + surprising + real trade-off → persist as ADR";
  } else if (reversibility === "hard" || surprising) {
    verdict = "INLINE_NOTE";
    reasoning = "Partial criteria met → inline comment in upstream file";
  } else {
    verdict = "DISCARD";
    reasoning = "Easy to reverse + obvious + no alternatives → not worth documenting";
  }

  return { reversibility, surprising, tradeOff, alternatives, shouldBecomeAdr, verdict, reasoning };
}
```

#### 集成到 forge-decide

在 `src/decide.ts` 的 Round 2 Critic 返回前插入 `runCriteriaScreen(decisions, signals)`。`forge-decide/SKILL.md` 新增 `ADR Criteria Check` 段落。用户可通过 `--force-adr` / `--no-adr` 覆盖 verdict。

#### 与 engineering-governance-hardening 需求 1 的协作

- 本 spec 产出 `verdict: "WRITE_ADR"` + `reversibility / surprising / trade_off_alternatives` 字段
- engineering-governance-hardening 需求 1 消费这些字段，生成编号 + 索引
- ADR frontmatter 字段并集兼容（非冲突字段）

---

### Phase 1.3 — Description Validator (需求 3)

#### 文件组织

```
scripts/validate-skill-descriptions.sh    新增验证脚本
src/skill-description.ts                  解析与校验纯函数
test/skill-description.property.test.ts   property test
```

#### 核心类型

```typescript
// src/skill-description.ts
export interface SkillDescriptionCheck {
  filePath: string;
  description: string;
  length: number;
  hasUseWhen: boolean;
  hasForbiddenPatterns: string[];
  valid: boolean;
  errors: string[];
}

export function parseSkillFrontmatter(content: string): {
  name?: string;
  description?: string;
} | null;

export function validateDescription(filePath: string, content: string): SkillDescriptionCheck;

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(最好的|革命性|best-ever|unbeatable)\b/i, reason: "营销性语言" },
  { pattern: /\bv\d+\.\d+/, reason: "版本号" },
  { pattern: /\b202\d-\d{2}-\d{2}\b/, reason: "具体日期" },
];

const USE_WHEN_PATTERN = /use\s+when/i;
const MAX_LENGTH = 1024;
```

#### 重写范围

17 个 `skills/forge-*/SKILL.md`。每条 description 改写后通过脚本验证。脚本集成到 `npm run check`。

---

### Phase 2.1 — Grill Skill (需求 4)

#### 文件组织

```
skills/forge-grill/
├── SKILL.md                       主工作流（≤150 行）
└── references/
    ├── decision-tree-format.md    决策树 YAML 格式
    ├── question-strategies.md     问题生成策略
    └── examples.md                完整会话示例

src/grill.ts                       核心模块
test/grill.property.test.ts        property test
```

#### 核心类型

```typescript
// src/grill.ts
export interface DecisionTreeNode {
  id: string;
  category: "functionality" | "boundary" | "dependency" | "assumption" | "non_goal";
  question: string;
  status: "pending" | "resolved" | "deferred" | "skipped";
  aiSuggestion?: string;
  userAnswer?: string;
  children: DecisionTreeNode[];
}

export interface DecisionTree {
  rootDescription: string;
  nodes: DecisionTreeNode[];
  createdAt: string;
  lastUpdated: string;
}

export function generateDecisionTree(description: string, existingGlossary: Glossary): DecisionTree;
export function selectNextQuestion(tree: DecisionTree): DecisionTreeNode | null;
export function applyAnswer(tree: DecisionTree, nodeId: string, answer: string): DecisionTree;
export function isComplete(tree: DecisionTree): boolean;
export function extractNewGlossaryCandidates(tree: DecisionTree, existingGlossary: Glossary): TermCandidate[];
export function renderGrillFindings(tree: DecisionTree, alignmentSummary: string): string;
```

#### 工作流（Grill SKILL.md 主体）

```
Step 1: generateDecisionTree(description, glossary)
Step 2: loop:
  node = selectNextQuestion(tree)
  if node is null: break
  if canResolveFromCodebase(node.question):
    answer = explore subagent(...)
  else:
    ask user
    wait for answer
  tree = applyAnswer(tree, node.id, answer)
  detectConflict(glossary, extractedTerms)
Step 3: when isComplete(tree):
  summary = renderAlignmentSummary(tree)
  candidates = extractNewGlossaryCandidates(tree, glossary)
  write findings/grill-<topic>.md
  ask user to confirm merging candidates
```

#### Resume 支持

中途关闭时 `status.md.phase = "grill_abandoned"`，`findings/grill-*.md` 存储部分决策树。`forge-resume` 读取后恢复 pending 节点。

---

### Phase 2.2 — Progressive Disclosure (需求 5)

#### 文件组织

```
scripts/validate-skill-length.sh      验证脚本
src/skill-length.ts                   行数计算纯函数
```

#### 计算规则

```typescript
// src/skill-length.ts
export interface SkillLengthCheck {
  filePath: string;
  lineCount: number;
  limit: number;           // 默认 150
  exempt: boolean;         // shared/*.md 豁免
  valid: boolean;
}

export function countEffectiveLines(content: string): number;
export function checkSkillLength(filePath: string, content: string, limit = 150): SkillLengthCheck;
```

#### 迁移批次

| 批次 | Skills | 削减量合计 |
|------|--------|-----------|
| 批次 1（最严重） | forge-learn (388→150), forge-build (260→150) | 348 |
| 批次 2（中等） | forge-spec (253→150), forge-ship (246→150), forge-decide (245→150) | 294 |
| 批次 3（轻度） | forge-loop, forge-resume, forge-router, forge-refactor | 113 |

每批次独立 PR。每个迁移后的 skill 需要通过 canary 集成测试验证行为一致。

---

### Phase 3.1 — Zoom-out (需求 6)

#### 实现选择

**独立 skill `skills/forge-zoom-out/SKILL.md`**（≤100 行）。

理由：更清晰的路由选择；不污染 forge-status 职责；遵守渐进披露原则。

#### 核心类型

```typescript
// src/zoom-out.ts
export interface ZoomOutInput {
  currentSkill: string;
  currentTopic: string;
  focusedFile?: string;
}

export interface ZoomOutOutput {
  overallLocation: string;      // ≤ 5 行
  currentResponsibility: string; // ≤ 5 行
  boundaryWithNeighbors: string; // ≤ 5 行
}

export function buildZoomOutPrompt(input: ZoomOutInput): string;
export function renderZoomOut(output: ZoomOutOutput): string;
export function validateZoomOutOutput(output: ZoomOutOutput): {
  valid: boolean;
  violations: string[];
};
```

#### 工作流

```
1. 暂停当前 skill，写 status.md `phase: "zoom_out_paused"`，记录原 phase
2. 调 explore Subagent（只读），输入 buildZoomOutPrompt(input)
3. Subagent 返回三段式内容
4. validateZoomOutOutput → 不合规重试一次
5. renderZoomOut 输出到对话
6. 等用户 "continue" 或 30 秒无响应后恢复 status.md 原 phase
7. 不产生任何 .forge/ 文件副作用
```

---

### Phase 4.1 — Episode & Confidence Lifecycle (需求 7)

#### 文件组织

```
src/episode.ts                           episode 解析/渲染
src/pattern-stats.ts                     Confidence 公式与衰减检测
test/episode.property.test.ts            property test
test/pattern-stats.property.test.ts      property test
```

#### Episode 数据模型

```markdown
---
schema_version: 2
id: ep-2026-05-05-001
date: "2026-05-05"
skill: forge-review
tier: light
situation: "纯文档 PR 评审时遗漏过时引用"
root_cause: "步骤描述和格式定义分布在不同行"
solution: "commit 前 grep 旧值"
lesson: "纯文档 PR 需补充过时引用扫描"
outcome: success
user_rating: 8
related_pattern: "pat-2026-04-30-001"
related_skills: [forge-review, forge-build]
---

## 摘要
...（现有散文内容不变，保留向后兼容）
```

旧格式（`schema_version` 缺失）视为 v1，不需要回溯填充。

#### 核心类型

```typescript
// src/episode.ts
export interface Episode {
  schema_version: 1 | 2;
  id: string;                 // ep-YYYY-MM-DD-NNN
  date: string;               // ISO 8601
  skill: string;
  tier: "light" | "standard" | "full";
  situation: string;
  root_cause?: string;
  solution?: string;
  lesson: string;
  outcome: "success" | "partial" | "failure";
  user_rating?: number;       // 1-10
  related_pattern?: string;
  related_skills?: string[];
  body: string;               // 正文散文（向后兼容保留）
}

export function parseEpisode(content: string): Episode | null;
export function renderEpisode(episode: Episode): string;
export function generateEpisodeId(date: string, sequenceInDay: number): string;
```

#### Pattern Confidence 生命周期

```typescript
// src/pattern-stats.ts
export interface Pattern {
  pattern_id: string;         // pat-YYYY-MM-DD-NNN
  name: string;
  confidence: number;         // 0-1
  applications: number;
  successes: number;
  failures: number;
  last_triggered: string;     // ISO 8601
  decay_threshold: number;    // 默认 0.5
  tags: string[];
  body: string;
}

/** Beta 分布均值近似更新 confidence（纯函数） */
export function updatePatternStats(
  pattern: Pattern,
  outcome: "success" | "failure",
  now: Date,
): Pattern {
  const applications = pattern.applications + 1;
  const successes = pattern.successes + (outcome === "success" ? 1 : 0);
  const failures = pattern.failures + (outcome === "failure" ? 1 : 0);
  const alpha = 2, beta = 2;
  const confidence = (successes + alpha) / (applications + alpha + beta);
  return {
    ...pattern,
    applications,
    successes,
    failures,
    confidence,
    last_triggered: now.toISOString().slice(0, 10),
  };
}

/** 检测陈旧或低置信度 pattern（纯函数） */
export function findStaleOrDecayedPatterns(
  patterns: Pattern[],
  now: Date,
  maxAgeDays = 60,
): Pattern[] {
  return patterns.filter(p => {
    const ageDays = (now.getTime() - new Date(p.last_triggered).getTime()) / 86400000;
    const decayed = p.confidence < p.decay_threshold && p.applications >= 3;
    const stale = ageDays > maxAgeDays;
    return decayed || stale;
  });
}

/** 同类 episode 升级检测（纯函数） */
export function findUpgradableEpisodes(
  episodes: Episode[],
  patterns: Pattern[],
  now: Date,
  windowDays = 60,
  minOccurrences = 3,
): Array<{ clusterKey: string; episodes: Episode[]; patternDraft: Partial<Pattern> }>;
```

#### 集成到 forge-learn

修改 `src/learn.ts` 与 `skills/forge-learn/SKILL.md`：

1. 会话扫描阶段：自动生成 episode 写入 `knowledge/sessions/`
   - outcome 从 status.md 的 review/test/ship 结果判断
   - skill 从 status.md 的 phase 历史取
2. 收尾阶段：
   - 扫描 `knowledge/sessions/` 最近 60 天的 episode → `findUpgradableEpisodes` → 提示升级为 instinct
   - 读 `knowledge/instincts.md` → `findStaleOrDecayedPatterns` → 提示归档
   - 归档操作：把对应 pattern 移到 `knowledge/instincts.md` 底部 `## Archived` 段落（不删除）

#### 用户反馈（user_rating）

不强制。只有 `outcome === "failure"` 时 learn skill 询问一句失败原因（短文本即可），其他场景可选。

---

### Phase 4.2 — Evolution 标记 & 失败自动沉淀 (需求 8)

#### 文件组织

```
src/evolution-marker.ts                      标记解析与聚合（纯函数）
src/failure-sink.ts                          失败 episode 自动写入（driver 层）
test/evolution-marker.property.test.ts       property test
```

#### 标记格式

```markdown
<!-- Evolution: YYYY-MM-DD | source: <episode_id|review_id|progress_id> | target: <skill_name>[#<section>] -->
<具体描述：发现了什么模式，建议怎么改>
```

允许出现的位置：

| 位置 | 允许 |
|------|------|
| `.forge/reviews/*.md` | ✅ |
| `.forge/progress/*.md` | ✅ |
| `.forge/findings/*.md` | ✅ |
| `skills/**/SKILL.md` | ❌ 冻结区 |
| `.forge/config.md` | ❌ 冻结区 |
| 锁定的 spec | ❌ 冻结区 |

#### 核心类型

```typescript
// src/evolution-marker.ts
export interface EvolutionMarker {
  date: string;                 // ISO 8601
  source: string;               // episode_id | review_id | progress file path
  target: string;               // skill_name 或 skill_name#section
  description: string;
  filePath: string;             // 标记所在文件
  lineNumber: number;
}

export interface ValidationResult {
  valid: boolean;
  orphan: boolean;              // target skill 不存在
  reason?: string;
}

export function parseEvolutionMarkers(content: string): EvolutionMarker[];

export function validateEvolutionTarget(
  target: string,
  skillsRegistry: string[],  // 存在的 skill 名列表
): ValidationResult;

export interface EvolutionReport {
  generatedAt: string;
  totalMarkers: number;
  bySkill: Array<{
    targetSkill: string;
    markerCount: number;
    sources: string[];
    suggestAdr: boolean;        // ≥3 条指向同一 skill 的同一 section
    details: EvolutionMarker[];
  }>;
  orphans: EvolutionMarker[];
}

export function aggregateEvolutionMarkers(
  markersByFile: Map<string, EvolutionMarker[]>,
  skillsRegistry: string[],
): EvolutionReport;
```

#### 失败自动沉淀

```typescript
// src/failure-sink.ts
export interface FailureContext {
  skill: string;                       // forge-build | forge-review | forge-ship
  topic: string;
  tier: "light" | "standard" | "full";
  trigger: "three_strike" | "new_review_pattern" | "ship_gate_blocked";
  situation: string;
  rootCause?: string;
}

/** 纯函数：从 failure context 构建 episode + evolution marker draft */
export function buildFailureEpisode(
  ctx: FailureContext,
  now: Date,
  sequenceInDay: number,
): Episode;

export function buildFailureEvolutionMarker(
  ctx: FailureContext,
  episodeId: string,
  now: Date,
): string;
```

#### 集成点

| Skill | 触发 | 行为 |
|-------|------|------|
| `forge-review` | 发现 `knowledge/solutions/*.md` 未覆盖的新问题模式 | review 报告末尾追加 Evolution 标记 |
| `forge-review` | 拦截了 `knowledge/known-failures.md` 已有失败同类问题 | 调 `updatePatternStats(pattern, "success")` 更新 failure pattern |
| `forge-build` | 同任务连续 3 次 TDD 失败（对齐 three-strike） | 自动写 failure episode + progress 追加 `target: forge-build` Evolution 标记 |
| `forge-ship` | gate 拦截 | 自动写 partial/failure episode（outcome 由拦截原因决定） |

写入失败降级为警告（不阻断主流程）。

#### /forge learn 聚合

```
1. 扫描 .forge/reviews/**, .forge/progress/**, .forge/findings/** 的 Evolution 标记
2. aggregateEvolutionMarkers → EvolutionReport
3. 生成 .forge/knowledge/evolution-report.md（开放区，每次 learn 覆盖）
4. suggest_adr === true 的 target 在 report 头部突出显示
5. orphan 标记单独列出，提示人工修复 source 引用
```

evolution-report.md 示例：

```markdown
---
generated_at: "2026-05-05T08:30:00Z"
total_markers: 7
---

# Evolution Report

## 🚨 建议走 ADR 的高频进化点

### forge-review#stale-reference-check (3 条)
- 来源：ep-2026-04-30-001, ep-2026-05-02-003, ep-2026-05-05-002
- 建议运行 `/forge decide` 评估是否引入 stale reference scan 步骤

## 一般进化候选

### forge-build (1 条)
...

## Orphan 标记

- 文件 `.forge/reviews/xxx.md:42` 的 target `forge-nonexistent` 不存在
```

---

## Data Models

### Glossary Term

见 Phase 1.1。

### ADR Criteria Result

序列化到 ADR frontmatter：

```yaml
reversibility: hard
surprising: true
trade_off_alternatives:
  - "使用 SQLite 嵌入式存储"
  - "使用外部 Postgres"
```

### Grill Decision Tree

见 Phase 2.1。

### Episode (Phase 4.1)

见 Phase 4.1 frontmatter schema。

### Pattern (Phase 4.1)

`knowledge/instincts.md` 的每条模式 frontmatter：

```yaml
pattern_id: pat-2026-04-29-001
confidence: 0.82
applications: 11
successes: 9
failures: 2
last_triggered: "2026-05-05"
decay_threshold: 0.5
tags: [regex, testing, bug-prevention]
```

### Evolution Marker (Phase 4.2)

见 Phase 4.2 标记格式。

### Evolution Report (Phase 4.2)

见 Phase 4.2 示例。

---

## Error Handling

### Glossary 冲突

```typescript
export class GlossaryConflictError extends ForgeError {
  constructor(
    public readonly existingTerm: GlossaryTerm,
    public readonly candidateTerm: GlossaryTerm,
  ) {
    super("GLOSSARY_CONFLICT", `Term "${candidateTerm.term}" conflicts with existing definition`);
  }
}
```

### ADR 三问筛无效信号

`DecisionSignals.inferFromKeywords === true` 且置信度不足时，退化为 `verdict: "INLINE_NOTE"` + `reasoning: "insufficient signal to promote to ADR"`。不抛错。

### Grill 超时

用户 30 分钟无响应时，部分决策树持久化，phase 置为 `grill_abandoned`，可用 `/forge resume` 恢复。

### Skill Description 验证错误

`ValidationError`（code: `SKILL_DESCRIPTION_INVALID`），CI 阶段失败，列出所有违规文件。

### Episode / Pattern 解析错误

`parseEpisode` 对无效 frontmatter 返回 `null`（不抛错）。`parseInstinct` 对无效 pattern frontmatter 使用默认值（schema v1 行为）。

### Evolution 标记 orphan

`target` skill 不存在时，`validateEvolutionTarget.orphan === true`，进 report 的 orphan 列表，不中断 learn 流程。

### 失败自动沉淀写入错误

`failure-sink` 写 episode 失败时降级为 console.warn，不 throw。写 Evolution 标记失败时同理。

---

## Testing Strategy

### 需求 1 — Glossary

- Property test: `parseGlossary(renderGlossary(g))` 等价于 `g`
- Property test: `detectConflict` 对同名不同义必返回 `hasConflict: true`
- Property test: `mergeTerm` 为幂等操作
- Property test: `findTerm` 支持别名查找
- Integration test: `forge-spec` 扫描未定义术语的 e2e

### 需求 2 — ADR 三问筛

- Property test: 任一问题为 no → `shouldBecomeAdr === false`
- Property test: `alternatives.length === 0` → `tradeOff === false`
- Property test: verdict 与三布尔的映射唯一确定
- Unit test: `--force-adr` / `--no-adr` 覆盖逻辑
- Integration test: `forge-decide` 端到端生成 ADR 或行内注释

### 需求 3 — Description Validator

- Property test: 任意合法 description（含 "Use when" 且 ≤1024）`valid === true`
- Property test: 任意含 FORBIDDEN_PATTERNS 的 description `valid === false`
- Integration test: 17 个 skill 全部通过验证

### 需求 4 — Grill

- Property test: `generateDecisionTree` 对任意非空描述返回非空树
- Property test: `applyAnswer` 不引入新的 pending 节点
- Property test: 同一问答序列 replay 产出同一 alignment_summary
- Integration test: 端到端 grill 会话产出 findings/grill-*.md

### 需求 5 — Progressive Disclosure

- Unit test: `countEffectiveLines` 对已知输入返回预期行数
- Integration test: 每个迁移后的 skill ≤ 150 行
- Canary test: 迁移前后 skill 运行同一任务输出结构一致

### 需求 6 — Zoom-out

- Unit test: `validateZoomOutOutput` 对超过 5 行的段落返回违规
- Property test: `renderZoomOut` 为确定性函数
- Integration test: 触发 zoom-out 后对话显示三段式，`.forge/` 无副作用

### 需求 7 — Episode & Confidence Lifecycle

- Property test: `parseEpisode(renderEpisode(e))` 等价于 `e`
- Property test: `updatePatternStats` 对任意 (pattern, outcome) 序列的 confidence ∈ [0, 1]
- Property test: 任意 successes ≤ applications（不变量）
- Property test: `findStaleOrDecayedPatterns` 的输出是输入的子集
- Property test: `generateEpisodeId` 为幂等函数
- Integration test: learn 自动生成 episode 且字段齐全

### 需求 8 — Evolution 标记 & 失败自动沉淀

- Property test: `parseEvolutionMarkers` 对任意文本不抛错
- Property test: `aggregateEvolutionMarkers` 对空输入返回空报告
- Property test: `validateEvolutionTarget` 对不存在 skill 返回 `orphan: true`
- Property test: 同一 markers 集合的 `aggregateEvolutionMarkers` 产出稳定（确定性）
- Integration test: `forge-build` three-strike 触发 failure episode + Evolution 标记
- Integration test: `forge-ship` gate 拦截触发 partial/failure episode
- Integration test: `/forge learn` 生成 evolution-report.md 且包含 suggest_adr 标注

---

## Implementation Order

```
Phase 1.1 (Glossary) ──┐
                       ├──> Phase 2.1 (Grill) ──┐
Phase 1.2 (ADR 筛)  ───┤                        │
                       │                        ├──> Phase 4.2 (Evolution Markers)
Phase 1.3 (Desc) ──────┤                        │
                       │                        │
Phase 4.1 (Episode) ───┴──> Phase 4.2 (Evol) ───┘
                       │
Phase 2.2 (Disclosure) ┤
                       │
Phase 3.1 (Zoom-out) ──┘
```

- Phase 1.1 / 1.2 / 1.3 / 4.1 互相独立，可并行
- Phase 2.1（Grill）依赖 Phase 1.1（glossary）
- Phase 4.2（Evolution Markers）依赖 Phase 4.1（episode 数据结构）
- Phase 2.2 / 3.1 互相独立，无前置依赖

## Rollback Strategy

- 所有新增文件（glossary.md、grill/ skill、zoom-out/ skill、adr-criteria.ts、episode.ts、evolution-marker.ts 等）可直接删除而不影响现有功能
- Episode / Pattern frontmatter 扩展是向后兼容的（v1 通过字段缺失识别）
- 现有 skill 的 description 改写通过 git revert 快速回退
- SKILL.md 行数迁移通过 git revert 可完整恢复
- Evolution 标记只在受保护区出现，无需额外清理
- 无数据库迁移、无破坏性 schema 变更

## 与其他 Spec 的关系

| 本 spec 需求 | engineering-governance-hardening | 关系 |
|---|---|---|
| R1 Glossary | — | 无 |
| R2 ADR 三问筛 | R1 ADR Registry | 互补：本 spec 判断是否写，governance 管理编号/索引/supersession |
| R3 Description 重写 | — | 无 |
| R4 Grill | — | 无 |
| R5 Progressive Disclosure | — | 无 |
| R6 Zoom-out | — | 无 |
| R7 Episode & Confidence | R3 Event Sourcing | 互补：本 spec 是人类可读视图，governance 是机器可重放事件流 |
| R8 Evolution 标记 | R1 ADR Registry + R3 Event Sourcing | 互补：Evolution 是 "候选 ADR 的输入队列"；event log 记录自动事件，Evolution 只记录值得人工注意的 |

两个 spec 可独立合并。建议 governance 先落地 R1（ADR Registry），再做本 spec 的 R2 / R8，以复用 ADR 编号与 frontmatter schema。
