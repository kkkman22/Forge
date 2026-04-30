---
topic: "output-bloat-control"
date: "2026-04-30"
result: "pass"
p0_count: 0
p1_count: 0
p2_count: 3
p3_count: 1
---

# Review: Output Bloat Control

## Layer 1 — Spec 对齐

| Requirement | Status | Details |
|-------------|--------|---------|
| Req 1: Agent 级模型路由 | ✅ 10/10 AC 通过 | explore→haiku, review→sonnet, others→inherit, 双目录同步 |
| Req 2: 散文压缩规则 | ✅ 8/9 AC 通过 | "模棱两可的措辞"隐式覆盖，无功能影响 |
| Req 3: Restatement 压缩 | ✅ 7/7 AC 通过 | 5块/1500t → 3块/800t，异常块保留 |
| Req 4: opusplan 推荐 | ✅ 7/7 AC 通过 | 文档完整，README 链接已添加 |

**Scope Creep**: 无。所有变更直接映射到 4 个 Spec 需求。

### P3 Findings

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| 1 | P3 | `docs/forge-constitution-detail.md:127` | "5 区块格式"过时引用 | ✅ 已修复 → "3 区块格式" |

## Layer 2 — 代码质量

所有变更均为文档/配置修改。Agent 文件双目录 frontmatter 一致，CLAUDE.md 与 templates/CLAUDE.md §2.6 同步，SKILL 文件引用完整。

## Layer 3 — 安全与风险

| # | Severity | File | Issue | Recommendation |
|---|----------|------|-------|----------------|
| 1 | P2 | `agents/explore.md` | haiku 对安全模式识别能力较弱 | advisory — security-check (sonnet) + 安全自检提供纵深防御 |
| 2 | P2 | `CLAUDE.md` §2.6 | 200t 散文限制边缘情况 | advisory — 豁免清单 + 安全阀设计充分 |
| 3 | P2 | `forge-build/SKILL.md` | 300t explore 输出可能截断安全上下文 | advisory — 多层防御提供补救 |

## Summary

✅ 评审通过 | P0: 0 | P1: 0 | P2: 3 | P3: 1 (已修复)

无 P0/P1 阻断问题，可继续 `/forge ship`。
