---
status: archived
archived_reason: "被 ce-inspired-review-enhancement 和 forge-review-fix-optimization 吸收"
archived_replacement: "ce-inspired-review-enhancement"
feature: review-pipeline-enhancement
layout: requirements
created: 2026-05-30
tier: standard
---
# Review Pipeline 增强 — 需求文档

## 引言

Forge 的 `/forge review` 流程目前是"发现 → 报告 → 停止"。P2/P3 问题被发现后仅输出报告，开发者需手动修复。PR review 上下文恢复依赖 `.forge/status.md`，无法直接从 PR URL 入手。CI 中的 ultrareview 报告粒度不够，缺少 per-file 详情。

本特性对 review pipeline 进行四项增强：

1. **ultrareview `--json` 增强**（§34）：提取 per-file findings，支持 `--strict` 模式
2. **`/code-review --fix` 自动执行**（§60）：P2/P3 自动修复 + 独立 commit
3. **`/simplify` post-review 清理**（§61）：review 通过后自动代码简化
4. **`--from-pr` PR 恢复**（§88）：review/ship 支持 PR URL 直接进入

**来源**：Claude Code CHANGELOG §34、§60、§61、§88。

**设计决策**：§60/§61 自动执行——review 发现 P2/P3 时自动 `/code-review --fix`，通过后自动 `/simplify`。

## 术语

- **ultrareview**：Claude Code 内置的 `/code-review` 命令，`--json` 标志输出结构化 JSON。
- **P2/P3 Auto-Fix**：review 发现 P2/P3 级别问题时自动调用 `/code-review --fix` 修复，结果作为独立 commit。
- **Post-Review Simplify**：三层 review 全部通过后自动调用 `/simplify` 做代码清理。
- **PR Context Recovery**：从 PR URL/编号恢复会话上下文，使用已有 `scripts/resume-from-pr.mjs`。
- **Findings Severity**：P0（阻断发布）、P1（发布前修复）、P2（应修复）、P3（建议改进）。

## 需求

### Requirement 1: ultrareview `--json` 增强

**User Story:** 作为 CI 管理者，我希望 ultrareview 报告包含 per-file findings 详情和 `--strict` 模式，以更精细地控制 CI 质量门禁。

#### 验收标准

1. THE `scripts/run-ci-ultrareview.sh` SHALL 解析 `claude ultrareview --json` 输出中的 `findings` 数组。
2. THE 解析结果 SHALL 提取每个 finding 的 `file`、`line`、`severity`（P0-P3）、`category`（security/performance/maintainability/etc.）和 `description` 字段。
3. THE Markdown 报告 SHALL 包含 per-file findings 表格，按 file → severity 排序。
4. THE Markdown 报告 SHALL 为每个 finding 包含 code snippet 引用（file:line 格式）。
5. WHEN 脚本以 `--strict` 标志运行，THE P1 findings SHALL 同样阻断 CI（默认仅 P0 阻断）。
6. THE 脚本 SHALL 保持向后兼容：不带 `--strict` 时行为与当前一致。

### Requirement 2: P2/P3 自动修复

**User Story:** 作为 Forge 用户，我希望 review 发现 P2/P3 问题时自动修复，以减少手动修复的摩擦。

#### 验收标准

1. WHEN `/forge review` 三层 review 完成且存在 P2/P3 findings（无 P0/P1），THE review skill SHALL 自动执行 `/code-review --fix`。
2. THE `/code-review --fix` 的修复结果 SHALL 作为独立 commit：`fix(review): auto-fix P2/P3 findings from code-review`。
3. WHEN `/code-review --fix` 修复后，THE review skill SHALL 重新运行 `npm run check`（或 `.forge/config.md` 中的 `ci_check_command`）验证修复未引入新问题。
4. WHEN `npm run check` 失败，THE fix commit SHALL 被 revert，输出警告，保留 P2/P3 findings 不修复。
5. THE fix 结果 SHALL 写入 `.forge/reviews/` 记录。

### Requirement 3: P0/P1 不自动修复

**User Story:** 作为 Forge 用户，我希望 P0/P1 问题不自动修复，而是输出修复建议并阻断 ship。

#### 验收标准

1. WHEN 存在 P0 或 P1 findings，THE review skill SHALL NOT 执行 `/code-review --fix`。
2. THE review skill SHALL 输出详细的修复建议（包含 file:line、问题描述、建议修复方案）。
3. THE review skill SHALL 标记 ship 为阻断状态（遵循 CLAUDE.md §3.3 P0/P1 Must Fix 铁律）。

### Requirement 4: Post-Review Simplify

**User Story:** 作为 Forge 用户，我希望 review 通过后自动运行代码简化，以保持代码质量。

#### 验收标准

1. WHEN 三层 review 全部通过（无 P0/P1 且 P2/P3 已修复），THE review skill SHALL 自动运行 `/simplify`。
2. THE `/simplify` SHALL 以 cleanup-only 模式运行（不影响功能，仅做代码简化）。
3. THE simplify 结果 SHALL 作为独立 commit：`refactor: simplify code after review`。
4. WHEN simplify 后 `npm run check` 失败，THE simplify commit SHALL 被 revert。
5. WHEN simplify 产生 diff 超过 50 行，THE review skill SHALL 输出警告：`⚠️ Simplify 产生大量 diff（<n> 行），建议人工审查。`
6. WHEN 无 findings 且 simplify 成功，THE review skill SHALL 标记为"review 通过 + 代码优化完成"。

### Requirement 5: `--from-pr` PR 恢复集成

**User Story:** 作为 Forge 用户，我希望 `/forge review` 和 `/forge ship` 直接接受 PR URL，以快速接手他人的 PR。

#### 验收标准

1. THE `/forge review` skill instructions SHALL 新增入口：当用户提供 PR URL 或 PR 编号时，先调用 `node scripts/resume-from-pr.mjs <PR>` 恢复上下文。
2. THE `/forge ship` skill instructions SHALL 新增同样的 `--from-pr` 入口。
3. WHEN `resume-from-pr.mjs` 成功恢复上下文，THE review/ship skill SHALL 基于恢复的 PR context 执行后续流程。
4. WHEN `resume-from-pr.mjs` 失败，THE skill SHALL 输出错误诊断并建议手动恢复步骤。
5. THE 已有的 `scripts/resume-from-pr.mjs` SHALL 不需要修改（复用现有实现）。

### Requirement 6: Review Pipeline 完整流程

**User Story:** 作为 Forge 用户，我希望 review 的完整流程（发现→修复→简化→通过）自动化运行。

#### 验收标准

1. THE review pipeline 的执行顺序 SHALL 为：
   - Step 1: 三层 review（spec-check / quality-check / security-check）
   - Step 2: 存在 P0/P1 → 输出修复建议，阻断 ship
   - Step 3: 存在 P2/P3 → 自动 `/code-review --fix` + commit + 验证
   - Step 4: 全部通过 → 自动 `/simplify` + commit + 验证
   - Step 5: 输出最终 review 结论
2. THE pipeline 每个步骤完成后 SHALL 输出状态标记（`✅ <步骤> 完成`）。
3. THE pipeline SHALL 遵循 CLAUDE.md §2.7 No Confirmation Between Steps 铁律：步骤间不暂停询问用户。
