# 🗺️ Forge 路线图

> 本文档描述 Forge 项目的演进方向，分为短期、中期、长期三个阶段。

---

## v2.1 已完成（2026-04-26）

- ✅ **Forge Loop 自主执行引擎** — 基于 Claude Agent SDK 的自主循环 CLI（`forge-loop`），含纯函数状态机、Git 事务、指数退避 + 熔断器、Worktree 隔离、防休眠、优雅关闭
- ✅ **运行时依赖版本锁定** — `package.json` dependencies 使用精确版本
- ✅ **check-frozen.sh 重写为 TypeScript** — shell thin wrapper + TS 实现，保留 fallback
- ✅ **CI 验证范围扩展** — shellcheck、hooks.json 验证、SKILL.md frontmatter 检查
- ✅ **Restatement Checkpoint 机制** — build 阶段周期性上下文刷新，对抗注意力衰减
- ✅ **冻结文件硬阻断** — check-frozen.sh 对 locked/approved 文件以 exit 1 阻断写入
- ✅ **Hooks 升级** — Write/Edit hook 切换到 Node.js；新增 Bash 工具冻结保护
- ✅ **install-dist.sh 安全加固** — 路径安全校验，拒绝空路径和危险系统路径
- ✅ **init.sh 增强** — handoffs 目录、模板复制、hooks 合并失败时详细指引
- ✅ **CI sync-dist → verify-dist** — 不再自动提交，改为校验失败报错
- ✅ **forge-resume 增强** — 优先读取 interim 日志，恢复后立即执行 Restatement
- ✅ **回滚安全网** — `executeRollback` 执行 `git reset --hard` 前自动 `git stash`，stash 失败不阻断回滚
- ✅ **权限绕过文档化** — `sdk-agent-adapter.ts` 中 `bypassPermissions` 已添加设计决策注释

## v2.1.1 已完成（2026-04-26）

- ✅ **CI Actions 升级至 Node.js 24 运行时** — `actions/checkout` v4→v5、`actions/setup-node` v4→v6
- ✅ **CI 构建 Node.js 版本升级** — 20→22（当前 LTS）
- ✅ **Shellcheck 合规** — 修复 4 个脚本共 7 处 shellcheck 警告

---

## 短期 — v2.2（遗留修复）

v2.1 遗留的审核报告修复项 + 补充加固。

- **context-accumulator 正则 bug 修复**
  - `parseListSection` 中正则转义替换字符串修正（当前替换字符串包含错误的 UUID 值）
  - 新增正则特殊字符标题的解析测试覆盖

- **Forge Loop npm 发包**

  当前 Forge Skills 和 Forge Loop 杂糅在同一个仓库中。Skills 通过分发包（纯 Markdown + Shell）零依赖分发，但 Loop 需要用户克隆仓库、`npm install`、`npx tsc`，体验很重。解决方案：**同一仓库两条分发管线**——Skills 继续走分发包，Loop 走 npm 发包。

  - 将 `forge-loop` 发布到 npm，用户 `npx forge-loop "目标"` 一行即可使用
  - 调整 `package.json`：`private: false`，配置 `files` 字段只发布 `dist/src/` 和运行时依赖
  - CI 新增 npm publish 步骤（tag 触发，如 `v2.2.0`）
  - 不拆仓库，不影响现有分发包流程

  ```
  # 分发包用户（只用 /forge 命令）
  bash install-dist.sh                        # 零依赖，复制即用

  # Loop 用户（自主执行引擎）
  npx forge-loop "修复所有 lint 错误"          # npm 自动下载，自动解析依赖
  ```

---

## 中期 — v2.x（平台改进）

在核心稳定的基础上，提升开发体验和可维护性。

