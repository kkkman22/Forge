# Function Contracts

## `generateKnowledgeDocument(sessionLog, category)`

- **参数**：
  - `sessionLog` — 会话日志内容
  - `category` — 知识类别（problem-pattern / solution / pitfall / decision / reusable-pattern）
- **返回**：结构化知识文档字符串（Markdown 格式）
- **用途**：从单个会话日志中提取指定类别的知识条目

---

## `validateKnowledgeFrontmatter(frontmatter)`

- **参数**：
  - `frontmatter` — 知识文档的 YAML frontmatter 对象
- **返回**：`{ valid: boolean, errors: string[] }`
- **用途**：验证知识文档 frontmatter 是否包含必需的 `confidence`、`source_session`、`date` 字段

---

## `maintainKnowledgeBase(knowledgeDir, maxDocs)`

- **参数**：
  - `knowledgeDir` — `.forge/knowledge/` 目录路径
  - `maxDocs` — 最大文档数量（来自 `.forge/config.md` 配置）
- **返回**：清理后的文档列表
- **用途**：当知识库超过上限时，按置信度排序清理低置信度条目（confidence < 0.3 自动清理）

---

## `analyzeSkillFeedback(skillName, sessions)`

- **参数**：
  - `skillName` — Skill 名称
  - `sessions` — 该 skill 相关的会话日志数组
- **返回**：反馈分析报告（成功率、常见失败模式、改进建议）
- **用途**：分析特定 skill 的历史执行数据，识别系统性问题

---

## `crossValidateFailures(failures)`

- **参数**：
  - `failures` — 失败记录数组
- **返回**：跨会话验证结果（共同根因、模式匹配）
- **用途**：检测多个失败是否共享相同根因，避免重复记录同类知识

---

## `generateEvolutionReport(ruleCandidates)`

- **参数**：
  - `ruleCandidates` — 候选规则列表（来自知识库分析）
- **返回**：演化报告文档字符串
- **用途**：当知识条目达阈值时，生成提议新增/更新 evolved rules 的报告

---

## `renderEvolutionReport(report)`

- **参数**：
  - `report` — `generateEvolutionReport` 的输出
- **返回**：格式化终端输出字符串
- **用途**：将演化报告渲染为终端展示格式

---

## `extractSessionTermCandidates(sessionData, glossary)`

- **参数**：
  - `sessionData` — 会话数据
  - `glossary` — `loadEnforcementGlossary(rootDir, fs)` 返回的 enforcement glossary（扁平 `.forge/glossary.md` 主权源 + enabled pack 术语只读补充）
- **返回**：候选术语列表
- **用途**：从会话数据中提取潜在的术语候选项

---

## `proposeStaleTerms(glossary, now, maxAgeDays)`

- **参数**：
  - `glossary` — `loadEnforcementGlossary(rootDir, fs)` 返回的 enforcement glossary（扁平 `.forge/glossary.md` 主权源 + enabled pack 术语只读补充）
  - `now` — 当前时间戳
  - `maxAgeDays` — 最大存活天数
- **返回**：过期术语提议列表
- **用途**：识别术语表中陈旧或过期的术语

---

## `buildEpisodeFromSession(meta, phaseHistory, situation, lesson, sequenceInDay)`

- **参数**：
  - `meta` — 会话元数据
  - `phaseHistory` — 阶段历史记录
  - `situation` — 场景描述
  - `lesson` — 经验教训
  - `sequenceInDay` — 当日序号
- **返回**：结构化 Episode 对象
- **用途**：从会话数据构建知识 Episode

---

## `archivePatternByName(patterns, name)`

- **参数**：
  - `patterns` — 模式列表
  - `name` — 模式名称
- **返回**：归档结果
- **用途**：按名称归档指定模式

---

## `buildPatternUpgradeDrafts(episodes, patterns, now)`

- **参数**：
  - `episodes` — Episode 列表
  - `patterns` — 现有模式列表
  - `now` — 当前时间戳
- **返回**：模式升级草稿列表
- **用途**：基于 Episodes 构建模式升级建议

---

## `getLearnPromptConfig(outcome)`

- **参数**：
  - `outcome` — Episode 结果类型
- **返回**：Learn 提示配置
- **用途**：根据结果类型获取对应的提示配置

---

## `findStaleOrDecayedPatterns(patterns, now, maxAgeDays)`

- **参数**：
  - `patterns` — 模式列表
  - `now` — 当前时间戳
  - `maxAgeDays` — 最大存活天数
- **返回**：陈旧/衰减模式列表
- **用途**：识别知识库中陈旧或置信度衰减的模式

---

## `mergeTerm(glossary, candidate, strategy)`

- **参数**：
  - `glossary` — `loadEnforcementGlossary(rootDir, fs)` 返回的 enforcement glossary（扁平 `.forge/glossary.md` 主权源 + enabled pack 术语只读补充）
  - `candidate` — 候选术语
  - `strategy` — 合并策略
- **返回**：更新后的术语表
- **用途**：将候选术语按策略合并到术语表

---

## `archiveTerm(glossary, termName)`

- **参数**：
  - `glossary` — `loadEnforcementGlossary(rootDir, fs)` 返回的 enforcement glossary（扁平 `.forge/glossary.md` 主权源 + enabled pack 术语只读补充）
  - `termName` — 术语名称
- **返回**：更新后的术语表
- **用途**：从术语表中归档指定术语

---

## `serializeContextBudgetReport(report)`

- **参数**：
  - `report` — `ContextBudgetReport` 对象
- **返回**：序列化字符串
- **用途**：将上下文预算报告序列化为可存储/传输的格式
