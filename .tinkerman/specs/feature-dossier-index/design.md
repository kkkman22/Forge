---
feature: feature-dossier-index
layout: design
created: 2026-05-11
---

# Design Document

## 1. Overview

本设计把 9 条 Requirement 落到 **1 个纯函数模块 + 1 个 CLI + 1 条 Hook + 文档与测试**，全部零运行时新依赖、零 SKILL 改动、零物理目录迁移。核心是 `src/feature-dossier.ts` 的三个纯函数（`scanStagesForTopic` / `buildDossier` / `discoverTopics`）+ `scripts/rebuild-feature-dossier.mjs` 的 CLI + `hooks/hooks.json` 新增的一条 PostToolUse 条目。

映射关系：

| Requirement | 主要实现载体 | 工作量 |
|---|---|---|
| R1 Dossier 生成纯函数 | `src/feature-dossier.ts` → `buildDossier()` | 2 小时 |
| R2 文件系统扫描与路径映射 | `src/feature-dossier.ts` → `scanStagesForTopic()` | 2 小时 |
| R3 CLI 入口（单 topic / 批量） | `scripts/rebuild-feature-dossier.mjs` + package.json | 1.5 小时 |
| R4 PostToolUse Hook 自动重建 | `hooks/hooks.json` 一条新 entry + CLI `--from-path` 模式 | 1 小时 |
| R5 Topic_Discovery 与命名漂移 | `src/feature-dossier.ts` → `discoverTopics()` | 1.5 小时 |
| R6 开放区语义与零冻结冲突 | `src/conflict-classifier.ts` 一处白名单 + 检查文档一致性 | 30 分钟 |
| R7 首次启用与安全回退 | CLI 错误处理 + README 说明 | 1 小时 |
| R8 非功能（测试 + 性能） | `test/feature-dossier.test.ts` + property test | 2 小时 |
| R9 与 /forge learn 归档集成（可选） | `src/learn.ts` archive 流程增补 | 1 小时 |

总工作量估计：**约 1.5 个工作日**（含 R9 约 2 工作日）。

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Feature Dossier Index 三层                      │
│                                                                 │
│  Layer 1: 纯函数核心（src/feature-dossier.ts）                  │
│  ├── scanStagesForTopic(topic, forgeRoot) → StageScanResult     │
│  │   └── 扫 7 个 Stage_Directory，按 Stage_File_Pattern 匹配     │
│  ├── buildDossier({topic, forgeRoot, stageScan}) → DossierDoc   │
│  │   └── 纯函数，不访问 FS                                       │
│  ├── discoverTopics(forgeRoot) → TopicDiscoveryResult           │
│  │   └── Topic_Key 反推 + 命名漂移标记                           │
│  └── deriveTopicFromPath(path) → string \| null                  │
│      └── Stage_File_Pattern 的反向映射                           │
│                                                                 │
│  Layer 2: CLI 入口（scripts/rebuild-feature-dossier.mjs）       │
│  ├── node ... <topic>          → 重建单个                        │
│  ├── node ... --all            → 批量（Topic_Discovery）         │
│  ├── node ... --from-path <p>  → Hook 专用（静默成功输出）        │
│  └── 统一 exit code：0 成功 / 1 失败 / 2 缺 .tinkerman/              │
│                                                                 │
│  Layer 3: PostToolUse Hook（hooks/hooks.json）                  │
│  └── Write|Edit 匹配 .tinkerman/{decisions,specs,...}/ → CLI         │
│      └── 失败静默（|| true），timeout=5s                         │
└─────────────────────────────────────────────────────────────────┘
                               ↓ 派生产物