- **Forge Loop × Skills 融合**（核心演进方向）

  当前 Forge Loop（自主执行引擎）和 Forge Skills（`/forge` 交互式命令）是两套割裂的系统。Loop 通过 Agent SDK 启动独立的 Claude Code 会话自主迭代，但会话内部不感知 Forge 的 SKILL 体系、状态目录和路由机制。目标是让两者真正互补：

  - **Loop 驱动 Skills**：Forge Loop 的每轮迭代内部调用 Forge Skills，而非当通用自主循环引擎
    ```
    forge-loop "为用户 API 添加分页功能"
      ├─ 迭代 1: router → 标准路径（自主模式，跳过确认）
      ├─ 迭代 2: plan → 拆解任务（自主模式，跳过确认）
      ├─ 迭代 3: build → 执行任务 1（commit）
      ├─ 迭代 4: build → 执行任务 2（commit）
      ├─ 迭代 5: review → 发现 P0（rollback + 自动重试）
      ├─ 迭代 6: 修复 P0 → review 通过（commit）
      ├─ 迭代 7: test → 验证
      └─ 迭代 8: ship → 默认保留分支
    ```
  - **Skills 双模式运行**：解决 Loop 完全自动化与 Skills 人工确认之间的矛盾。每个 SKILL 支持两种运行模式，通过 `.forge/status.md` 中的 `mode` 字段切换。Loop 启动时写入 `mode: autonomous`，结束时清除。

    | 确认点 | 交互模式（`/forge`） | 自主模式（`forge-loop`） |
    |--------|---------|---------|
    | Router 档位确认 | 等用户确认或覆盖 | 直接采用 AI 建议 |
    | Plan 任务拆解确认 | 等用户确认 | 直接执行 |
    | Build 暂停确认 | 轻量路径每两步暂停 | 不暂停，连续执行 |
    | Review P0/P1 处理 | 提示用户决定 | 自动进入修复循环（熔断上限保护） |
    | Ship 交付方式 | 用户选择 | 默认保留分支（最安全选项） |

    核心逻辑（路由分析、任务拆解、TDD 执行、三层评审、质量门禁）完全复用，只是决策权从"人确认"切换到"预设策略自动决策"。质量保障不降级——review 照常运行，P0 照常触发修复循环，只是不再等人点确认。
  - **状态感知**：Loop 读取 `.forge/status.md` 和 `.forge/plans/*.md`，根据当前阶段决定下一轮调用哪个 SKILL
  - **门禁复用**：Loop 的迭代成功/失败判定复用 Skills 的质量门禁（review P0/P1、test 通过率、ship 三重检查）
  - **分发包可用**：评估将 Loop 核心逻辑（迭代/commit/rollback/熔断）SKILL 化的可行性，使分发包用户也能通过 `/forge loop` 使用自主执行模式

  互补定位：
  | | `/forge`（Skills） | `forge-loop`（Loop） |
  |---|---|---|
  | 驱动方式 | 人在 Claude Code 对话中 | 程序在终端中，无人值守 |
  | 人机协作 | 每个阶段可介入、确认、覆盖 | 只设定目标和约束 |
  | 适用场景 | 需求模糊、需要人类判断 | 目标明确、可自动验证 |
  | Git 事务 | 无（人工管理） | 自动 commit/rollback |
  | 失败处理 | 人工决策 | 指数退避 + 熔断器 |

- **平台抽象层评估**
  - 评估将 Claude Code 特定 API 抽象为通用接口的可行性
  - 降低与单一 AI 平台的耦合度，为多平台支持做准备

- **国际化（i18n）支持**
  - SKILL.md 和用户提示信息的多语言框架
  - 支持中文、英文等主要语言的运行时切换

- **API 文档生成（TypeDoc）**
  - 为 `src/` 下的公开函数和类型生成 API 参考文档
  - 集成到 CI 流水线，保持文档与代码同步

- **可观测性增强**
  - 结构化日志输出（JSON 格式可选）
  - 命令执行耗时统计和性能基线
  - 错误追踪和诊断信息改善

---

## 长期 — v3.0（社区与生态）

面向社区开放，构建可扩展的 AI 编码工作流生态。

- **社区建设**
  - 贡献者指南完善和 issue 模板标准化
  - SKILL 插件机制：支持第三方开发和发布自定义 SKILL
  - 示例项目和最佳实践文档

- **沙箱执行环境**
  - 隔离的任务执行沙箱，限制文件系统和网络访问范围
  - 细粒度的权限控制模型，替代当前的 `bypassPermissions` 方案

- **多 AI 平台支持**
  - 基于平台抽象层，支持 Claude 以外的 AI 编码助手
  - 统一的 Agent 协议适配器
  - 跨平台的状态文件和工作流兼容

---

*本路线图会随项目进展持续更新。具体排期和优先级可能根据社区反馈和实际需求调整。*
