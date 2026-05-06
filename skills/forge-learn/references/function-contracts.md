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
