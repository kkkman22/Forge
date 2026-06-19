---
title: 'Forge 初次接触者引导'
category: reference
audience:
- maintainer
updated: 2026-06-19
owner: forge-maintainers
---

[← 返回索引](./INDEX.md) | [English Version](./onboarding-beginner.en.md)

# Forge 初次接触者引导

> **预计学习时间**：~15 分钟
> **前置知识**：基本命令行操作、Git 基础概念

---

## 你是初次接触者吗？

如果你符合以下描述，这条路线适合你：

- 第一次听说 Forge，不确定它是什么
- 已经安装 Forge，但只用过 `/forge status`
- 想理解 Forge 如何帮助日常开发，但不需要立即掌握全部功能

---

## 核心概念

### 三维路由

Forge 根据任务特征自动选择执行路径，从三个维度分析：

| 维度 | 说明 | 例子 |
|------|------|------|
| **复杂度** | 任务多大？ | 改 1 行代码 vs 搭建新服务 |
| **任务类型** | 什么性质的工作？ | 前端 / 后端 / 文档 / 基础设施 |
| **项目阶段** | 项目处于什么阶段？ | 新项目 / 迭代维护 / Bug 修复 |

三维路由的结果是 Forge 为你选择**轻量、标准、全量**三条路径之一。

### TDD 流程

TDD = Test-Driven Development（测试驱动开发）。Forge 的 build 阶段强制遵循：

1. **RED**：先写测试，运行，看到测试失败
2. **GREEN**：写最少代码让测试通过
3. **REFACTOR**：优化代码，保持测试通过

> Forge 的 `build` 阶段会检查：如果代码先于测试编写，必须删除代码从测试重新开始。

---

## 最常用 3 个命令

### 1. `/forge` — 入口与路由

**作用**：分析你的任务描述，自动选择执行路径。

**语法**：

```bash
/forge <任务描述> [--tier=light|standard|full]
```

**示例**：

```bash
# 自动判断
/forge 修复登录页面样式错位

# 强制使用轻量路径
/forge --tier=light 修复登录页面样式错位
```

**输出**：显示建议的档位和命令序列。

### 2. `/forge build` — 执行实现

**作用**：按批准的 plan 逐任务实现代码。

**语法**：

```bash
/forge build
```

**行为**：
- 读取 `.forge/plans/*.md`
- 按任务列表逐个执行
- 每任务完成后原子提交
- 自动推进到 review（标准/全量路径）

**示例场景**：

```bash
# Plan 已批准，开始实现
/forge build

# 输出摘要示例：
# → Task 1/5: 创建用户模型 ✅
# → Task 2/5: 添加登录接口 ✅
# → Task 3/5: 实现密码哈希 ...
```

### 3. `/forge review` — 代码评审

**作用**：三层独立评审确保代码质量。

**语法**：

```bash
/forge review
```

**三层评审**：

| 层级 | 检查内容 | 评审者 |
|------|---------|--------|
| 1. Spec 对齐 | 是否实现了 plan 中的所有需求 | spec-check agent |
| 2. 质量 | 命名、错误处理、性能、重复代码 | quality-check agent |
| 3. 安全 | 硬编码密钥、注入风险、权限边界 | security-check agent |

**结果**：
- P0/P1 finding → 阻断，必须修复
- P2/P3 finding → 建议，可协商

---

## 实操练习：完成你的第一个 Forge 任务

### 目标

使用 Forge 的轻量路径修复一个拼写错误。

### 起始状态

- Forge 已安装（参见 [quick-start.md](./quick-start.md)）
- 当前在项目根目录
- 项目已初始化（`.forge/` 存在）

### 操作步骤

1. **在 README.md 中故意引入一个拼写错误**

   ```bash
   # 手动编辑 README.md，将 "Forge" 改为 "Forg"
   ```

2. **运行 Forge 轻量路径**

   ```bash
   /forge 修复 README 中的拼写错误
   ```

3. **观察 Forge 的行为**
   - 自动选择轻量路径
   - 执行 build：找到并修复错误
   - 执行 review：检查修改
   - 提示提交信息

4. **验证修复**

   ```bash
   git diff HEAD~1
   ```

### 预期结果

- README.md 中的拼写错误被修正
- 产生一个原子提交，提交信息格式为 `fix(readme): ...`
- 无 P0/P1 finding

---

## 继续学习

掌握以上 3 个命令后，你已能使用 Forge 处理日常小任务。下一步：

- **[日常开发者路线 → onboarding-daily.md](./onboarding-daily.md)** — 学习标准工作流的完整阶段
- **[命令速查 → reference-commands.md](./reference-commands.md)** — 查看全部 <!-- ssot:begin topic=commands render=count -->38<!-- ssot:end topic=commands --> 个命令
