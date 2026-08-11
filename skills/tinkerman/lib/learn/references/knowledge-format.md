---
updated: 2026-08-11
---
# Knowledge Document Format & Execution Flow

## 5. Knowledge Document Format

### YAML Frontmatter

```yaml
---
title: "<知识标题>"
tags: ["tag1", "tag2"]
date: "YYYY-MM-DD"
confidence: 0.85
---
```

- `confidence` 范围 0.3–0.9（下限 0.3：低于此值不值得记录；上限 0.9：不使用 1.0）
- 输出路径：`.tinkerman/knowledge/solutions/<topic>.md`（kebab-case）
- Body 五章节：问题模式、解决方案、踩坑记录、决策理由、可复用模式

---

## 9. Execution Flow

1. **Knowledge base maintenance**: Clean low-confidence, check limits
2. **Backflow effect tracking**: Update confidence of referenced knowledge
3. **Execution quality analysis**: Four-dimension assessment + improvement signals
4. **Metrics update**: Write to metrics.md
5. **Learn prompt config**：`getLearnPromptConfig(outcome)` 决定是否追问失败原因（不强制 rating，Requirement 7.15）
6. **Five-dimension extraction**: Subagent mode (using improvement signals as input)
7. **SKILL feedback detection**: Check for inapplicable SKILL.md guidance
8. **Generate knowledge document**: YAML frontmatter + five sections
9. **Overlap detection**: ≥ 50% merge, < 50% create new document
10. **High-frequency pattern recognition**: Write to instincts.md when threshold reached
11. **Pattern 生命周期维护**：`findStaleOrDecayedPatterns(patterns, now)` 生成待归档清单，用户确认后 `archivePatternByName(patterns, name)` 移动到 `## Archived`（Requirements 7.10, 7.14）
12. **Episode → Instinct 升级**：`buildPatternUpgradeDrafts(episodes, patterns, now)` 产出草稿，用户确认后追加到 `instincts.md`（Requirement 7.11）
13. **Cross-project pattern detection**: Suggest promotion to patterns/
14. **Glossary 回写**：`extractSessionTermCandidates(sessionData, glossary)` → 用户确认后 `mergeTerm(glossary, term, 'append')`。不阻断主流程
15. **Glossary 陈旧术语归档（可选）**：`proposeStaleTerms(glossary, now)` → `archiveTerm(glossary, termName)`
16. **Error-prevention rule distillation**: 4 data sources → threshold → exclusion → conflict → capacity → proposal → write
17. **Context budget report**: `serializeContextBudgetReport(report)` 追加到 `sessions/<date>-<topic>.md` 附录
18. **自动生成 Episode**：`buildEpisodeFromSession(meta, phaseHistory, situation, lesson, sequenceInDay)` 构造 schema_version=2 episode，追加到 `sessions/<date>-<topic>.md`（Guarded zone 追加，Requirement 7.9）
19. **Evolution 聚合**：扫描 reviews/progress/findings 的 Evolution 标记，调用 `generateEvolutionReport(fs, forgeRoot, skillsRegistry)` + `renderEvolutionReport` 生成 `.tinkerman/knowledge/evolution-report.md`（开放区，每次覆盖；不保留历史快照，当前文件状态即真相，Requirements 8.9, 8.11, 8.14, 8.15）
20. **Knowledge integrity lint**：`lintKnowledgeIntegrity(input)` 检查跨文件引用完整性、孤儿文档、语义矛盾。Findings 以 advisory 形式呈现给用户，不阻断流程
21. **Knowledge catalog regeneration**：`buildCatalog(input)` 重新生成 `.tinkerman/knowledge/catalog.md`（开放区，每次覆盖）。提供 ~50 行全景索引供后续 plan/build/debug 阶段低成本查询
22. **Session layer cleanup**: Archive current session in sessions/
23. **Re-check limits**: Ensure maintenance invariants hold

### 9.1 Task Archival (Auto After Learn)

After knowledge is captured, automatically **copy** task artifacts to `.tinkerman/archive/<date>-<topic>/`.

| Source Path | Archive Path |
|-------------|-------------|
| `.tinkerman/decisions/<topic>.md` | `archive/<date>-<topic>/decisions/` |
| `.tinkerman/specs/<feature>/` | `archive/<date>-<topic>/specs/` |
| `.tinkerman/plans/<topic>.md` | `archive/<date>-<topic>/plans/` |
| `.tinkerman/progress/<topic>.md` | `archive/<date>-<topic>/progress/` |
| `.tinkerman/reviews/<topic>.md` | `archive/<date>-<topic>/reviews/` |
| `.tinkerman/debug/<topic>.md` | `archive/<date>-<topic>/debug/` |

After archival, update `.tinkerman/status.md` phase to `"completed"`. Do not archive knowledge/ and config.md.
