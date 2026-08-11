---
status: approved
created: "2026-05-01"
approved: "2026-05-01"
source: ".kiro/specs/remaining-backlog/tasks.md"
---

# Plan: Remaining Backlog

> 来源: `.kiro/specs/remaining-backlog/tasks.md`

## Objective

执行 Forge 未完成的 5 个方向：SKILL 文档二次压缩、Agent 文件语言转换、社区基础设施、SKILL 插件机制、示例项目。

## 与已有计划的关系

- **Group A**（SKILL 压缩）→ 已有批准计划 `.tinkerman/plans/token-budget-compression.md`，独立执行
- **Group B**（Agent 语言转换）→ 已有批准计划 `.tinkerman/plans/token-language-optimization.md` Task 12，独立执行
- **本计划**覆盖 Group C/D/E 的新任务，以及 Group A/B 的最终验证协调

## 执行顺序

### Phase 1: Group C — 社区基础设施（P2，纯文档）

#### Task 1: 增强 CONTRIBUTING.md

- 添加架构概览（模块、纯函数模式、数据流）
- 更新 Node.js 版本要求为 22+（与 package.json engines 一致）
- 添加 Biome 配置引用和纯函数约定
- 添加 Conventional Commit 格式和 PR 工作流
- 添加测试要求（属性测试 vs 单元测试的适用场景）
- _Requirements: R3.1_
- _Verify_: `npm run check`

#### Task 2: 创建 GitHub Issue 模板

- 创建 `.github/ISSUE_TEMPLATE/bug_report.md`（复现步骤、预期/实际行为、环境信息）
- 创建 `.github/ISSUE_TEMPLATE/feature_request.md`（用例、方案、替代方案）
- 创建 `.github/ISSUE_TEMPLATE/skill_plugin_proposal.md`（SKILL 名称、阶段、描述、Forge 版本）
- 创建 `.github/ISSUE_TEMPLATE/config.yml`（可选，配置 issue 模板选择器）
- _Requirements: R3.2_
- _Verify_: 目视检查模板格式

#### Task 3: 创建 GitHub PR 模板

- 创建 `.github/PULL_REQUEST_TEMPLATE.md`（变更描述、关联 Issue、测试覆盖、Breaking Changes、Checklist）
- _Requirements: R3.3_
- _Verify_: 目视检查模板格式

#### Task 4: 创建最佳实践文档

- 创建 `docs/best-practices/skill-authoring.md`（SKILL 编写指南：frontmatter、结构、压缩策略）
- 创建 `docs/best-practices/router-selection.md`（Router 选择指南：三级路由判定流程）
- 创建 `docs/best-practices/review-configuration.md`（Review 配置指南：三层评审、P0-P3 处理）
- 创建 `docs/best-practices/worktree-usage.md`（Worktree 使用指南：分支隔离、上下文恢复）
- 为每个文档提供英文版本（`.en.md` 后缀）
- _Requirements: R3.4, R3.5_
- _Verify_: `ls docs/best-practices/`

---

### Phase 2: Group D — SKILL 插件机制（P2，代码变更，需 TDD）

#### Task 5: 定义 SkillManifest 类型和接口

- 创建 `src/skill-loader.ts`，定义 `SkillManifest` 接口（name, version, description, author, forgeVersion, phases, i18n?）
- 导出 `SkillManifest`、`SkillValidationResult` 类型
- _Requirements: R4.1_
- **TDD**: 先写类型导入测试
- _Verify_: `npx tsc --noEmit`

#### Task 6: 实现 validateManifest() 纯函数

- 创建 `src/skill-validator.ts`
- 实现 `validateManifest(json: unknown): ValidationResult`（验证必填字段、semver 格式、phases 非空数组）
- 实现 `checkVersionCompatibility(manifest, currentVersion): boolean`（semver 范围匹配）
- _Requirements: R4.2_
- **TDD**: RED — 编写 manifest 验证测试（有效/无效/缺失字段、版本兼容性）
- _Verify_: `npx vitest run test/skill-validator.test.ts`

#### Task 7: 实现 loadSkillsFromDir() 和 mergeSkillLists()

- 在 `src/skill-loader.ts` 中实现：
  - `loadSkillsFromDir(dirEntries): SkillManifest[]`（扫描含 skill.json 或 SKILL.md 的子目录）
  - `mergeSkillLists(builtin, external): SkillManifest[]`（内置优先，同名保留内置）
- _Requirements: R4.3_
- **TDD**: RED — 编写属性测试（Property 1: 内置优先，Property 2: 唯一名称）
- _Verify_: `npx vitest run test/skill-loader.test.ts test/skill-loader.property.test.ts`

#### Task 8: CLI 集成 --skills-dir 选项

- 在 `src/forge-loop-cli.ts` 添加 `--skills-dir <path>` 选项
- 将外部 SKILL 目录传递给 skill-resolver
- _Requirements: R4.4_
- _Verify_: `npx tsc --noEmit` + `npx vitest run`

#### Task 9: Group D 最终验证

- `npm run check` 全量通过
- 属性测试 200 iterations 通过
- _Requirements: R4.5_

---

### Phase 3: Group E — 示例项目（P3，纯文档）

#### Task 10: 创建 react-todo 示例

- 创建 `examples/react-todo/` 目录结构
- 包含 `.tinkerman/` 完整配置（status.md, config.md, specs/, plans/, reviews/）
- 包含示例 spec 和 plan
- 创建中英文 README（README.md, README.en.md）
- _Requirements: R5.1, R5.3_
- _Verify_: `ls -R examples/react-todo/`

#### Task 11: 创建 node-api 示例

- 创建 `examples/node-api/` 目录结构
- 包含 `.tinkerman/` 完整配置
- 创建中英文 README
- _Requirements: R5.2, R5.3_
- _Verify_: `ls -R examples/node-api/`

---

### Phase 4: 最终验证

#### Task 12: 全量 CI 验证

- `npm run check` 通过
- 所有 SKILL 字符数 ≤145,000（含 Group A/B 压缩结果）
- 所有 contract test 通过

---

## Dependencies

```
Phase 1 (Task 1-4): 无依赖，可与 Group A/B 并行
Phase 2 (Task 5-9): Task 5 → 6 → 7 → 8 → 9 顺序执行
Phase 3 (Task 10-11): 无依赖，可与 Phase 1/2 并行
Phase 4 (Task 12): 依赖所有前置 Phase 完成 + Group A/B 完成
```

## Risk

- **低风险**：Group C/E 为纯文档创建，零代码风险
- **中风险**：Group D 为新代码，需 TDD + 属性测试覆盖
- **注意点**：skill-validator 的 semver 解析需与 package.json version 格式兼容
- **注意点**：Group A/B 压缩后的 SKILL 字符数变化会影响 Task 12 的总字符数验证
