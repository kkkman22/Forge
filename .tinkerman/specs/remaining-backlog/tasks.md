---
feature: remaining-backlog
layout: tasks
created: 2026-05-01
spec_ref: ".tinkerman/specs/remaining-backlog/requirements.md"
---

# Tasks: Remaining Backlog

## Group A: SKILL 文档二次压缩（P1 — 纯文档，零风险）

- [x] 1. 压缩 forge-spec SKILL.md（17.9K → ≤12K）
  - [x] 1.1 §3 Spec 模板：保留 greenfield Canonical_Example，brownfield 变体替换为一行差异描述
  - [x] 1.2 §8 完整示例：保留 greenfield 示例，brownfield 替换为一行描述引用 Delta 章节
  - [x] 1.3 §1.5 Import Mode 转换规则表：合并冗长单元格为单行条目
  - [x] 1.4 §2 Step 1 输入源表格和生成规则压缩为紧凑格式
  - [x] 1.5 §4 质量标准示例和 §7 边界情况表格压缩
  - [x] 1.6 验证：`npx vitest run test/contract.test.ts test/contract.skills.test.ts` 且 `wc -c` ≤12,000
  - _Requirements: R1.1, R1.9, R1.10, R1.11_

- [x] 2. 压缩 forge-loop SKILL.md（15.4K → ≤10K）
  - [x] 2.1 §4.2 SKILL 调度状态机表：替换为 Reference_Directive 指向 skill-scheduler.ts，仅保留非显而易见的转换
  - [x] 2.2 §4.4 确认点预设策略表压缩为紧凑单列格式
  - [x] 2.3 §12 完整执行示例替换为 ≤15 行 Canonical_Example，场景变体用一行描述
  - [x] 2.4 §10 状态文件格式：删除重复 §3 Step 2 的字段生命周期表
  - [x] 2.5 §3 启动流程和 §11 边界情况压缩
  - [x] 2.6 验证：contract test 通过且 `wc -c` ≤10,000
  - _Requirements: R1.2, R1.9, R1.10, R1.11_

- [x] 3. 压缩 forge-router SKILL.md（11.8K → ≤8.5K）
  - [x] 3.1 §2 三级路由表替换为 Reference_Directive 指向 CLAUDE.md §1，仅保留 router 特有的命令序列扩展
  - [x] 3.2 §6 分类示例：每个 tier 保留一个示例，其余替换为一行描述
  - [x] 3.3 §8 行为提示表（§8.1-§8.3）合并为单一紧凑表格
  - [x] 3.4 §3 信号详情压缩为紧凑描述
  - [x] 3.5 验证：contract test 通过且 `wc -c` ≤8,500
  - _Requirements: R1.3, R1.9, R1.10, R1.11_

- [x] 4. 压缩 forge-refactor SKILL.md（8.6K → ≤6.5K）
  - [x] 4.1 §2 前置检查拒绝输出模板：保留格式结构，删除完整代码块
  - [x] 4.2 §3.1 Scan 输出格式：保留表头和一个示例行
  - [x] 4.3 §6 执行流程从散文简化为 ≤6 行编号步骤
  - [x] 4.4 §4 方法库描述收紧
  - [x] 4.5 验证：contract test 通过且 `wc -c` ≤6,500
  - _Requirements: R1.4, R1.9, R1.10, R1.11_

- [x] 5. 压缩 forge-test SKILL.md（8.1K → ≤6.5K）
  - [x] 5.1 §3 验证规则（§3.1-§3.6）替换为 Reference_Directive 指向 CLAUDE.md §2.3，仅保留 forge-test 特有的验证门函数和虚假声明表
  - [x] 5.2 §7 示例：保留一个通过示例，失败示例替换为一行描述
  - [x] 5.3 §2 Layer 3 清单输出：删除完整代码块，仅保留 7 项表格
  - [x] 5.4 验证：contract test 通过且 `wc -c` ≤6,500
  - _Requirements: R1.5, R1.9, R1.10, R1.11_

- [x] 6. 压缩 forge-debug SKILL.md（6.8K → ≤5.5K）
  - [x] 6.1 §4 执行流程从散文简化为 ≤6 行编号步骤
  - [x] 6.2 §6 四阶段示例：保留 Phase 1 和 Phase 4，Phase 2-3 替换为两行摘要
  - [x] 6.3 §3 红旗信号表：合并 "suggested action" 列到信号描述中
  - [x] 6.4 验证：contract test 通过且 `wc -c` ≤5,500
  - _Requirements: R1.6, R1.9, R1.10, R1.11_

- [x] 7. 压缩 forge-fix SKILL.md（6.4K → ≤5.5K）
  - [x] 7.1 §2.1 分析报告模板：删除完整代码块，保留章节标题列表和一行描述
  - [x] 7.2 §4 fix-note.md 模板：删除完整代码块，保留字段列表
  - [x] 7.3 §6 执行流程从散文简化为 ≤5 行编号步骤
  - [x] 7.4 验证：contract test 通过且 `wc -c` ≤5,500
  - _Requirements: R1.7, R1.9, R1.10, R1.11_

- [x] 8. Group A 最终验证
  - [x] 8.1 验证总字符数 ≤145,000：`total=0; for f in skills/*/SKILL.md; do size=$(wc -c < "$f"); total=$((total + size)); done; echo "$total"`
  - [x] 8.2 运行完整 CI：`npm run check`
  - [x] 8.3 验证所有 YAML frontmatter 未变
  - _Requirements: R1.8, R1.10, R1.11_

---

## Group B: Agent 文件语言转换（P1 — 纯文档，零风险）

