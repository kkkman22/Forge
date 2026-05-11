---
name: forge-learn
description: "Capture reusable lessons across five dimensions from completed session experience. Use when user runs `/forge learn`, task completes, or needs to convert session experience into persistent knowledge assets."
context: fork
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge learn — 知识引擎

> **触发方式**：全量路径的第八步（最后一步），或用户直接输入 `/forge learn`，或 `/forge ship` 完成后提示触发
> **职责**：从每次开发中提取关键经验并沉淀为可复用的知识资产，让系统越做越强
> **输出路径**：`.forge/knowledge/solutions/<topic>.md` + `.forge/knowledge/instincts.md` + `.forge/knowledge/known-failures.md` + `.forge/knowledge/sessions/<date>-<topic>.md`

---

## 1. Overview

`/forge learn` 是 Forge 工作流的知识沉淀阶段——把一次性的开发经验转化为可复用的知识资产。它以 Subagent 模式从五个维度提取知识，将解决方案文档化，将高频模式写入直觉库，并自动维护知识库的健康度。

**核心原则**：完成即沉淀。每次开发都是一次学习机会，不沉淀的经验等于没有发生过。

**Not For**：轻量路径的简单修复（无值得沉淀的经验）/ 中止的任务（abort 后无需 learn）

---

## Goals

### G1: Execution Quality Assessment
Produce a structured analysis of this session's execution quality across four dimensions (First-pass Rate, Plan Accuracy, Review Interception Rate, Debug Trigger Rate). Improvement signals feed directly into knowledge extraction.

### G2: Five-Dimension Knowledge Extraction
Extract actionable knowledge across all five dimensions: Problem Pattern, Solution, Pitfall Record, Decision Rationale, Reusable Pattern. Each dimension must be covered — no omissions.

### G3: Knowledge Document Generation
Produce properly formatted knowledge documents with correct YAML frontmatter and five-section body. Documents must follow the exact format spec.

### G4: Pattern Lifecycle Management
Identify high-frequency patterns, promote them to instincts when thresholds are met, manage pattern staleness and decay, and distill error-prevention rules from accumulated data.

### G5: Knowledge Base Health
Maintain the knowledge base within configured limits, enforce confidence thresholds, merge overlapping entries, and ensure maintenance invariants hold at all times.

### G6: Knowledge Backflow Wiring
Ensure knowledge flows back into plan, build, and debug phases. Track adoption and adjust confidence accordingly. Record failure patterns.

### G7: SKILL Feedback Detection
Detect scenarios where SKILL.md guidance was inapplicable. Record for review but never auto-modify SKILL.md.

### G8: Session Epilogue
Produce a session episode, run evolution aggregation, archive task artifacts, and update status.

### G9: 规则蒸馏 (Rule Distillation)
Distill error-prevention rules from accumulated knowledge entries when confidence and frequency thresholds are met. Proposed rules follow the Evolved Rules protocol (`.forge/knowledge/evolved-rules.md`).

---

## Constraints

### Knowledge Documents
- Every knowledge document must have YAML frontmatter with title, tags, date, confidence (range 0.3–0.9)
- Body must contain five sections: Problem Pattern, Solution, Pitfall Record, Decision Rationale, Reusable Pattern
- Output path: `.forge/knowledge/solutions/<topic>.md` (kebab-case)
- Tags overlap ≥ 50% with existing document → merge, do not create new

### instincts.md
- Pattern must appear in 2+ knowledge documents with confidence ≥ 0.5 to be promoted
- Every pattern entry must include Confidence_Score in 0.3–0.9 range
- Patterns with confidence ≥ 0.8 and no tech-stack dependency → suggest promotion to `patterns/`

### Knowledge Base Limits
- `solutions/` capped at 20 documents (configurable via `knowledge_limit` in `config.md`)
- Confidence_Score < 0.3 patterns are automatically deleted
- Invariant: document count ≤ limit ∧ no low-confidence patterns

### Error-Prevention Rules (evolved-rules.md)
- Maximum 15 rules
- Only add rules where absence would cause Claude to err — not a knowledge dump
- Written to `.forge/knowledge/evolved-rules.md`, injected via SessionStart hook

### Backflow Confidence Adjustment
- Knowledge adopted: confidence +0.05 (cap 0.9)
- Knowledge found ineffective: confidence -0.1 (floor 0.3)
- Failure pattern appearing 2+ times → write to `.forge/knowledge/known-failures.md`

### SKILL Feedback
- Record to `.forge/knowledge/skill-feedback.md`
- Same feedback category ≥ 3 occurrences → remind user to review
- Never auto-modify SKILL.md

### Execution Quality
- Four dimensions: First-pass Rate, Plan Accuracy, Review Interception Rate, Debug Trigger Rate
- Results append to `.forge/knowledge/metrics.md`
- Improvement signals must feed into five-dimension extraction

### Session Episode
- Write `sessions/<date>-<topic>.md` (≤20 lines)
- Task artifacts archived to `.forge/archive/<date>-<topic>/`
- Do not archive knowledge/ or config.md

### Compaction Recovery
- If resuming from a conversation summary: re-read this SKILL.md in full, verify all five dimensions are covered, verify document format correctness, then resume from interruption point

---

## Output Format

### Knowledge Document Template

```yaml
---
title: "<知识标题>"
tags: ["tag1", "tag2"]
date: "YYYY-MM-DD"
confidence: 0.85
---
```

### Execution Flow Reference

The full 21-step execution flow and task archival details are in references/knowledge-format.md §9.

### Reference Documents

| Topic | Reference |
|-------|-----------|
| Quality analysis (data sources, dimension calculation, output format, `analyzeSkillFeedback` / `crossValidateFailures`) | references/quality-analysis.md |
| Five dimensions (dimension table, data sources, function signatures, Confidence Score Rules, layered architecture) | references/five-dimensions.md |
| SKILL feedback | references/skill-feedback.md |
| Knowledge format §5 (complete template and field descriptions) | references/knowledge-format.md |
| Rule distillation (data sources, distillation algorithm, thresholds, exclusions, conflict detection, capacity, staleness, approval & write) | references/rule-distillation.md |
| Maintenance invariants | references/maintenance-invariants.md |
| Knowledge backflow | references/knowledge-backflow.md |
| Examples | references/examples.md |

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| 首次执行（空知识库） | 创建 solutions/ 和 instincts.md，输出提示 |
| 无可提取知识 | 提示本次较简单，未识别到新知识 |
| 知识库已满 | 新文档 confidence 高于最低文档时提示替换确认 |
| 无 `.forge/` 目录 | 提示先运行 `forge init` |

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "这次开发没什么值得记录的" | 每次开发都有值得记录的经验。"没什么特别的"本身就是一个信号——说明你没有深入反思 |
| "知识沉淀是额外开销" | 不沉淀的经验等于没有发生过。下次遇到同样问题时你会从零开始 |
| "代码本身就是文档" | 代码记录了"做了什么"，不记录"为什么这样做"和"试过什么不行" |

## Gotchas
- **Generic lessons**: "Be careful with types" → not actionable → lessons must include specific code pattern and trigger condition
- **Duplicate knowledge**: Same lesson recorded across sessions → knowledge base bloat → check existing entries before adding
- **Missing context**: Lesson recorded without the "why" → future sessions can't judge applicability → always include trigger condition and confidence score
