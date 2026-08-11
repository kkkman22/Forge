---
feature: build-discipline-enhancement
layout: design
created: 2026-05-01
---

# Design Document: Build Discipline Enhancement

## Overview

在 forge-build SKILL.md 中增加 6 项工程纪律规则，整合自 addyosmani/agent-skills 多个独立 skill 的最佳实践。纯 Markdown 内容改动。

## Architecture

无架构变更。仅修改 `skills/forge-build/SKILL.md`。

## Components and Interfaces

### 1. §4.1 Simplicity Check（TDD Iron Rules 后）

```markdown
### 4.1 Simplicity Check

GREEN 阶段的代码必须是"能让测试通过的最简单实现"。如果你在 GREEN 阶段引入了抽象层、工厂模式或配置驱动的设计——停下来，删掉，写更简单的版本。

REFACTOR 阶段才是引入抽象的时机，且仅当同一模式重复出现 3 次以上时。

**简洁性检查**：
✗ 为一个通知场景构建通用 EventBus + 中间件管线
✓ 直接函数调用

✗ 为两个相似组件构建抽象工厂
✓ 两个直接的组件 + 共享工具函数

✗ 为三个表单构建配置驱动的表单生成器
✓ 三个表单组件

三行相似的代码好过一个过早的抽象。先实现朴素的、显然正确的版本。
```

### 2. §6.6 Change Summary（Execution Discipline 新增）

```markdown
### 6.6 Change Summary

每个 Subagent 在原子提交前，必须输出三段式变更摘要：

📝 Task N 变更摘要
  变更：<文件列表 + 每个文件的变更描述>
  未触碰（有意）：<注意到但不在范围内的问题>
  关注点：<需要用户确认的决策>

"未触碰"部分证明范围纪律——它表明 Agent 注意到了相邻问题但选择不修复。
"关注点"部分在 autonomous 模式下记录到 findings，interactive 模式下等待用户确认。

此摘要属于 Structured_Output，豁免于散文压缩规则。
```

### 3. Source-Driven 规则（§3.2 Subagent Instruction Construction 追加）

在 §3.2 的 Subagent 指令构造 9 项列表后追加第 10 项：

```markdown
(10) Framework API 验证：当任务涉及框架特定 API（React hooks、Express middleware、Prisma query 等）时，Subagent 应先验证 API 签名与项目 package.json 中的依赖版本一致，不依赖训练数据记忆。对于非平凡 API 或不确定当前版本签名时，应查阅官方文档确认。
```

### 4. Chesterton's Fence（Reflection Triggers 表追加）

在 Reflection Triggers 表中追加一行：

```markdown
| 删除或大幅修改现有代码 | 我理解这段代码为什么被写成这样吗？git blame 的上下文是什么？ | 解释原因后确认修改 | 记录到 findings（原因 + 修改理由），继续执行 |
```

### 5. §6.7 Dependency Discipline（Execution Discipline 新增）

```markdown
### 6.7 Dependency Discipline

添加新依赖前必须确认以下 4 项：

1. **现有技术栈是否已能解决**：优先使用标准库和项目已有工具
2. **依赖大小**：检查 bundle 影响（`npm pack --dry-run` 或等效命令）
3. **是否活跃维护**：检查最近 commit 时间、open issues 数量
4. **许可证兼容性**：必须与项目许可证兼容

规则：每个依赖都是负债。不添加依赖是默认选择，添加依赖需要理由。
```

### 6. Dead Code Hygiene（§4 TDD REFACTOR 步骤追加）

在 REFACTOR 阶段描述中追加：

```markdown
REFACTOR 完成后，扫描是否产生了孤儿代码：
- 未使用的 import
- 未调用的函数或方法
- 未引用的类型定义
- 未使用的变量

发现孤儿代码时记录到 `.forge/findings/<topic>.md`，不自行删除——删除需要确认代码确实不再被需要。
```

## Testing Strategy

- contract.test.ts：验证 forge-build SKILL.md frontmatter 格式未变
- 人工审查：确认 6 项新增内容与现有 §6 Anti-drift Execution Guardrails 不重复
- `npm run check`：全量测试通过