┌─────────────────────────────────────────────────────────────────┐
│  .tinkerman/features/<topic>.md                                     │
│  ├── YAML frontmatter: topic, generated_at, auto_generated      │
│  ├── 阶段索引表（7 行，一行对应一个 Stage_Directory）            │
│  ├── 摘要（从各阶段文件 frontmatter + 首节抽取）                 │
│  ├── 关联 ADR（有 ADR-*.md 时）                                 │
│  └── 相关 topic（检测到漂移时）                                  │
│  [开放区 · 可随时删除重建 · 不进冻结/受保护清单]                 │
└─────────────────────────────────────────────────────────────────┘
                               ↑ 保持不动
┌─────────────────────────────────────────────────────────────────┐
│                   现有 Forge 基础设施（不改）                    │
│                                                                 │
│  - 7 个 Stage_Directory 的物理布局                              │
│  - 所有 skill 的写入路径（specs/<feature>/spec.md 等）          │
│  - check-frozen.ts / scripts/check-frozen.sh 冻结规则           │
│  - conflict-classifier.ts zone 分类（仅新增 features/ 到开放区） │
│  - 18 个 skill 的 SKILL.md（完全不动）                          │
└─────────────────────────────────────────────────────────────────┘
```

关键架构原则：

1. **派生视图，不是真相源**：Dossier 是聚合索引，真相仍然在各 Stage_Directory 的文件里。删除整个 `.tinkerman/features/` 不影响 Forge 任何功能。
2. **纯函数 + I/O 边缘**：所有 markdown 生成逻辑是纯函数（易测、易推理）；I/O 只发生在 CLI 和 Hook 两个薄适配层。
3. **Hook 是优化，不是必需**：用户可以完全不启用 Hook，手动跑 `npm run dossier:rebuild:all` 也能用；Hook 只是让维护自动化。
4. **零跨系统依赖**：不依赖 git、不依赖 tsc、不依赖网络。

## 3. Data Model

### 3.1 StageScanResult

```ts
type StageName =
  | "decisions"
  | "specs"
  | "plans"
  | "reviews"
  | "progress"
  | "findings"
  | "debug";

interface StageFileEntry {
  /** 相对 forgeRoot 的路径，e.g. "decisions/2026-04-29-structured-observability.md" */
  path: string;
  /** 绝对 mtime ISO-8601 */
  mtime: string;
  /** 解析后的 YAML frontmatter；解析失败为 {} */
  frontmatter: Record<string, unknown>;
  /** 从第一个 ## 标题到下一个 ## 或 EOF 的片段，截断到 500 字符 */
  firstSection: string;
  /** 仅 decisions：区分 dated vs adr */
  kind?: "dated" | "adr";
  /** 仅 ADR：从文件名提取的编号，e.g. "0012" */
  adrId?: string;
}

interface StageScanResult {
  topic: string;
  forgeRoot: string;
  /** 每个 stage 下匹配的文件（可能为空数组） */
  stages: Record<StageName, StageFileEntry[]>;
}
```

### 3.2 DossierDocument

```ts
interface DossierFrontmatter {
  topic: string;
  generated_at: string;        // ISO-8601，由 CLI 在写入时注入
  auto_generated: true;
  stage_count: number;         // 非空 stage 的个数（0-7）
  total_files: number;         // 所有匹配文件总数
}

