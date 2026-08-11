---
feature: parallel-status-tracking
layout: tasks
created: 2026-04-29
spec_ref: ".forge/specs/parallel-status-tracking/requirements.md"
---

# Implementation Tasks

## Task 1: 实现 slugify 纯函数与 Status_Resolver

- [x] 1.1 创建 `src/status-resolver.ts`，实现 `slugify(taskName: string): string` 纯函数
  - 转小写，移除非 ASCII 字母数字字符，空格和特殊字符替换为连字符，折叠连续连字符，去除首尾连字符
  - 输入为空或不含 alphanumeric 字符时抛出 Error
- [x] 1.2 实现 `resolveStatusPath(ctx: ResolverContext): ResolvedStatus`
  - 检测 `.forge/status/` 目录是否存在来判断 single/multi 模式
  - single 模式返回 `.forge/status.md`，multi 模式返回 `.forge/status/<task-id>.md`
- [x] 1.3 实现 `isMultiTaskMode(forgeRoot: string): boolean` 辅助函数
- [x] 1.4 编写属性测试 `test/status-resolver.test.ts`
  - Property 1: Slugify output validity（≥100 iterations）
  - Property 2: Slugify determinism（≥100 iterations）
  - Property 3: Slugify error on invalid input（≥100 iterations）
  - Property 12: Task name round-trip via frontmatter（≥100 iterations）
  - Example tests: 单任务模式路径解析、Pretty_Printer 读取 current_task

## Task 2: 实现 Status_Manager 核心读写

- [x] 2.1 创建 `src/status-manager.ts`，定义 `StatusManagerIO` 接口和 `TaskStatusEntry` 类型
- [x] 2.2 实现 `readTaskStatus(io, forgeRoot, taskName): string`
  - 优先读取 `.forge/status/<task-id>.md`，不存在则回退到 `.forge/status.md`
  - 读取失败时返回空字符串（graceful degradation）
- [x] 2.3 实现 `writeTaskStatus(io, forgeRoot, taskName, content): void`
  - 多任务模式写入 `.forge/status/<task-id>.md`（自动创建目录）
  - 单任务模式写入 `.forge/status.md`
  - 写入失败时 log warning 不 crash
- [x] 2.4 实现 `listActiveTasks(io, forgeRoot): TaskStatusEntry[]`
  - 扫描 `.forge/status.md` 和 `.forge/status/*.md`
  - 过滤 phase 不为 completed/aborted 的任务
- [x] 2.5 实现 `getMostRecentActiveTask(io, forgeRoot): TaskStatusEntry | null`
  - 从活跃任务中选择 `updated` 时间戳最新的
- [x] 2.6 编写属性测试 `test/status-manager.test.ts`
  - Property 4: Read fallback resolution（≥100 iterations）
  - Property 5: Frontmatter round-trip preservation（≥100 iterations）
  - Property 6: Active task listing completeness（≥100 iterations）
  - Property 9: Most recent task selection（≥100 iterations）
  - Example tests: 写入失败 graceful degradation、无活跃任务返回空列表

## Task 3: 实现迁移与归档逻辑

- [x] 3.1 实现 `migrateToMultiTask(io, forgeRoot): void`
  - 从 `.forge/status.md` 读取 current_task → slugify → 创建 `.forge/status/` 目录
  - 将原内容写入 `.forge/status/<task-id>.md`
  - 清空 `.forge/status.md`（保留空 frontmatter 标记）
- [x] 3.2 实现 `archiveTaskStatus(io, forgeRoot, taskName): void`
  - 将 `.forge/status/<task-id>.md` 移动到 `.forge/archive/<date>-<task-id>/status.md`
- [x] 3.3 在 `writeTaskStatus` 中集成自动迁移逻辑
  - 当检测到需要从 single → multi 切换时，先调用 `migrateToMultiTask`
- [x] 3.4 编写属性测试
  - Property 7: Router multi-task routing（≥100 iterations）
  - Property 10: Migration data preservation（≥100 iterations）
  - Property 11: Abort isolation（≥100 iterations）
  - Example tests: 目录不自动删除、迁移失败回退到单文件模式

## Task 4: 适配 sdk-driver.ts 和 sdk-status-helpers.ts

- [x] 4.1 修改 `sdk-driver.ts`，在构造 `StatusFileIO` 时通过 `StatusManager` 路由读写
  - 使用 `readTaskStatus` / `writeTaskStatus` 替代直接文件读写
  - 在 Loop 启动时通过 `resolveStatusPath` 确定当前任务的状态文件路径
- [x] 4.2 确保 `initializeLoopFields` 和 `clearLoopFieldsOnShutdown` 通过 StatusFileIO 接口自动路由到正确文件（无需修改这些函数本身）
- [x] 4.3 编写属性测试
  - Property 8: Loop cleanup isolation（≥100 iterations）
  - Example tests: Loop 启动时正确解析路径、残留状态清理只影响当前任务

## Task 5: 适配 SKILL.md 文档

- [x] 5.1 修改 `skills/forge-router/SKILL.md`
  - § 5 状态更新：添加多任务模式下写入 Task_StatusFile 的说明
  - § 7.4 已有进行中的任务：改为显示活跃任务列表而非单任务覆盖提示
- [x] 5.2 修改 `skills/forge-resume/SKILL.md`
  - § 2 前置：多任务时显示任务选择列表
  - 单任务时保持自动恢复行为
- [x] 5.3 修改 `skills/forge-abort/SKILL.md`
  - § 2 执行流程：多任务时显示任务选择列表 + "abort all" 选项
  - 归档逻辑适配 Task_StatusFile 路径
- [x] 5.4 修改 `skills/forge-status/SKILL.md`
  - § 2 数据来源：添加 `.forge/status/*.md` 扫描
  - § 3 输出格式：多任务时显示汇总表
- [x] 5.5 修改 `skills/forge-loop/SKILL.md`
  - § 2 启动流程 Step 2：写入 Task_StatusFile 而非 Legacy_StatusFile
  - § 10 状态文件格式：说明多任务模式下的文件路径
  - § 11.2 已有进行中的任务：改为显示活跃任务列表

## Task 6: 适配 hooks/hooks.json

- [x] 6.1 修改 `UserPromptSubmit` hook
  - 添加 `.forge/status/` 目录检测，多任务模式下读取最近更新的任务文件
  - 单任务模式保持原有行为
- [x] 6.2 修改 `PostToolUse` hook
  - 条件改为 `if [ -d .forge/status ] || [ -f .forge/status.md ]`
- [x] 6.3 修改 `TeammateIdle` hook
  - 多任务模式下从最近更新的任务文件读取 phase
- [x] 6.4 修改 `Stop` hook
  - 多任务模式下检查所有任务文件的进度
- [x] 6.5 编写 hook 脚本的集成测试
  - 单任务模式输出与当前行为一致
  - 多任务模式选择最近更新的任务
  - 无文件时 clean exit

## Task 7: 端到端验证与文档

- [x] 7.1 运行完整测试套件，确保所有属性测试和单元测试通过
- [x] 7.2 验证向后兼容：无 `.forge/status/` 目录时所有行为与修改前一致
- [x] 7.3 验证迁移流程：单任务 → 启动第二任务 → 两个任务独立读写
- [x] 7.4 更新 CHANGELOG.md 记录多任务状态追踪功能
