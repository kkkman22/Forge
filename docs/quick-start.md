---
title: 'Forge 快速入门指南'
category: getting-started
audience:
- maintainer
updated: 2026-06-22
owner: forge-maintainers
---

[← 返回索引](./INDEX.md) | [English Version](./quick-start.en.md)

# Forge 快速入门指南

## 前置条件

- **Claude Code** ≥ 2.1.163
  - 检查：`claude --version`
- **Node.js** ≥ 20（仅 Forge Loop 需要）
  - 检查：`node --version`

预计时间：**5 分钟**

---

## 5 步上手

### 步骤 1：安装 Forge

选择以下三种方式之一：

#### 方式一：Plugin 安装（推荐）

```bash
claude plugin marketplace add https://github.com/kkkman22/Forge
claude plugin install forge
```

> 安装后 `/forge` 及子命令立即可用。

#### 方式二：直接克隆（Forge Loop 开发者）

```bash
git clone https://github.com/kkkman22/Forge.git ~/.claude/skills/forge
```

> 如需 Forge Loop，额外执行 `npm install && npx tsc`。

#### 方式三：分发包安装（企业内网）

```bash
git clone https://github.com/kkkman22/Forge.git /tmp/forge
bash /tmp/forge/scripts/build-dist.sh
bash /tmp/forge/scripts/install-dist.sh
```

> 只含 `/forge` 命令，不含 Forge Loop。

### 步骤 2：初始化项目

在项目根目录执行：

```bash
/forge init
```

> Plugin 用户使用 `/forge init`，clone 用户也可使用 `bash forge/scripts/init.sh`，两者等价。
> 在 Claude Code 内，`/forge init` 会通过 AskUserQuestion 逐项采集项目名/技术栈/安全级别等配置；
> 终端用户直接 `bash scripts/init.sh` 则走原生 `read` 交互，也支持 `--name`/`--stack`/`--security`
> 等 flags 实现完全非交互（CI 友好）。详见 `scripts/init.sh --help`。
> 预期输出：`.forge/` 目录创建完成，包含 `config.md` 和 `status.md`。

### 步骤 3：验证安装

```bash
/forge status
```

> 预期输出：显示当前任务状态为 `"completed"`，无进行中任务。

### 步骤 4：第一次使用（轻量路径示例）

修复一个简单的 bug：

```bash
/forge 修复 README 中的拼写错误
```

> Forge 自动选择轻量路径 `build → review`，完成后提示修复结果。

### 步骤 5：第一次完整交付（标准路径示例）

开发一个小功能：

```bash
/forge 为 package.json 添加一个 description 字段
```

> Forge 自动选择标准路径 `plan → build → review → test → ship`，逐阶段执行并自动推进。

---

## 端到端示例

### 示例 1：轻量路径 — Bug 修复

```bash
# 用户输入
/forge 修复用户列表页面排序 bug

# Forge 输出摘要
# → 分析任务复杂度：轻量路径
# → 执行 build：修改 src/user-list.ts（1 文件，3 行）
# → 执行 review：无 P0/P1，通过
# → 完成，提示提交信息
```

### 示例 2：标准路径 — 新功能

```bash
# 用户输入
/forge 为用户 API 添加分页参数

# Forge 输出摘要
# → 分析任务复杂度：标准路径
# → 执行 plan：生成 .forge/plans/pagination.md
# → 执行 build：创建 src/pagination.ts + test/pagination.test.ts
# → 执行 review：三层评审通过
# → 执行 test：npm run check 通过
# → 执行 ship：提示合并选项
```

---

## 故障排除

### 场景 1：Claude Code 版本过低

**现象**：`/forge` 命令返回 "Unknown skill" 或报错。

**原因**：Claude Code 版本低于 2.1.121，不支持 Skill 系统。

**解决**：

```bash
claude update
# 或重新安装
npm install -g @anthropics/claude-code
```

### 场景 2：初始化脚本权限问题

**现象**：`bash: ~/.claude/skills/forge/scripts/init.sh: Permission denied`

**原因**：克隆后脚本没有执行权限。

**解决**：

```bash
chmod +x ~/.claude/skills/forge/scripts/init.sh
bash ~/.claude/skills/forge/scripts/init.sh
```

### 场景 3：`/forge` 命令未识别

**现象**：输入 `/forge` 后无响应或报错。

**原因**：安装路径不在 Claude Code 的 Skill 搜索路径中。

**解决**：

```bash
# 检查安装路径
ls ~/.claude/skills/forge/skills/forge/SKILL.md

# 如不存在，重新克隆到正确位置
git clone https://github.com/kkkman22/Forge.git ~/.claude/skills/forge
```

---

## 下一步

根据你的使用意图选择引导路径：

- **[初次接触者 → onboarding-beginner.md](./onboarding-beginner.md)** — 了解 Forge 基本概念和常用命令
- **[日常开发者 → onboarding-daily.md](./onboarding-daily.md)** — 掌握标准工作流的每个阶段
- **[高级用户 → onboarding-advanced.md](./onboarding-advanced.md)** — 深入全量路径、知识系统和贡献指南
