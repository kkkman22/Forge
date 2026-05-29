# Spec 生命周期管理 — 任务清单

- [x] 1. 定义 Frontmatter Schema 和验证逻辑（RED）
  - 在 `src/` 中定义 frontmatter schema（TypeScript 类型）
  - 定义 SpecStatus 枚举：draft, approved, in_progress, completed, deferred, archived
  - 定义 SpecFrontmatter 接口：name, status, created, updated, priority, tier, depends_on, replaces, replaced_by, deferred_reason, deferred_date
  - 实现 `parseFrontmatter(requirementsMd: string): SpecFrontmatter | null`
  - 实现 `validateFrontmatter(fm: SpecFrontmatter): { valid, errors }`
  - 编写测试：合法 frontmatter、缺失必填字段、非法状态值、日期格式错误
  - TDD RED：测试先写
  - _Requirements: 1, 2_

- [x] 2. 实现 frontmatter 解析和验证（GREEN）
  - 使用简单正则提取 YAML frontmatter（`^---\n([\s\S]*?)\n---`）
  - 解析 YAML 字段（不引入 js-yaml 等依赖，手动解析简单字段）
  - 验证必填字段、状态枚举、日期格式
  - 确保 task 1 的测试全部通过
  - _Requirements: 2_

- [x] 3. 实现 rebuild-spec-index.mjs 脚本
  - 扫描 `.kiro/specs/` 排除 `_archived`、`_template`、`.` 开头的目录
  - 读取每个 spec 的 requirements.md frontmatter
  - 按 status 分组：活跃（draft/approved/in_progress）、completed、deferred
  - 扫描 `_archived/` 目录构建归档表
  - 生成 INDEX.md（三张表 + 统计摘要）
  - 支持 `--incremental` 模式（对比 git diff 只更新变化的 spec）
  - 支持 `--check` 模式（验证 frontmatter 合法性，不写文件）
  - _Requirements: 3.1, 3.2_

- [x] 4. 批量补充现有 spec 的 frontmatter（含 deferred 标记）
  - 为 `.kiro/specs/` 中所有无 frontmatter 的 spec 补充 status 字段
  - 状态判定规则：
    - `.forge/progress/` 中有对应 progress 且全部完成 → completed
    - `_archived/` 中 → archived
    - 其余 → in_progress（默认活跃状态）
  - **同时为以下 12 个 spec 写入 deferred frontmatter**（从 spec-housekeeping 吸收）：
    - `ccbp-hardening-phase2` → deferred_reason: "已被 frozen-zone-structured-feedback 部分覆盖"
    - `ccbp-inspired-hardening` → deferred_reason: "同上"
    - `claude-md-self-evolution` → deferred_reason: "依赖 Self-Evolution Protocol 成熟度"
    - `plan-document-streamlining` → deferred_reason: "当前 Plan 输出格式可接受"
    - `remaining-backlog` → deferred_reason: "随日常开发自然消化"
    - `skill-behavioral-guardrails` → deferred_reason: "等待 skill 系统稳定"
    - `skill-document-optimization` → deferred_reason: "token-budget-compression 已覆盖核心需求"
    - `skills-cross-pollination` → deferred_reason: "等待 skill 生态成熟"
    - `plugin-distribution` → deferred_reason: "插件生态非近期路线图，Q3 重新评估"
    - `plugin-init-experience` → deferred_reason: "依赖 plugin-distribution"
    - `parallel-status-tracking` → deferred_reason: "agent-teams 普及后再评估"
    - `review-comment-bitbucket` → deferred_reason: "Bitbucket 集成优先级低于 GitHub/GitLab"
  - 每个 deferred spec 插入 `status`、`deferred_reason`、`deferred_date: "2026-05-29"` 字段
  - 补充 created/updated 日期（从 git log 获取首次和最后提交日期）
  - 优先级和档位暂不补充（后续按需）
  - 同步 `.forge/features/` 中 deferred spec 对应的 feature 文件状态
  - _Requirements: 2_

- [x] 5. 生成 INDEX.md（首次全量）
  - 运行 `rebuild-spec-index.mjs` 全量模式
  - 验证 INDEX.md 包含全部 87 个现有 spec
  - 验证统计数据准确
  - 手动检查几个条目的正确性
  - _Requirements: 3.1_

- [x] 6. 集成到 /forge build 完成流程
  - 在 build SKILL 的完成阶段添加 spec 状态检查步骤
  - 读取 tasks.md 中所有 checkbox 状态
  - 全部 [x] → 更新 spec frontmatter status: completed, updated: today
  - 部分完成 → 仅更新 updated: today
  - 更新后重新运行 rebuild-spec-index.mjs --incremental
  - _Requirements: 4.1_

- [x] 7. 集成到 /forge ship 完成流程
  - 在 ship SKILL 的完成阶段添加 spec 状态摘要输出
  - 显示本次 ship 涉及的 spec 状态变更
  - 触发 rebuild-spec-index.mjs --incremental
  - _Requirements: 4.2_

- [x] 8. 集成到 /forge plan 和 /forge decide
  - plan 引用 spec 时检查 status
  - archived → 报错，显示 replaced_by
  - deferred → 警告
  - draft/approved → 更新 status 为 in_progress
  - decide 搜索相关 spec 时过滤 archived
  - _Requirements: 4.3_

- [x] 9. 创建 spec 模板
  - 创建 `templates/spec-template/requirements.md`（带 frontmatter 占位符）
  - 创建 `templates/spec-template/design.md`
  - 创建 `templates/spec-template/tasks.md`
  - 模板中包含引导注释，说明各字段用途
  - _Requirements: 5_

- [x] 10. CI 集成 INDEX.md 一致性检查
  - 在 CI check 脚本中添加 `rebuild-spec-index.mjs --check`
  - 检查 frontmatter 合法性
  - 检查 INDEX.md 是否与实际 spec 状态一致
  - 不一致时 CI 报错并提示运行 rebuild
  - _Requirements: 验收标准 CI 集成_