- [x] 9. 转换 10 个 agent 定义文件
  - [x] 9.1 转换 `agents/architect.md`：section headings（身份→Identity, 评估维度→Evaluation Dimensions, 行为规则→Behavior Rules, 输出格式→Output Format, 约束→Constraints）、table headers、enumeration items → English；保留行为指令中文
  - [x] 9.2 转换 `agents/critic.md`：同上规则
  - [x] 9.3 转换 `agents/debugger.md`：同上规则
  - [x] 9.4 转换 `agents/designer.md`：同上规则
  - [x] 9.5 转换 `agents/explore.md`：同上规则
  - [x] 9.6 转换 `agents/product.md`：同上规则
  - [x] 9.7 转换 `agents/quality-check.md`：同上规则
  - [x] 9.8 转换 `agents/security-check.md`：同上规则
  - [x] 9.9 转换 `agents/security.md`：同上规则
  - [x] 9.10 转换 `agents/spec-check.md`：同上规则
  - _Requirements: R2.1, R2.2_

- [x] 10. 同步到 `.claude/agents/` 并验证
  - [x] 10.1 将 `agents/` 下所有 10 个文件同步到 `.claude/agents/`
  - [x] 10.2 运行 contract test：`npx vitest run test/contract.test.ts test/contract.skills.test.ts`
  - [x] 10.3 运行完整 CI：`npm run check`
  - _Requirements: R2.3, R2.4, R2.5_

---

## Group C: 社区基础设施（P2 — 纯文档）

- [x] 11. 增强 CONTRIBUTING.md
  - [x] 11.1 添加项目架构概览（模块、数据流、纯函数模式）
  - [x] 11.2 添加开发环境搭建（Node.js 22+, npm ci, biome, vitest）
  - [x] 11.3 添加代码风格指南（Biome 配置引用、纯函数约定）
  - [x] 11.4 添加提交消息格式和 PR 工作流
  - [x] 11.5 添加测试要求（纯函数用属性测试、边界情况用单元测试）
  - _Requirements: R3.1_

- [x] 12. 创建 GitHub 模板
  - [x] 12.1 创建 `.github/ISSUE_TEMPLATE/bug_report.md`（复现步骤、预期/实际行为、环境信息）
  - [x] 12.2 创建 `.github/ISSUE_TEMPLATE/feature_request.md`（用例、方案、替代方案）
  - [x] 12.3 创建 `.github/ISSUE_TEMPLATE/skill_plugin_proposal.md`（SKILL 名称、阶段、描述）
  - [x] 12.4 创建 `.github/PULL_REQUEST_TEMPLATE.md`（变更描述、关联 Issue、测试覆盖、Breaking Changes）
  - _Requirements: R3.2, R3.3_

- [x] 13. 创建最佳实践文档
  - [x] 13.1 创建 `docs/best-practices/skill-authoring.md`（SKILL 编写指南）
  - [x] 13.2 创建 `docs/best-practices/router-selection.md`（Router 选择指南）
  - [x] 13.3 创建 `docs/best-practices/review-configuration.md`（Review 配置指南）
  - [x] 13.4 创建 `docs/best-practices/worktree-usage.md`（Worktree 使用指南）
  - [x] 13.5 为每个文档提供英文版本（`.en.md` 后缀）
  - _Requirements: R3.4, R3.5_

---

## Group D: SKILL 插件机制（P2 — 代码变更）

- [x] 14. 实现 SKILL 插件核心模块
  - [x] 14.1 创建 `src/skill-loader.ts`，定义 `SkillManifest` 接口（name, version, description, author, forgeVersion, phases, i18n?）
  - [x] 14.2 创建 `src/skill-validator.ts`，实现 `validateManifest()` 纯函数（验证必填字段、semver 范围、phases 非空数组）
  - [x] 14.3 实现 `checkVersionCompatibility(manifest, currentVersion): boolean`
  - [x] 14.4 实现 `loadSkillsFromDir(dirEntries): SkillManifest[]`（扫描含 skill.json 或 SKILL.md 的子目录）
  - [x] 14.5 实现 `mergeSkillLists(builtin, external): SkillManifest[]`（内置优先，同名保留内置）
  - _Requirements: R4.1, R4.2, R4.3_

- [x] 15. CLI 集成和测试
  - [x] 15.1 在 `src/forge-loop-cli.ts` 添加 `--skills-dir <path>` 选项
  - [x] 15.2 编写属性测试：内置 SKILL 始终优先于同名外部 SKILL（200 iterations）
  - [x] 15.3 编写属性测试：合并列表包含所有唯一 SKILL 名称（200 iterations）
  - [x] 15.4 编写单元测试：manifest 验证（有效/无效/缺失字段）、版本兼容性
  - [x] 15.5 运行完整 CI：`npm run check`
  - _Requirements: R4.4, R4.5_

---

## Group E: 示例项目（P3 — 纯文档）

- [x] 16. 创建示例项目
  - [x] 16.1 创建 `examples/react-todo/`（含 `.tinkerman/` 配置、示例 spec/plan/review、中英文 README）
  - [x] 16.2 创建 `examples/node-api/`（含 `.tinkerman/` 配置、示例 spec、中英文 README）
  - _Requirements: R5.1, R5.2, R5.3_

---

## Notes

- Group A/B 为纯文档修改，零代码风险，可并行执行
- Group C/E 为纯文档创建，不影响现有代码
- Group D 为代码变更，需要 TDD 和完整 CI 验证
- 每个 Group 内的任务按依赖顺序排列
- 压缩策略参考已完成的 skill-document-optimization spec 的成功经验
