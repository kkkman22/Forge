---
updated: 2026-08-11
---
# Five-Dimension Knowledge Extraction — 详细规范

> 从 `../instructions.md §3` 拆分。SKILL 主文件只保留摘要与函数签名指针。

以 **Subagent 模式**启动知识提取，每个维度由独立 Subagent 处理。

## Dimensions

| Dimension | Extraction Content | Data Source |
|-----------|-------------------|------------|
| **Problem Pattern** | Issue type, trigger condition, impact scope | `.tinkerman/debug/`, `.tinkerman/progress/` (blocked items) |
| **Solution** | Final approach, implementation rationale, selection reasoning | `.tinkerman/plans/`, code changes, `.tinkerman/findings/` |
| **Pitfall Record** | Detours, failed attempts, misleading clues | `.tinkerman/debug/`, `.tinkerman/progress/` (failure records) |
| **Decision Rationale** | Decision context, trade-off process, rejected alternatives | `.tinkerman/decisions/`, `.tinkerman/specs/` |
| **Reusable Pattern** | Reusable code/architecture/process patterns | Code changes, `.tinkerman/specs/`, `.tinkerman/plans/` |

## Function Calls

**`generateKnowledgeDocument(title, tags, date, confidence, body)`**
- 参数：`title` — 知识标题（string）；`tags` — 标签数组（`string[]`）；`date` — 日期字符串（YYYY-MM-DD）；`confidence` — 置信度（0.3-0.9）；`body` — 五章节内容对象（含 `problem`、`solution`、`pitfalls`、`decisions`、`reusable`）
- 返回：完整的 `KnowledgeDocument` 对象（含 frontmatter 和结构化正文）
- 用途：从五维度提取结果生成标准格式的知识文档，写入 `.tinkerman/knowledge/solutions/<topic>.md`

**`validateKnowledgeFrontmatter(frontmatter)`**
- 参数：`frontmatter` — 待验证的 frontmatter 对象（含 title、tags、date、confidence 字段）
- 返回：`{ valid: boolean, errors: string[] }`
- 用途：写入前验证 frontmatter 格式合规（title 非空、tags 非空数组、date 为有效日历日期、confidence 在 0.3-0.9 范围）

## Confidence Score Rules

| Score | Meaning |
|-------|---------|
| 0.3-0.4 | Preliminary observation, verified only once |
| 0.5-0.6 | Verified 2-3 times |
| 0.7-0.8 | Verified multiple times, stable and reliable |
| 0.9 | Mature pattern verified by extensive practice (upper limit, do not use 1.0) |

下限 0.3：低于此值不值得记录。

## Knowledge Base Tiered Architecture

| Tier | Directory | Lifecycle | Purpose |
|------|-----------|-----------|---------|
| **Session Tier** | `sessions/` | Single session | `/tinkerman resume` context recovery |
| **Project Tier** | `solutions/` + `instincts.md` | Project-level persistent | plan/build/debug backflow |
| **Cross-project Tier** | `patterns/` | Cross-project persistent | Universal patterns (manual migration, max 10) |

## Body Structure

知识文档包含五个章节：问题模式、解决方案、踩坑记录、决策理由、可复用模式。

输出路径：`.tinkerman/knowledge/solutions/<topic>.md`（kebab-case）。