interface DossierDocument {
  frontmatter: DossierFrontmatter;
  body: string;                // 从 # 标题开始的 markdown
}
```

### 3.3 TopicDiscoveryResult

```ts
interface TopicDiscoveryResult {
  /** 按字母序排列的所有 Topic_Key */
  topics: string[];
  /** 命名漂移候选对（advisory） */
  drifts: Array<{
    topicA: string;
    topicB: string;
    reason: "trailing-digit" | "plural-form" | "substring" | "separator";
  }>;
  /** 存在子目录但无 spec.md 的异常 specs 条目 */
  emptySpecDirs: string[];
}
```

## 4. Key Algorithms

### 4.1 Stage_File_Pattern 匹配（正向）

对于给定 `topic`，在每个 Stage_Directory 下的匹配规则：

| Stage | Pattern | Regex (核心部分) |
|---|---|---|
| `decisions/` | dated 或 ADR | `^(?:\d{4}-\d{2}-\d{2}|ADR-\d{4})-<topic>\.md$` |
| `specs/` | 子目录 | 判断 `specs/<topic>/spec.md` 是否存在 |
| `plans/` | 精确 | `^<topic>\.md$` |
| `reviews/` | 精确 | `^<topic>\.md$` |
| `progress/` | 精确 | `^<topic>\.md$` |
| `findings/` | 精确 | `^<topic>\.md$` |
| `debug/` | 精确 | `^<topic>\.md$` |

`<topic>` 需要在构造 regex 前做 escape（kebab-case 里只有 `-` 是需要处理的字符，用 `String.raw` + 简单 escape 即可）。

### 4.2 Stage_File_Pattern 反向映射（Hook 用）

`deriveTopicFromPath(relPath)` 把一个具体文件路径映射回 Topic_Key：

```
decisions/2026-04-29-structured-observability.md   → "structured-observability"
decisions/ADR-0012-agent-skills-learnings.md       → "agent-skills-learnings"
specs/structured-observability/spec.md             → "structured-observability"
plans/structured-observability.md                  → "structured-observability"
reviews/foo.md                                     → "foo"
```

无法识别的路径（如 `decisions/ADR-TEMPLATE.md` 或 `specs/structured-observability/notes.md`）返回 `null`，Hook 静默退出（R4 AC6）。

### 4.3 Dossier 渲染模板

```markdown
---
topic: structured-observability
generated_at: 2026-05-11T14:22:00Z
auto_generated: true
stage_count: 4
total_files: 5
---

# Feature: structured-observability

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide   | [decisions/2026-04-29-structured-observability.md](../decisions/2026-04-29-structured-observability.md) | confirmed | 2026-04-29 |
| Spec     | [specs/structured-observability/spec.md](../specs/structured-observability/spec.md) | 🔒 locked | 2026-04-29 |
| Plan     | [plans/structured-observability.md](../plans/structured-observability.md) | ✅ approved | 2026-04-29 |
| Build    | [progress/structured-observability.md](../progress/structured-observability.md) | in-progress | 2026-05-09 |
| Review   | — | — | — |
| Test     | — | — | — |
| Ship     | — | — | — |

## 摘要

- **Decide** (confirmed, 2026-04-29)：引入结构化日志数据模型，支持 text/json 格式切换
- **Spec** (locked, 2026-04-29)：8 条需求覆盖日志模型、格式切换、级别过滤、性能计时
- **Plan** (approved, 2026-04-29)：11 个任务，分 5 个新增模块 + 3 个修改文件
- **Build** (in-progress, 2026-05-09)：5/8 任务完成，当前在 Task 6

## 关联 ADR

- [ADR-0014 结构化日志采用 LogSink 纯函数架构](../decisions/ADR-0014-structured-observability.md)

## 相关 topic

