# Changelog

All notable changes to Forge will be documented in this file.

## [2.1.1] - 2026-04-26

### Changed

- **CI Actions 升级至 Node.js 24 运行时**：`actions/checkout` v4→v5、`actions/setup-node` v4→v6，消除 GitHub Actions Node.js 20 弃用警告
- **CI 构建 Node.js 版本升级**：20→22（当前 LTS）

### Fixed

- **Shellcheck 合规**：修复 4 个脚本共 7 处 shellcheck 警告
  - `auto-resume.sh` / `persistent-loop.sh`：`ls -t *.md` 替换为 `find + xargs ls -t`（SC2012）
  - `init.sh`：移除多余 `echo` 包裹（SC2005）；`A && B || C` 重写为 `if/then/else`（SC2015）
  - `install-dist.sh`：`${f#${BUNDLE_DIR}/}` 内层变量加引号（SC2295）

## [2.1.0] - 2026-04-26

### Added

- **Restatement Checkpoint 机制**：build 阶段新增周期性上下文刷新，对抗长任务中的注意力衰减
  - 可配置的 `restatement_interval`（默认 3，范围 2–10），每 N 个任务触发一次 Checkpoint
  - 异常触发：Subagent 返回 BLOCKED/NEEDS_CONTEXT/DONE_WITH_CONCERNS 时立即执行
  - 中间会话日志（`sessions/*-interim.md`）支持 `/forge resume` 精确恢复
  - 失败重试 Restatement：TDD GREEN 阶段失败时，重试前强制重申上下文，防止机械重复
  - 轻量路径完全排除 Restatement（改动足够小，无注意力衰减风险）
- **CI 验证范围扩展**：新增 shellcheck 静态分析、`hooks.json` JSON schema 验证、`SKILL.md` frontmatter 完整性检查
- **`install-dist.sh` 路径安全校验**：拒绝空路径和危险系统路径（`/`、`$HOME`、`/usr` 等），防止误操作
- **`init.sh` 增强**：新增 `handoffs/` 目录创建；从模板复制 `metrics.md` 和 `tool-health.md`；hooks 合并失败时提供详细的手动操作指引
- **`state.ts` 受保护区写入提示**：`checkWritePermission` 对 guarded zone 返回追加操作提示，而非静默放行
- **CLAUDE.md 模板新增 §2.5 上下文刷新纪律**：将 Restatement 规则写入项目宪法
- **`config.md` 模板新增 `restatement_interval` 配置项**

### Changed

- **`check-frozen.sh` 重写为 TypeScript 优先**：shell 脚本改为 thin wrapper，优先调用编译后的 `check-frozen.js`；fallback 保留原有 shell 解析逻辑
- **冻结文件保护改为硬阻断**：`check-frozen.sh` 对 locked/approved 文件以 `exit 1` 阻断写入（原先仅打印警告）
- **Hooks 升级**：Write/Edit hook 从 shell 脚本切换到 Node.js 调用；新增 Bash 工具的冻结文件保护 hook
- **CI `sync-dist` 改为 `verify-dist`**：不再自动提交 dist 变更，改为校验失败时报错，要求开发者本地构建后提交
- **`/forge resume` 增强**：优先读取 `*-interim.md` 中间日志恢复上下文；恢复后首次派发 Subagent 前立即执行 Restatement Checkpoint
- **`forge-build` 流程图更新**：标准路径和全量路径流程图增加 Restatement 循环和异常触发分支

### Fixed

- `install-dist.sh` 修复 `--target ""` 空路径导致的潜在危险操作

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
