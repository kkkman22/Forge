---
updated: 2026-08-11
---
# Delegation Adapter

> 引用 `skills/shared/native-command-matrix.md` 获取完整配置

**基础会话恢复委托给官方 `/resume` + Checkpointing；Forge 层只负责五问题结构化 prompt 与 `--from-pr`**

## 执行路径选择

1. **standardPath**（不含 `--from-pr` 时）: 探测 `claude --version` ≥ 2.0.0
   - 调用 `/resume`（或触发 Checkpointing restore）恢复 Claude Code 会话状态
   - Native_Command 成功(exit 0) → 执行 Five_Question_Recovery prompt（SKILL.md §2）
   - Native_Command 失败(exit ≠ 0) → abort Forge 上层，透传 exit code

2. **legacyPath**: 版本不满足
   - 运行完整遗留行为（SKILL.md §2-§8）
   - 首次触发时 emit Deprecation_Notice（per-session 去重）
   - Notice: `⚠️ [Forge Slimming] /tinkerman resume 基础层可委托给 /resume + Checkpointing（Claude Code ≥ 2.0.0）。迁移指南：docs/slimming-migration.md`

3. **`--from-pr` 模式**: 无论版本，保留现有完整行为（PR_Slug_Mapping + PR_Context_Bundle 注入），不走委托路径
