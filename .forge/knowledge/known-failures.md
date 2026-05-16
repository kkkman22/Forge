---
updated: "2026-05-16"
schema_version: 1
---

# 已知失败模式

由 `/forge review` 自动累积的 P0/P1 失败模式库。`spec-check` / `quality-check` / `security-check` 在 Step 0.5 检索本文件做 recurrence 检测，新发现的 P0/P1 issue 通过 Step 0.6 的 append-block 自动追加。

retention：>100 条触发自动归档到 `.forge/archive/known-failures-<date>.md`，保留最新 80 条。

---

## Active Patterns

```yaml
- pattern_id: spec-skill-doc-skeleton-incomplete
  severity: P1
  first_seen: "2026-05-16"
  last_seen: "2026-05-16"
  occurrence_count: 1
  first_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  last_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  signature: "SKILL.md 章节仅声明字段名而无 schema 范例，下游 agent 无法机械化生成符合规范的输出"
  fix_required: "SKILL 章节描述结构化输出时，必须附 JSON/YAML 完整范例块；至少含一组真实字段值。修复模板：声明字段 → '完整 schema 范例：' → fenced code block。"
  source_review: ".forge/reviews/missions-inspired-rigor-audit-fixes.md"

- pattern_id: spec-skill-doc-section-mapping-drift
  severity: P2
  first_seen: "2026-05-16"
  last_seen: "2026-05-16"
  occurrence_count: 1
  first_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  last_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  signature: "design.md 引用 SKILL '某 §N' 但实际实现写到了 §M，且 §N 已被其他主题占用，无法直接修订"
  fix_required: "实现侧无需移动章节顺序，但必须在新章节末尾加'文档定位说明'明确承担原 design 中哪个 Section 的职责，避免后续 reviewer 按章节号搜索 schema 找不到。"
  source_review: ".forge/reviews/missions-inspired-rigor-audit-fixes.md"

- pattern_id: build-handoff-not-consumed-after-impl
  severity: P1
  first_seen: "2026-05-16"
  last_seen: "2026-05-16"
  occurrence_count: 1
  first_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  last_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  signature: "实现 schema/parser 完整且单元测试 100% 绿，但 SKILL 部署后 .forge/progress/*.md 持续 0 条真实 handoff block"
  fix_required: "完成 R2 类'agent 必须输出特定结构'的实现后，必须用一次最小真实 build 触发 SKILL 输出（dogfooding），并在 spec 的 Validation Contract 中将 'Verify-By: vitest' 升级为 'Verify-By: vitest + manual'，要求 progress 文件 grep 出至少一条真实 handoff block。"
  source_review: ".forge/reviews/missions-inspired-rigor-audit-fixes.md"

- pattern_id: ci-check-command-frontmatter-drift
  severity: P1
  first_seen: "2026-05-16"
  last_seen: "2026-05-16"
  occurrence_count: 1
  first_seen_commit: 855fec9d22927bbbb6ea7e228029070c8d507e16
  last_seen_commit: 855fec9d22927bbbb6ea7e228029070c8d507e16
  signature: "templates/config.md frontmatter 已声明 ci_check_command 字段，但仓库 .forge/config.md 未补齐该字段；forge-test SKILL Layer 3 因此走逐项回退分支，AI 自拼 typecheck/lint/test 三件套，漏掉 dist-sync、check-doc-structure、validate-skill-* 等十余条校验，推送后 GitHub CI 才暴露失败"
  fix_required: "1) 验证命令 grep '^ci_check_command:' .forge/config.md 必须有输出且值与 package.json scripts.check 一致；2) 缺失时 forge-test SKILL 应通过 detectCiCommandDrift 主动检测并降级到 npm run check（Spec local-ci-parity Req 2 已实现）；3) forge init 在检测到 package.json scripts.check 时应主动建议默认值（Req 4 已实现）。"
  source_review: ".kiro/specs/local-ci-parity/"
  detection_signal: "GitHub CI 失败列表里包含本地从未运行的命令名（dist-sync、check-doc-structure、validate-skill-* 等）"
  verification_command: "grep '^ci_check_command:' .forge/config.md"
```

---

<!-- Append-only convention: new entries appended above this marker; existing entries only update last_seen / last_seen_commit / occurrence_count. -->
<!-- Format reference (legacy): see git history for original placeholder template. -->
