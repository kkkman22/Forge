[← 返回索引](./INDEX.md)

# 工作流示例：复杂需求（全量路径）

**项目类型**：SaaS 平台（多租户架构）
**任务描述**：设计并实现租户隔离的数据访问层
**涉及文件**：`src/tenant/`（新建目录，~8 个文件）

---

## 背景

当前系统所有租户共享数据库，通过 `tenant_id` 字段区分。随着客户增长，需要：
- 更强的数据隔离保证（防止跨租户数据泄漏）
- 按租户的数据库连接池管理
- 支持租户级数据库迁移

这是一个架构级别的变更，涉及技术选型、安全评估、实现方案。需求描述较模糊，需要逐步细化。

---

## 完整流程

### 阶段 1：decide

**用户输入**：

```bash
/forge --tier=full 设计租户隔离的数据访问层
```

**Forge 行为**：
- 分析任务复杂度：新架构/数据库变更/安全影响 → **全量路径**
- 启动四视角决策 Subagent

**decide 阶段输出摘要**：

```
🔍 四视角分析

产品视角：
  → 影响：所有租户数据操作
  → 建议：渐进式迁移，支持回滚

架构视角：
  → 方案 A：行级安全（RLS）— 改动小，隔离弱
  → 方案 B：Schema 级隔离 — 改动中，隔离强
  → 方案 C：数据库级隔离 — 改动大，隔离最强
  → 建议：方案 B（平衡实施成本与隔离强度）

安全视角：
  → 风险：迁移期间的数据泄漏窗口
  → 缓解：蓝绿部署，迁移前全量备份

设计视角：
  → 无 UI 影响（纯后端变更）

📋 ADR-0042 生成：选择 Schema 级租户隔离
```

**目的**：在投入实现前，从多视角审视方案，降低架构风险。

**用户操作**：审查 ADR，确认方案 B 可接受。

**状态流转**：decide 完成 → **自动进入 spec**

---

### 阶段 2：spec

**Forge 自动执行**（decide 完成后自动进入）

**spec 阶段输出摘要**：

```
📋 Spec 锁定完成：.forge/specs/tenant-isolation/spec.md

需求：
  R1: 每个租户独立 PostgreSQL Schema
  R2: 连接池按租户隔离
  R3: 查询自动附加 tenant schema 前缀
  R4: 迁移脚本支持多 schema
  R5: 现有数据零停机迁移

设计决策：
  → Schema-per-tenant 架构
  → Knex.js 迁移工具扩展
  → 中间件自动注入 tenant context
```

**目的**：将模糊需求固化为可锁定的规格文档，明确验收标准。

**锁定机制**：spec 锁定后进入冻结区，AI 不可修改。

**状态流转**：spec locked → **自动进入 plan**

---

### 阶段 3：plan

**Forge 自动执行**（spec 锁定后自动进入）

**plan 阶段输出摘要**：

```
📋 Plan 生成完成：.forge/plans/tenant-isolation.md

Wave 1: 基础设施
  Task 1: 创建 src/tenant/connection-pool.ts（按租户连接池）
  Task 2: 创建 src/tenant/context.ts（租户上下文中间件）

Wave 2: 数据访问
  Task 3: 创建 src/tenant/query-builder.ts（自动 schema 前缀）
  Task 4: 修改 src/models/*.ts（迁移到新的查询构建器）

Wave 3: 迁移工具
  Task 5: 扩展 knex 迁移支持多 schema
  Task 6: 创建迁移脚本（零停机策略）

Wave 4: 测试与验证
  Task 7: 创建 test/tenant/isolation.test.ts（跨租户泄漏测试）
  Task 8: 创建 test/tenant/migration.test.ts（迁移正确性测试）

状态：draft → 请审查
```

**目的**：将 spec 拆解为可执行的原子任务，按依赖排序。

**用户操作**：审查 plan，确认任务粒度合理。

**状态流转**：plan approved → **自动进入 build**

---

### 阶段 4-7：build → review → test → ship

**与标准路径相同**，但任务更多、周期更长。

**build 阶段特点**：
- 使用 Subagent 并行执行独立任务（Wave 1 的 Task 1/2 可并行）
- 每 3 个任务执行 Restatement Checkpoint（重读 plan 和 progress）
- 依赖 DAG 调度：Task 3 依赖 Task 1/2 完成后才开始

**review 阶段特点**：
- 安全评审特别关注跨租户数据隔离
- property-based test 验证随机租户 ID 组合下无泄漏

**test 阶段特点**：
- 包含集成测试（真实数据库多 schema）
- 迁移脚本在测试数据库上完整演练

**ship 阶段特点**：
- 建议选择"创建 PR"（架构变更需人工审查）
- PR 描述自动包含 ADR 链接和迁移计划

---

### 阶段 8：learn

**Forge 自动执行**（ship 完成后自动进入，仅全量路径）

**learn 阶段输出摘要**：

```
🧠 知识沉淀

问题模式：
  → Schema 级迁移的 Knex.js 集成文档稀缺

解决方案：
  → 使用 knex.raw('SET search_path TO ?', [schemaName])

踩坑记录：
  → 假设：knex 原生支持多 schema 迁移
  → 实际：需自定义迁移目录和锁表策略

决策理由：
  → 选择 Schema 而非数据库隔离：实施成本 vs 隔离强度

可复用模式：
  → 租户上下文中间件可作为通用模式提取
```

**输出**：`.forge/knowledge/solutions/tenant-isolation.md`

**目的**：从本次开发中提取经验，供 future plan 自动引用。

---

## 自动推进 vs 用户介入

| 阶段 | 结果 | 行为 |
|------|------|------|
| decide | 完成 | **自动进入 spec** |
| spec | 锁定 | **自动进入 plan** |
| plan | 批准 | **自动进入 build** |
| build | 成功 | **自动进入 review** |
| review | 通过 | **自动进入 test** |
| test | 通过 | **自动进入 ship** |
| ship | 完成 | **自动进入 learn** |
| learn | 完成 | **结束** |

**用户介入点**：
- decide 后：审查 ADR
- spec 后：确认需求覆盖
- plan 后：批准 plan
- ship 时：选择交付方式

---

## 最终状态

- ADR：`.forge/decisions/ADR-0042-tenant-isolation.md`
- Spec：`.forge/specs/tenant-isolation/spec.md`
- Plan：`.forge/plans/tenant-isolation.md`
- 代码：`src/tenant/`（8 个新文件）
- 测试：`test/tenant/`（2 个测试文件）
- 知识：`.forge/knowledge/solutions/tenant-isolation.md`
- PR：feature/tenant-isolation → main