（本节在命名漂移检测未命中时省略）
```

路径采用相对形式（`../decisions/...`）以便 GitHub 等 markdown 渲染器正确解析链接。

### 4.4 Topic_Discovery 漂移检测

两个 topic 被标记为 `drift` 的条件（以 R5 AC3 为准）：

| Reason | 判定规则 | 例子 |
|---|---|---|
| `trailing-digit` | 去掉末尾数字/版本号后相等 | `audit-remediation` vs `audit-remediation-v221` |
| `plural-form` | 一方末尾 `s` 去掉后与另一方相等 | `agent` vs `agents` |
| `substring` | 一方是另一方的严格前缀/后缀，且长度差 ≤ 5 字符 | `context-budget` vs `context-budget-management` |
| `separator` | 把 `_` 全部替换为 `-` 后相等 | `foo_bar` vs `foo-bar` |

实现用 `O(n²)` 配对比较足够（topic 数量通常 < 100，性能不敏感）。

### 4.5 CLI 决策表

```
argv                                             action
----------------------------------------------   ------------------------
node script.mjs <topic>                          重建单个，有输出
node script.mjs --all                            Topic_Discovery + 批量重建
node script.mjs --from-path <p>                  derive topic → 重建，静默
node script.mjs                                  → 打印 usage，exit 1
```

## 5. File-by-File Changes

### 新增

| 文件 | 目的 |
|------|------|
| `src/feature-dossier.ts` | 核心纯函数模块（约 400 行含注释） |
| `scripts/rebuild-feature-dossier.mjs` | CLI 薄适配层（约 150 行） |
| `test/feature-dossier.test.ts` | 单元测试（覆盖 R8 AC6） |
| `test/feature-dossier.property.test.ts` | 属性测试（覆盖 R8 AC7） |
| `test/fixtures/feature-dossier/` | 测试用的最小 `.tinkerman/` fixture |

### 修改

| 文件 | 改动 |
|------|------|
| `package.json` | 新增 `dossier:rebuild` 和 `dossier:rebuild:all` 两个 scripts |
| `hooks/hooks.json` | 新增一条 PostToolUse entry（R4） |
| `src/conflict-classifier.ts` | 白名单 `.tinkerman/features/**` → open zone（R6） |
| `README.md` | `.tinkerman/ 目录结构` 章节补一行说明 features/（R8 AC8） |
| `src/learn.ts`（R9，可选） | archive 逻辑前先重建 dossier，然后 copy 到 archive 目录 |

### 不改（承诺）

- 所有 18 个 `skills/*/SKILL.md` 完全不改（零按需加载预算影响）
- 所有 Stage_Directory 的物理布局
- `scripts/check-frozen.sh`、`src/check-frozen.ts` 的冻结规则
- `.tinkerman/specs/` 目录（Forge + Kiro 双轨保持兼容）
- `scripts/init.sh`（`.tinkerman/features/` 由 CLI 按需创建）

## 6. Error Handling & Edge Cases

| Case | 行为 |
|------|------|
| `.tinkerman/` 不存在 | CLI exit 2 + 提示 `forge init`；Hook 静默退出 |
| `.tinkerman/features/` 不存在 | CLI 自动 `mkdir -p`；Hook 同样 |
| YAML frontmatter 损坏 | 该文件 frontmatter 降级为 `{}`；状态列显示 `(no frontmatter)` |
| 文件读取失败（权限等） | `--all` 模式跳过该 topic + 在 stderr 输出警告；单 topic 模式 exit 1 |
| Topic_Key 含 shell 特殊字符 | CLI 拒绝处理（exit 1），防注入 |
| Hook 触发路径是 `.tinkerman/features/*.md` | 立即 exit 0（防止无限循环） |
| Hook 触发路径无法识别 topic | 静默 exit 0 |
| `specs/<dir>/` 存在但无 `spec.md` | 索引表 Spec 行仍显示目录链接 + 状态 `(spec dir empty)` |
| dossier 与阶段文件同名冲突 | 不可能——dossier 在独立的 `features/` 目录 |
| 同一 topic 有多份 decisions | 按 mtime 降序列出在表格里，最新的放第一行，其余作为"历史决策"子列表 |
| 并发 Hook 触发（多个 tool 调用） | 每次重建是幂等写，最后胜者生效；文件锁非必需 |

## 7. Testing Strategy

### 7.1 单元测试（`test/feature-dossier.test.ts`）

- `buildDossier` 全阶段齐全场景
- `buildDossier` 仅 2-3 个阶段场景
- `buildDossier` 空 frontmatter 场景
- `buildDossier` 表格内容转义（`|`、`\n`、`<`）
- `scanStagesForTopic` 对 decisions 的 dated/ADR 双模式
- `scanStagesForTopic` 对 specs 子目录模式
- `scanStagesForTopic` 对不存在目录的降级
- `discoverTopics` 对现有仓库扫描输出排序验证
- `discoverTopics` 各 `drift.reason` 的触发
- `deriveTopicFromPath` 7 种路径形态的反向映射 + 2 种无效路径的 null

### 7.2 属性测试（`test/feature-dossier.property.test.ts`）

- **幂等性**：`buildDossier(x) === buildDossier(x)` 对任意 `StageScanResult` 成立
- **转义安全**：对含 `|`、`\n`、`<` 的 `firstSection`，生成的表格能被 markdown parser 解析
- **Round-trip**：`deriveTopicFromPath` 和 Stage_File_Pattern 构造互为逆运算
- **Discovery 包含性**：`discoverTopics(root).topics` 包含任意 `scanStagesForTopic(t, root).stages` 非空的 `t`

### 7.3 集成测试

在 `test/fixtures/feature-dossier/` 下放置一个最小的 `.tinkerman/` 树，脚本调用 CLI 后断言生成的 `features/<topic>.md` 内容等于快照。

### 7.4 Hook 烟测

`test/feature-dossier.hook.test.ts`：模拟 `TOOL_INPUT_FILE=.tinkerman/plans/foo.md` 环境变量，调用 CLI `--from-path` 模式，断言：
- dossier 被生成在 `features/foo.md`
- 对 `.tinkerman/features/foo.md` 本身作为输入时 exit 0 无副作用（防循环）
- 对 `.tinkerman/decisions/ADR-TEMPLATE.md` 作为输入时 exit 0 无副作用

## 8. Rollout Plan

1. **Phase 1 — 纯函数 + 测试**：实现 `src/feature-dossier.ts` 所有纯函数 + 完整测试覆盖
2. **Phase 2 — CLI**：实现 `scripts/rebuild-feature-dossier.mjs`，手动跑 `--all` 初始化当前仓库的约 30 个 topic
3. **Phase 3 — Hook**：新增 `hooks/hooks.json` 条目，在本地会话中观察 Hook 是否正常触发 + 输出是否保持安静
4. **Phase 4 — 文档**：更新 README，在 `.gitignore 建议` 段落加一句关于 `features/` 的选择
5. **Phase 5 — 可选 R9**：评估是否把 dossier 纳入 `/forge learn` 归档

各 Phase 独立可交付，可以只做 Phase 1-4 不做 5 也完整。

## 9. Out-of-Scope Confirmation

以下项目明确不在本设计范围内（对应 Requirements 的 Out of Scope）：

- 物理目录重组
- 跨功能比较视图
- HTML / Web UI 渲染
- git 历史嵌入
- 自动重命名漂移 topic
- 跨仓库聚合

## 10. Risk Assessment

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| Hook 触发导致 Claude Code 输出噪音 | 中 | 低 | 失败静默 + 成功时 `--from-path` 也静默 |
| Topic_Key 命名漂移误报 | 中 | 低 | drifts 只是提示，不影响生成 |
| Hook 频繁触发拖慢会话 | 低 | 中 | timeout=5s + 单次重建 < 500ms |
| dossier 与阶段文件状态不一致（极短窗口） | 高 | 低 | 派生视图本就容忍微小滞后；用户可手动 rebuild |
| R9 与 learn 归档耦合引入 bug | 中 | 中 | R9 设为可选 phase，先完成独立发布后再增补 |
| `.tinkerman/features/` 被误判为受保护 | 低 | 中 | R6 有白名单验证 + 单测覆盖 |

## 11. Open Questions

- Q1：dossier 表格里 "阶段" 列用中文（Decide/Spec/Plan/...）还是英文（decide/spec/plan/...）？
  建议英文，与 Stage_Directory 名一致，减少翻译负担。
- Q2：`generated_at` 放在 frontmatter 还是放在 body 末尾？
  建议放 frontmatter，便于机器扫描和陈旧度检测。
- Q3：是否在 dossier 里自动链接到 `adr-index.md`？
  不在本次范围，可作为后续增强。

以上问题在实现阶段与 Maintainer 对齐一次即可。
