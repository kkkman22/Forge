# Review 配置指南

## 三层评审

Forge review 使用三层并行评审，每层由独立 Subagent 执行：

| Layer | Reviewer | Check Content |
|-------|----------|--------------|
| **Layer 1** | spec-check | 需求实现、场景覆盖、scope creep |
| **Layer 2** | quality-check | 命名、错误处理、性能、测试覆盖率、代码重复、可维护性 |
| **Layer 3** | security-check | 硬编码密钥、注入风险、不安全依赖、权限边界、敏感数据 |

## 严重级别

| Level | Meaning | Handling |
|-------|---------|----------|
| **P0** | 阻塞发布 | 立即修复，阻断 `/forge ship` |
| **P1** | 高影响 | 发布前修复，阻断 `/forge ship` |
| P2 | 中影响 | 应该修复，可协商 |
| P3 | 低影响 | 建议改进，开发者决定 |

**铁律**：存在 P0/P1 问题时，`/forge ship` 被阻断。修复后必须重新评审。

## 轻量模式

轻量路径（Light tier）的 review 省略 Layer 1（spec-check），只运行 quality-check 和 security-check。

## 配置

评审配置在 `CLAUDE.md §3 Review Discipline` 和 `skills/forge-review/SKILL.md` 中定义。Subagent 定义文件位于：

- `agents/spec-check.md`
- `agents/quality-check.md`
- `agents/security-check.md`

## 评审报告格式

评审结果写入 `.forge/reviews/` 目录，包含：

1. 评审摘要（通过/未通过）
2. 按层分类的发现列表
3. P0-P3 严重级别标注
4. 修复建议（P0/P1 必须包含具体修复方案）

## 相关文件

- Review SKILL：`skills/forge-review/SKILL.md`
- Agent 定义：`agents/spec-check.md`、`agents/quality-check.md`、`agents/security-check.md`
- Subagent 运行器：`src/subagent-runner.ts`
