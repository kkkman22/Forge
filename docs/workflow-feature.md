---
title: '工作流示例：新功能开发（标准路径）'
category: reference
audience:
- maintainer
updated: 2026-08-11
owner: forge-maintainers
---

[← 返回索引](./INDEX.md)

# 工作流示例：新功能开发（标准路径）

**项目类型**：Web API（Node.js/Express）
**任务描述**：为用户列表 API 添加分页功能
**涉及文件**：`src/users/controller.ts`、`src/users/pagination.ts`、`test/users/pagination.test.ts`

---

## 背景

当前 `/api/users` 返回全部用户数据。当用户超过 1000 时，响应体过大（>2MB），前端加载缓慢。需要添加 `page` 和 `limit` 查询参数支持分页。

---

## 完整流程

### 阶段 1：plan

**用户输入**：

```bash
/forge 为用户列表 API 添加分页功能
```

**Forge 行为**：
- 分析任务复杂度：影响 3 个文件，有明确需求 → **标准路径**
- 生成 plan：`.forge/plans/user-pagination.md`

**plan 阶段输出摘要**：

```
📋 Plan 生成完成
Task 1: 创建 src/users/pagination.ts（分页逻辑）
Task 2: 修改 src/users/controller.ts（集成分页参数）
Task 3: 创建 test/users/pagination.test.ts（单元测试）

状态：draft → 请审查
```

**目的**：将需求拆解为可执行的原子任务，明确文件映射和依赖关系。

**用户操作**：审查 plan，确认无误后批准（或 Forge 自动批准，视配置而定）。

**状态流转**：plan approved → **自动进入 build**

---

### 阶段 2：build

**Forge 自动执行**（plan 批准后自动进入）

**build 阶段输出摘要**：

```
→ Task 1/3: 创建 pagination.ts ✅
  RED: 测试失败（文件不存在）
  GREEN: 实现分页逻辑（offset/limit 计算）
  REFACTOR: 提取重复计算

→ Task 2/3: 修改 controller.ts ✅
  RED: 测试失败（参数解析未实现）
  GREEN: 添加 page/limit 查询参数解析
  REFACTOR: 统一参数校验

→ Task 3/3: 创建 pagination.test.ts ✅
  RED: 测试失败（功能未完整）
  GREEN: 实现边界条件测试
  REFACTOR: 优化测试结构
```

**目的**：按 plan 逐任务实现，遵循 TDD（RED → GREEN → REFACTOR）。

**做了什么**：
- 创建分页工具函数（计算 offset、limit、总页数）
- 修改控制器解析查询参数并调用分页逻辑
- 编写单元测试覆盖正常/边界/错误场景

**为什么这样做**：TDD 确保每个功能都有测试覆盖，避免实现遗漏边界条件。

**状态流转**：build completed → **自动进入 review**

---

### 阶段 3：review

**Forge 自动执行**（build 成功后自动进入）

**review 阶段输出摘要**：

```
Layer 1 (spec-check)：
  ✅ 分页参数解析实现
  ✅ 边界条件处理（page < 1, limit > 100）
  ✅ 响应格式含 total/pages/currentPage

Layer 2 (quality-check)：
  ✅ 命名规范（page/limit/offset）
  ✅ 错误处理（400 Bad Request 参数无效）
  ⚠️ P2: pagination.ts 第 42 行可提取为常量

Layer 3 (security-check)：
  ✅ 无 SQL 注入（参数转数字后使用）
  ✅ limit 上限 100 防止 DoS
  ✅ 无硬编码密钥

结论：无 P0/P1，通过（1 个 P2 建议）
```

**目的**：三层评审确认实现完整、代码质量合格、无安全隐患。

**状态流转**：review 通过 → **自动进入 test**

---

### 阶段 4：test

**Forge 自动执行**（review 通过后自动进入）

**test 阶段输出摘要**：

```
npm run check
  → tsc --noEmit ✅
  → biome check src/ test/ ✅
  → vitest run ✅

全部通过 ✅
```

**目的**：运行完整验证套件，确保代码类型正确、格式合规、测试通过。

**状态流转**：test 通过 → **自动进入 ship**

---

### 阶段 5：ship

**Forge 自动执行**（test 通过后自动进入）

**ship 阶段输出摘要**：

```
🚪 Ship 门禁检查
  ✅ 分支不是 main
  ✅ 所有 plan 任务完成
  ✅ review 无 P0/P1
  ✅ test 通过

📦 交付选项：
  1. 直接合并到 main
  2. 创建 PR（推荐）
  3. 继续在此分支迭代
  4. 归档放弃
```

**目的**：最终检查 + 提供交付选项。

**用户选择**：选项 2（创建 PR）

**输出**：

```
✅ 分支已推送：feature/user-pagination
🔗 PR 链接：https://github.com/.../pull/123
📊 变更统计：+180 -20 行，3 个文件
```

---

## 失败恢复场景

### 场景：test 阶段 biome 检查失败

**假设**：build 完成后，代码功能正确但 biome 格式检查未通过（缺少分号）。

**系统提示**：

```
🚫 test 未通过
biome check src/ test/ — 1 个错误
  src/users/pagination.ts:15:3 — 缺少分号

修复后运行：/forge test
```

**用户修复操作**：

```bash
# 手动修复或运行
npm run lint:fix

/forge test
```

**重新执行 test**：

```
npm run check — 全部通过 ✅
→ 自动进入 ship
```

---

## 自动推进 vs 用户介入

| 阶段 | 结果 | 行为 |
|------|------|------|
| plan | 批准 | **自动进入 build** |
| build | 成功 | **自动进入 review** |
| review | 通过 | **自动进入 test** |
| test | 通过 | **自动进入 ship** |
| test | 失败 | **停止，提示修复后重跑 test** |
| ship | 完成 | **结束，用户选择交付方式** |

---

## 最终状态

- `src/users/pagination.ts`：分页工具函数
- `src/users/controller.ts`：集成分页参数
- `test/users/pagination.test.ts`：单元测试
- 提交：3 个原子提交
- PR：feature/user-pagination → main
