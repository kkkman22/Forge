---
updated: 2026-08-11
---
# Function Contracts

## `generateDecisionTree(topic, context)`

- **参数**：
  - `topic` — 用户请求的功能/任务描述
  - `context` — 当前项目上下文（技术栈、现有模块等）
- **返回**：决策树对象，包含根节点和分支结构
- **用途**：为苏格拉底式追问生成初始决策树，覆盖功能、边界、依赖、假设、非目标五个维度

---

## `selectNextQuestion(tree, answers)`

- **参数**：
  - `tree` — 当前决策树状态
  - `answers` — 用户已给出的回答集合
- **返回**：下一个问题字符串，或 `null`（追问完成）
- **用途**：基于已有回答选择下一个最能澄清需求的问题，驱动追问流程

---

## `applyAnswer(tree, question, answer)`

- **参数**：
  - `tree` — 当前决策树状态
  - `question` — 当前问题
  - `answer` — 用户回答
- **返回**：更新后的决策树状态
- **用途**：将用户回答应用到决策树，更新节点状态和分支走向

---

## `isComplete(tree)`

- **参数**：
  - `tree` — 当前决策树状态
- **返回**：`boolean` — 五个维度是否全部澄清
- **用途**：判定追问会话是否达到完成条件，可以输出总结

---

## `checkGrillGlossaryConflicts(tree, glossary)`

- **参数**：
  - `tree` — 决策树中涉及的所有术语
  - `glossary` — `loadEnforcementGlossary(rootDir, fs)` 返回：扁平 `.forge/glossary.md`（主权源）合并 enabled pack glossary 术语（只读补充）。扁平文件是写入主权源。
- **返回**：冲突/缺失术语列表
- **用途**：在追问结束前检查是否有未定义或冲突的术语，提示用户补充

---

## `renderGrillConflictPrompt(conflicts)`

- **参数**：
  - `conflicts` — `checkGrillGlossaryConflicts` 返回的冲突列表
- **返回**：格式化的问题提示字符串
- **用途**：将术语冲突渲染为用户可读的追问提示

---

## `extractNewGlossaryCandidates(tree)`

- **参数**：
  - `tree` — 完整的决策树（追问完成后）
- **返回**：新术语候选列表（含定义建议）
- **用途**：从追问过程中提取应写入 `.forge/glossary.md` 的新术语

---

## `renderGrillFindings(tree)`

- **参数**：
  - `tree` — 完整的决策树
- **返回**：结构化追问总结字符串
- **用途**：生成追问会话的最终输出，包括澄清后的需求、边界、依赖、假设、非目标
