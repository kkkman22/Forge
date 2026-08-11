---
updated: 2026-08-11
---
# ADR 输出 / ADR Output

决策被确认（`resolveDecideStatus` 返回 `confirmed`）后，Skill 在写出 `.forge/decisions/<YYYY-MM-DD>-<topic>.md` 的同时，**额外生成一条标准 ADR** 并更新 `.forge/knowledge/adr-index.md`。两个文件互补：前者是视角对话全文，后者是可检索的架构决策记录。

## 流程

1. 加载现有 ADR：`loadAllAdrs(adrPaths, readFile)` → `AdrEntry[]`
2. 构造 `FinalizeAdrInput`：
   - `title` = 决策主题
   - `topic` = 用于文件名 slug（`toKebabCase`）
   - `status` = `proposed` | `accepted`（通常为 `accepted`）
   - `date` = ISO 日期
   - `deciders` = 参与视角的 Subagent 列表或用户指定的决策者
   - `relatedAdrs`（可选）= 历史 ADR 提示中被引用的 id
   - `supersedes`（可选）= 当新决策明确取代旧 ADR 时填入
   - `bodyMarkdown` = `## Context` / `## Decision` / `## Consequences` 三段体
   - `existingAdrs` = 上一步加载的 ADR 列表
3. 调用 `finalizeAdr(input, readExistingFile)`（来自 `src/decide.ts`）
4. 按返回结果执行写入：
   - 写 `adrFilePath` ← `adrFileContent`（新 ADR 文件）
   - 写 `indexFilePath`（即 `.forge/knowledge/adr-index.md`）← `indexContent`
   - 对每个 `supersessionUpdates[i]`，写 `filePath` ← `updatedContent`（旧 ADR 文件状态更新为 `superseded`，`superseded_by` 指向新 id）

## 约束

- **文件名格式**：`.forge/decisions/ADR-NNNN-<kebab-topic>.md`（与视角对话文档 `<date>-<topic>.md` 并存，前缀不同便于区分）
- **索引幂等**：`indexContent` 覆盖式写入，每个 id 只出现一次
- **保护区语义**：ADR 文件位于 Guarded zone，可追加但不得删除；supersession 更新走 "再渲染" 而非 "编辑旧字段"，保持与 PreToolUse Hook 兼容

## 历史 ADR 提示（Round 1 启动前）

1. 枚举 `.forge/decisions/` 下所有 `ADR-NNNN-*.md` 文件路径
2. 调用 `loadAllAdrs(paths, readFile)`（来自 `src/adr-registry.ts`）解析 frontmatter，得到 `AdrEntry[]`
3. 调用 `findRelatedAdrs(taskDescription, adrs, 5)` 按 Jaccard 相似度取前 5 条
4. 以表格形式展示：`ID | Title | Status | Date | File`
5. 无匹配时显示 "（无相关历史 ADR）"，继续进入 Round 1

**目的**：让视角 Subagent 在评估前即可引用已有决策。Critic 在 Round 2 可据此判断新决策是否应取代旧决策。

## ADR Criteria Check 段落

`## ADR Criteria Check` 段落由 `runCriteriaScreen(decisions, signals)`（from `src/decide.ts`）在 Critic 返回前自动填充。每个决策候选产生一个四行块（由 `renderCriteriaCheck` 渲染）：

```
ADR Criteria Check:
  Reversibility: hard | soft
  Surprising: true | false
  Trade-off alternatives: [alt1, alt2] | none
  Verdict: WRITE ADR | INLINE NOTE | DISCARD
```

`Verdict` 驱动下游持久化行为：
- `WRITE ADR` → 新建 `ADR-NNNN-*.md` 文件 + 索引更新
- `INLINE NOTE` → `<!-- decision: ... -->` 注释追加到触发的 upstream 文件（spec / plan / progress）
- `DISCARD` → 无文件副作用
