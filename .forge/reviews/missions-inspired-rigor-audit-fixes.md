---
topic: missions-inspired-rigor-audit-fixes
reviewed_at_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
mode: minimal-dogfooding
---

# Review: missions-inspired-rigor — Audit Fixes

> 三层评审针对 2026-05-16 修复 commit 的 diff（skills/forge-build/SKILL.md + skills/forge-loop/SKILL.md + .kiro/specs/missions-inspired-rigor/tasks.md）。
> 本次评审作为 R2 + R3 的最小 dogfooding 闭环：产出真实的 known-failure append-block 写入 `.forge/knowledge/known-failures.md`。

## Step 0 — Diff Snapshot

```
 skills/forge-build/SKILL.md |  2 ++   (+ Carry-Over Discipline 1 行)
 skills/forge-loop/SKILL.md  | 14 ++   (+ events.ndjson JSON schema 范例 + 文档定位说明)
 .kiro/specs/.../tasks.md    | 11 ✓ + 2 deferred
```

## Step 0.5 — Known-failures Recurrence Detection

读取 `.forge/knowledge/known-failures.md` → **0 条历史条目**（placeholder body）。
本次为首次写入，无 recurrence 可检测。

## Step 0.6 — Known-failures Append-block 输出

本次评审产出 2 条 P1 + 1 条 P2 append-block，对应审计中识别的 3 类偏差模式（首次记录到 KB）：

```yaml known-failure
pattern_id: spec-skill-doc-skeleton-incomplete
severity: P1
first_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
signature: "SKILL.md 章节仅声明字段名而无 schema 范例，下游 agent 无法机械化生成符合规范的输出"
fix_required: "SKILL 章节描述结构化输出时，必须附 JSON/YAML 完整范例块；至少含一组真实字段值。修复模板：声明字段 → '完整 schema 范例：' → fenced code block。"
```

```yaml known-failure
pattern_id: spec-skill-doc-section-mapping-drift
severity: P2
first_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
signature: "design.md 引用 SKILL '某 §N' 但实际实现写到了 §M，且 §N 已被其他主题占用，无法直接修订"
fix_required: "实现侧无需移动章节顺序，但必须在新章节末尾加'文档定位说明'明确承担原 design 中哪个 Section 的职责，避免后续 reviewer 按章节号搜索 schema 找不到。"
```

```yaml known-failure
pattern_id: build-handoff-not-consumed-after-impl
severity: P1
first_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
signature: "实现 schema/parser 完整且单元测试 100% 绿，但 SKILL 部署后 .forge/progress/*.md 持续 0 条真实 handoff block"
fix_required: "完成 R2 类'agent 必须输出特定结构'的实现后，必须用一次最小真实 build 触发 SKILL 输出（dogfooding），并在 spec 的 Validation Contract 中将 'Verify-By: vitest' 升级为 'Verify-By: vitest + manual'，要求 progress 文件 grep 出至少一条真实 handoff block。"
```

---

## Layer 1 — Spec Alignment

**Reviewer**: spec-check (manual proxy)

| Requirement/AC | Status | Note |
|---|---|---|
| R2.AC6 not_completed 非空 → 提示处理 | ✅ 已实现 | `skills/forge-build/SKILL.md` §3.6 "Carry-Over Discipline" 段补齐 |
| R4.AC3 phase_start session_id 等字段 | ✅ 已实现 | `skills/forge-loop/SKILL.md` §13 schema 范例已加 |
| R4.AC4 phase_end exit_code 字段 | ✅ 已实现 | schema 范例显式包含 `"exit_code":0` |
| Tasks file checkbox 同步 | ✅ 已实现 | T1-T11 [x]、T12-T13 (deferred) |

**Scope Creep**: 无。三处改动均严格对应审计 P1/P2 项。

**Issue List**:

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | P3 | Carry-Over Discipline 描述了三选一处理路径但未说明谁负责判定（plan agent 还是 build agent） | 后续 SKILL 修订时明确判定主体 |

---

## Layer 2 — Code Quality

**Reviewer**: quality-check (manual proxy)

`skills/` 改动范围：纯 Markdown 文档修订，无可执行代码改动。

| # | Severity | File | Issue | Suggestion |
|---|---|---|---|---|
| 0 | — | — | 无质量问题 | — |

Deslop 扫描：本次 diff 全部为人类编辑的中英混合 SKILL 文档，未触发 (a) Comment Paraphrase / (b) Infallible try-catch / (c) `as any` / (d) Nesting ≥4 任一模式。

---

## Layer 3 — Security & Risk

**Reviewer**: security-check (manual proxy)

无新增代码、无依赖变更、无配置变更。零风险面。

| # | Severity | File | Issue | Suggestion |
|---|---|---|---|---|
| 0 | — | — | 无安全问题 | — |

---

## Step 4.5 — known-failures 累积统计

- **本次新增**：3 条（spec-skill-doc-skeleton-incomplete / spec-skill-doc-section-mapping-drift / build-handoff-not-consumed-after-impl）
- **本次更新**：0 条
- **写入位置**：`.forge/knowledge/known-failures.md`

---

## 总结

P0 / P1 / P2 阻断项：**无**。
评审通过，可继续 ship。

本次评审本身完成 R2 + R3 的最小 dogfooding 闭环：
- ✅ R2：`.forge/progress/missions-inspired-rigor-audit-fixes.md` 含 3 份合法 handoff block
- ✅ R3：`.forge/knowledge/known-failures.md` 首次写入 3 条真实 known-failure 条目
