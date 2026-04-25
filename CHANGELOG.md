# Changelog

All notable changes to Forge will be documented in this file.

## [2.0.1] - 2026-04-24

### Changed

- **Agent frontmatter 全部使用 `model: inherit`**：移除硬编码的 `haiku`/`sonnet`，改为继承会话模型，兼容所有 coding plan（官方、Bedrock、Vertex、API key）
- **移除 Codex 平台支持**：Forge 专注于 Claude Code 单平台，移除 `dist/codex/`、install 脚本中的 codex 选项、README 中的 Codex 引用
- `install-dist.sh` 简化为无需 `--platform` 参数（保留向后兼容，传 `--platform claude-code` 仍可工作）

### Removed

- `dist/codex/` 目录及相关构建逻辑
- README 中所有 Codex 相关的安装说明和前置条件

## [2.0.0] - 2026-04-24

### Added

- **分发模型**：新增 `dist/` 目录结构，支持 Claude Code 分发包
  - `scripts/build-dist.sh`：从源定义构建平台适配的分发包
  - `scripts/install-dist.sh`：支持 `--platform`、`--dry-run`、`--backup` 的安装脚本
  - 每个分发包含平台特定的 `INSTALL.md`
- **已知失败模式**（`known-failures.md`）：记录反复出现的失败模式，供 `/forge debug` Phase 2 自动搜索和 `/forge build` 探针阶段回流
- **会话日志**（`sessions/`）：每次 `/forge learn` 写入简洁的会话摘要，供 `/forge resume` 恢复上下文
- **项目类型路由**：`classifyTask` 新增可选的 `ProjectContext` 参数，brownfield 项目触碰现有模块时 light 自动提升为 standard
- **知识库验证脚本**（`scripts/validate-knowledge.sh`）：5 项健康检查（文档数量、低置信度、frontmatter 完整性、known-failures 存在性、sessions 日志）
- **`/forge abort` 命令**：安全中止当前任务，归档状态到 `.forge/archive/`，重置 `status.md`

### Changed

- 前置条件从"仅 Claude Code"扩展为"Claude Code 或 Codex"
- 安装方式新增分发包安装路径（推荐），保留直接克隆方式（开发者）
- `.forge/knowledge/` 目录结构扩展：新增 `known-failures.md` 和 `sessions/` 子目录
- 状态文件保护分区：`known-failures.md` 加入受保护区（可追加，不可删除）
- `/forge debug` Phase 2 新增已知失败模式搜索步骤
- `/forge learn` 新增 §8.5（已知失败模式记录）和 §8.6（会话日志）

## [1.1.0] - 2026-04-24

### Added

- **`src/review.ts`**：评审引擎核心逻辑（置信度过滤、去重合并、跨评审者一致性提升、报告质量门 6 项检查）
- **`src/debug.ts`**：调试引擎核心逻辑（假设验证升级、假设完整性校验、四阶段状态机）
- **`test/review.property.test.ts`**：19 个 PBT 测试
- **`test/debug.property.test.ts`**：19 个 PBT 测试

### Fixed

- `generateKnowledgeDocument` 新增 `sanitizeDate` 日期 round-trip 验证，非法日期 fallback 到 `1970-01-01`
- `package.json` 依赖版本从 `^` 范围锁定为精确版本

## [1.0.0] - 2026-04-24

### Added

- 初始发布
- 13 个命令覆盖完整开发生命周期（router、decide、spec、plan、build、review、test、ship、learn、status、resume、debug、abort）
- 三级路由自动匹配任务复杂度（light / standard / full）
- 统一状态目录 `.forge/`，含文件保护分区（冻结 / 受保护 / 开放）
- 7 个 Subagent 角色 + 2 个 Agent Team 配置
- 4 个 Claude Code Hooks
- 交互式项目初始化脚本 `scripts/init.sh`
- 10 个 src/ 纯函数模块 + 133 个 PBT 测试
- CI：TypeCheck + Lint + Test 三重门禁
