# 🗺️ Forge 路线图

> 本文档描述 Forge 项目的演进方向，分为短期、中期、长期三个阶段。

---

## v2.1 已完成（2026-04-26）

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

---

## 短期 — v2.2（遗留修复）

v2.1 遗留的审核报告修复项 + 补充加固。

- **context-accumulator 正则 bug 修复**
  - `parseListSection` 中正则转义替换字符串修正
  - 新增正则特殊字符标题的解析测试覆盖

- **回滚安全网（git stash before reset）**
  - `executeRollback` 执行破坏性操作前自动 `git stash --include-untracked`
  - stash 失败不阻断回滚流程，日志记录操作结果

- **权限绕过文档化**
  - `sdk-agent-adapter.ts` 中 `bypassPermissions` 的设计决策注释
  - 说明上层保护机制（hooks、冻结区、状态门禁）的职责分工

---

## 中期 — v2.x（平台改进）

在核心稳定的基础上，提升开发体验和可维护性。

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
