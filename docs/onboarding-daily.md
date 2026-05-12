[← 返回索引](./INDEX.md) | [English Version](./onboarding-daily.en.md)

# Forge 日常开发者引导

> **预计学习时间**：~20 分钟
> **前置知识**：已阅读 [quick-start.md](./quick-start.md)，了解 Forge 基本概念

---

## 你是日常开发者吗？

如果你符合以下描述，这条路线适合你：

- 已用过 `/forge` 完成过几次任务
- 需要理解 Forge 工作流的每个阶段在做什么
- 希望掌握标准路径（plan → build → review → test → ship）的完整流程

---

## 标准路径总览

```
用户描述任务
    │
    ▼
plan ──→ build ──→ review ──→ test ──→ ship
  ↑                                    │
  └────── 失败时循环修复 ←─────────────┘
```

标准路径适用于：新功能开发、已知范围的重构、有明确需求的改进。

---

## 各阶段详解

### 1. plan — 规划

**目的**：将需求拆解为可执行的原子任务。

**关键命令**：

```bash
# 自动规划（从描述开始）
/forge 为用户 API 添加分页功能

# 或直接调用 plan
/forge plan
```

**状态流转**：

| 状态 | 含义 | 下一步 |
|------|------|--------|
| `draft` | 计划初稿，待批准 | 用户审查并批准 |
| `approved` | 计划已批准，可执行 | 自动进入 build |

**输出文件**：`.forge/plans/<topic>.md`

**内容**：任务列表、文件映射、依赖关系、验收标准。

---

### 2. build — 执行

**目的**：按 plan 逐任务实现代码，遵循 TDD。

**关键命令**：

```bash
/forge build
```

**状态流转**：

| 状态 | 含义 | 下一步 |
|------|------|--------|
| `in_progress` | 正在执行任务 | 继续执行 |
| `completed` | 所有任务完成 | 自动进入 review |

**约束**：
- 测试先于代码（RED → GREEN → REFACTOR）
- 每任务原子提交
- 任务之间不停下来询问用户
- 同一修复连续失败 3 次 → 进入 debug

---

### 3. review — 评审

**目的**：三层独立评审确保代码质量和安全。

**关键命令**：

```bash
/forge review
```

**状态流转**：

| 结果 | 含义 | 下一步 |
|------|------|--------|
| 通过（无 P0/P1） | 代码质量合格 | 自动进入 test |
| 未通过 | 存在阻塞问题 | 停止，提示修复后重跑 review |

**输出文件**：`.forge/reviews/<topic>.md`

---

### 4. test — 测试

**目的**：运行完整验证套件。

**关键命令**：

```bash
# Forge 自动运行
/forge test

# 或在 ship 前手动运行
npm run check    # tsc + biome + vitest + 脚本检查
```

**状态流转**：

| 结果 | 含义 | 下一步 |
|------|------|--------|
| 通过 | 所有检查绿 | 自动进入 ship |
| 失败 | 测试或 lint 未通过 | 停止，提示修复后重跑 test |

---

### 5. ship — 交付

**目的**：完成最终检查，提供合并选项。

**关键命令**：

```bash
/forge ship
```

**交付选项**：

| 选项 | 行为 |
|------|------|
| 直接合并 | `git merge` 到 main |
| 创建 PR | 推送分支，提供 PR 链接 |
| 继续迭代 | 保持分支，后续继续开发 |
| 归档放弃 | 清理分支，保留记录 |

**状态流转**：
- ship 完成后，任务标记为 `completed`
- 全量路径自动进入 `learn` 阶段

---

## 阶段间自动推进

Forge 在阶段**成功**后自动进入下一阶段，**不需要你确认**。

```
plan (approved) ──自动──→ build ──自动──→ review (通过) ──自动──→ test (通过) ──自动──→ ship
```

**唯一会停下来的时候**：
- review 未通过 → 显示问题清单，提示修复后重跑 `/forge review`
- test 失败 → 显示失败详情，提示修复后重跑 `/forge test`
- 连续失败 3 次 → 进入 `/forge debug`

---

## 实操练习：完成一次标准路径

### 目标

使用 Forge 的标准路径为项目添加一个工具函数。

### 起始状态

- Forge 已安装且项目已初始化
- 当前在功能分支（非 main）

### 操作步骤

1. **描述任务**

   ```bash
   /forge 添加一个字符串截断函数，限制长度并添加省略号
   ```

2. **审查 Plan**
   - Forge 生成 plan，显示任务列表
   - 确认无误后批准（如需要）

3. **观察 Build**
   - Forge 自动执行 build
   - 每任务完成后输出一行摘要

4. **Review 结果**
   - 查看三层评审报告
   - 如有 P0/P1，按提示修复

5. **Test 验证**
   - Forge 自动运行 `npm run check`
   - 确认全部通过

6. **Ship 交付**
   - 选择交付方式（建议：创建 PR）

### 预期结果

- 新文件 `src/truncate.ts` 和 `test/truncate.test.ts`
- 所有测试通过
- 产生 2-3 个原子提交
- review 无 P0/P1

---

## 继续学习

- **[高级用户路线 → onboarding-advanced.md](./onboarding-advanced.md)** — 学习全量路径和知识系统
- **[工作流示例 → workflow-feature.md](./workflow-feature.md)** — 查看标准路径完整示例
