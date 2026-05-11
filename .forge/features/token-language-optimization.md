---
topic: token-language-optimization
generated_at: 2026-05-11T13:25:17.601Z
auto_generated: true
stage_count: 1
total_files: 1
---

# Feature: token-language-optimization

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | — | — | — |
| Plan | [token-language-optimization.md](../plans/token-language-optimization.md) | approved | 2026-04-30 |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Plan** (approved, 2026-04-30)：通过两个独立策略优化 Forge 的 BPE token 消耗：P3（条件 SKILL 加载，为轻量路径加载精简 build SKILL）和 P2（混合语言策略，将结构性内容转为英文）。P3 先行（代码变更，可属性测试），P2 随后（纯文档变更）。
