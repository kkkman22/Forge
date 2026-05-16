---
status: locked
contract_legacy: true
created: "2026-04-30"
source: ".kiro/specs/token-budget-compression"
---

# Spec: Token Budget Compression

> 来源: `.kiro/specs/token-budget-compression/` (requirements.md + design.md + tasks.md)

## Objective

压缩 Forge 项目中剩余 7 个未优化的 SKILL 文件和 CLAUDE.md，将总 SKILL 大小降至 ≤145K 字符，CLAUDE.md 降至 ≤9.5K 字符。使用已验证的压缩策略（Canonical Example、Reference Directive、Table Compression、Flow Diagram Simplification、Example Deduplication），不改变行为语义。

## Scope

**文档变更**（纯 markdown 编辑，无 TypeScript 代码变更）：

| 文件 | 当前大小 | 目标大小 |
|------|---------|---------|
| forge-spec SKILL.md | 17,499 | ≤12,000 |
| forge-loop SKILL.md | 14,741 | ≤10,000 |
| forge-router SKILL.md | 11,693 | ≤8,500 |
| forge-refactor SKILL.md | 8,544 | ≤6,500 |
| forge-test SKILL.md | 7,930 | ≤6,500 |
| forge-debug SKILL.md | 6,748 | ≤5,500 |
| forge-fix SKILL.md | 6,321 | ≤5,500 |
| CLAUDE.md | 11,956 | ≤9,500 |
| templates/CLAUDE.md | 11,479 | ≤9,500 |
| **Total SKILL (all 16)** | **178,417** | **≤145,000** |

## Requirements Summary

1. **forge-spec** (17.5K → ≤12K): §3/§8 Canonical Example, §1.5/§2 Table Compression
2. **forge-loop** (14.7K → ≤10K): §4.2 Reference Directive to skill-scheduler.ts, §4.4/§10 Table Compression, §12 Canonical Example
3. **forge-router** (11.7K → ≤8.5K): §2 Reference Directive to CLAUDE.md §1, §6/§8 Compression
4. **CLAUDE.md + templates/CLAUDE.md** (12K/11.5K → ≤9.5K): §2.5 slim to 2-3 line principle + Reference Directive to forge-build §3.2
5. **forge-refactor** (8.5K → ≤6.5K): §2/§3.1 template removal, §6 Flow Simplification
6. **forge-test** (7.9K → ≤6.5K): §3 Reference Directive to CLAUDE.md §2.3, §7/§2 Compression
7. **forge-debug** (6.7K → ≤5.5K): §4 Flow Simplification, §6/§3 Compression
8. **forge-fix** (6.3K → ≤5.5K): §2.1/§4 template removal, §6 Flow Simplification

## Constraints

- YAML Frontmatter 必须逐字节保留（name, description, disable-model-invocation）
- `## <number>.` 格式的节标题必须保留（contract test 检查）
- 行为语义不变：所有规则、阈值、决策逻辑、状态转换、输出格式规格必须完整保留
- 每个文件压缩后运行 contract tests checkpoint

## Validation

- Per-file: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` + `wc -c` target
- Final: `npm run check` + total SKILL ≤ 145,000 chars

## Reference

完整需求、设计和任务见 `.kiro/specs/token-budget-compression/` 目录。
