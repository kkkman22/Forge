---
feature: project-charter
layout: design
created: 2026-06-04
---

# Design Document: Project Charter

## 一、为什么需要 Charter

### 问题场景

```
Week 1: /forge decide → ADR-001: "使用 REST API，所有端点加 /api/v1 前缀"
Week 3: /forge decide → ADR-005: "引入 GraphQL 用于复杂查询场景"
Week 6: /forge decide → ADR-009: "前端直接调用数据库（绕过 API 层）以提升性能"

ADR-001 和 ADR-005 有张力但没有机制发现。
ADR-009 直接违反了 ADR-001 的架构边界但没有人注意到。
```

**根本原因**：每个 ADR 是独立的，没有跨决策的一致性锚定。Charter 就是这个锚定物。

### Charter vs ADR vs CLAUDE.md 的边界

| 文档 | 职责 | 变更频率 | 谁维护 |
|------|------|---------|--------|
| `CLAUDE.md` | AI 行为准则（铁律、纪律、流程） | 极低（宪法级） | 维护者 |
| `.tinkerman/charter.md` | 工程策略锚定（约束、边界、基线） | 低（季度级） | 团队 |
| `.tinkerman/decisions/*.md` | 单次架构决策 | 中（每 feature 1–2 次） | AI + 用户 |
| `.tinkerman/specs/*/spec.md` | 功能需求规格 | 高（每 feature） | AI + 用户 |

Charter 是 CLAUDE.md（行为纪律）和 ADR（具体决策）之间的桥梁——它记录**策略方向**，ADR 记录**具体选择**。

---

## 二、Charter 模板

```markdown
---
name: my-project
created: "2026-06-04"
updated: "2026-06-04"
version: "1.0.0"
status: active
---

# My Project — 项目宪章

## 核心问题

> 用 1–3 句话描述本项目要解决的工程问题。
> 例：本系统为电商平台提供实时库存管理，解决多仓库、多渠道场景下的库存一致性
> 和超卖防护问题。

## 架构边界

### 模块划分

- **API 层**：对外 HTTP 接口，负责认证、限流、请求验证
- **业务层**：核心业务逻辑，不依赖具体传输协议
- **数据层**：通过 Repository Pattern 访问，禁止上层直接写 SQL

### 模块间通信契约

- API 层 ↔ 业务层：同步函数调用，输入/输出使用 DTO
- 业务层 ↔ 数据层：Repository 接口，返回 domain entity
- 禁止：API 层直接访问数据层

## 技术选型基线

- **语言**：TypeScript (strict mode)
- **运行时**：Node.js 20+
- **框架**：Hono (API) + React (前端)
- **数据库**：PostgreSQL 16 (通过 Drizzle ORM)
- **测试**：Vitest + Playwright
- **CI**：GitHub Actions
- **包管理**：pnpm

## 不可变量（Invariants）

### INV-001: TypeScript Strict Mode
- **规则**：所有 `.ts` 文件必须启用 `strict: true`，禁止 `any`、`@ts-ignore`
- **理由**：类型安全是本项目的核心工程约束，影响运行时正确性
- **违反后果**：CI 红灯阻断合并

### INV-002: API Versioning
- **规则**：所有外部 API 端点必须以 `/api/v{N}/` 开头
- **理由**：多端（Web、Mobile、第三方）消费 API，breaking change 必须可控
- **违反后果**：前端或移动端可能出现不兼容的运行时错误

### INV-003: No Direct Database Access
- **规则**：业务层和数据层之外不得直接执行 SQL 或访问 ORM
- **理由**：集中管理数据访问逻辑，确保审计、缓存、权限策略的一致性
- **违反后果**：数据一致性风险，难以追踪数据流

（最多 8 条 invariants，超过 8 条说明项目需要拆分）

## 约定与偏好（可选）

- 命名：文件名 kebab-case，类名 PascalCase，函数/变量 camelCase
- 测试：每个公开函数至少一个 happy path + 一个 error path 测试
- 错误处理：使用 Result type，禁止裸 throw
- 日志：结构化 JSON 日志，使用 correlation ID

## 已知的未来变化（可选）

- [ ] 考虑从 REST 迁移到 tRPC（等待前端团队评估）
- [ ] 可能引入 Redis 做缓存层（等待性能基准测试）

## 排除范围（可选）

- 本项目不处理支付流程（由 Payment Service 负责）
- 本项目不做 SEO（由专门的 BFF 层负责）

## 变更日志

| 日期 | 版本 | 变更 | 触发 |
|------|------|------|------|
| 2026-06-04 | 1.0.0 | 初始创建 | /forge charter init |
```

---

## 三、变更剧本

### 剧本 A — Charter 阻止架构 drift

**pre-change**：

```
/forge decide "加一个直接查数据库的性能优化接口"
→ 5 个 reviewer 分析 trade-offs
→ ADR-012 产出："批准，增加 /api/internal/performance 直接查 DB"
→ code merged

Week 8: 发现 3 处绕过 repository pattern 的代码，数据一致性被破坏
```

**change**（charter 落地后）：

```
/forge decide "加一个直接查数据库的性能优化接口"
→ decide agent 读取 .tinkerman/charter.md
→ 发现 INV-003: "No Direct Database Access"
→ 产品视角输出："⚠ Charter 冲突：此决策违反 INV-003"
→ 显式询问用户：
    (A) 修改 charter（更新 invariant，接受直接 DB 访问）
    (B) 修改方案（通过 repository pattern 实现性能优化）
    (C) 标记为例外（记录理由）
→ 用户选择 (B)，决策在 charter 边界内完成
```

### 剧本 B — `/forge charter check` 在 CI 中运行

**pre-change**：没有任何自动化机制检测 invariant 违规。

**change**：

```bash
# CI pipeline
- name: Charter Compliance
  run: claude --skill forge:charter check
  # 输出:
  # ✅ INV-001: TypeScript strict mode — no violations
  # ✅ INV-002: API versioning — no violations
  # ❌ INV-003: No direct DB access — found 2 violations:
  #   - src/services/analytics.ts:42 (raw SQL query)
  #   - src/utils/report.ts:15 (direct ORM access)
  # Exit code: 1 → CI 红
```

### 剧本 C — `/forge spec` 自动对齐 charter

**pre-change**：spec 独立编写，可能包含与 charter 矛盾的需求。

**change**：

```
/forge spec "用户导出功能"
→ spec agent 读取 charter
→ spec 文档中自动增加：
  ## Charter 合规性
  - R1 (数据导出 API) → INV-002 (API versioning): ✅ 使用 /api/v1/export
  - R3 (批量导出) → INV-003 (No direct DB): ⚠ 需通过 ExportRepository
→ 用户在 spec 阶段就能看到潜在冲突
```

---

## 四、Blueprint Delta

### 新增文件

| 路径 | 用途 |
|------|------|
| `.tinkerman/charter.md` | 项目宪章文件（用户创建） |
| `skills/forge-charter/SKILL.md` | charter 命令 skill 定义 |

### 修改文件

| 路径 | 改动 |
|------|------|
| `skills/forge/SKILL.md` | router 增加 `charter` 子命令路由 |
| `.claude/agents/forge-decide-lead.md` 或 decide skill | 增加 charter grounding read |
| `.claude/agents/spec-check.md` | 增加 charter compliance 检查维度 |
| `skills/forge-spec/SKILL.md` 或 spec skill | 增加 charter 合规性章节 |
| `skills/forge-plan/SKILL.md` 或 plan skill | 增加 charter boundary 自检 |
| `skills/forge-init/SKILL.md` 或 init script | 增加 charter 创建选项 |
| `CLAUDE.md` | §2 增加 charter 相关说明 |

### 文件数净变化

- 新增：2 个（1 skill + charter 模板）
- 修改：7 个
- 删除：0 个

---

## 五、Grounding Read 的实现策略

### 方案：在 skill dispatch 时注入 charter 摘要

```
/forge decide "是否引入缓存层"
  ↓
router 读取 .tinkerman/charter.md
  ↓ 如果存在且 status: active
提取摘要：
  - 核心问题（1 句话）
  - 架构边界（模块列表 + 通信契约）
  - Invariants（ID + 标题）
  ↓
注入到 agent prompt 的 system context 中：
  "项目宪章约束：
   - 核心问题：实时库存管理
   - 架构边界：API层→业务层→数据层，禁止跨层
   - INV-001: TypeScript strict
   - INV-003: No direct DB access
   请评估此决策是否与以上约束冲突。"
  ↓
正常执行 decide 流程
```

**关键约束**：注入内容 ≤500 tokens（charter 150 行的摘要约 300–500 tokens）。如果 charter 过长，只注入 invariants 和 boundaries，省略可选章节。

---

## 六、风险地图

### 风险 A — Charter 变成没人维护的僵尸文档

**现象**：charter 在项目初期创建后从未更新，invariants 与实际代码严重脱节。`/forge charter check` 每次都报 10+ 违规，团队开始忽略所有 charter 输出。

**降险**：
1. charter 长度限制 150 行，降低维护负担
2. `/forge charter update` 交互式逐章节审视，不需要手动编辑
3. 每 10 个 spec 完成后，`/forge learn` 自动建议检查 charter freshness
4. invariants 上限 8 条——超过说明项目需要拆分而非更多约束

**回滚**：`status: deprecated` 或直接删除 `.tinkerman/charter.md`。下游 skill 自动降级。

### 风险 B — Charter drift 检测误报

**现象**：charter 说"所有 API 必须 versioned"，但内部 health check 端点 `/health` 没有 version prefix。spec-check 每次报 P1，但这是合理的例外。

**降险**：
1. invariants 可以带 `exceptions` 子句（如"例外：/health, /metrics 等基础设施端点"）
2. charter drift 询问用户时提供"标记为例外"选项
3. 例外被记录在 charter 的变更日志中

### 风险 C — Grounding Read 占用过多 context

**现象**：charter 150 行全部注入到 decide/spec/plan 的 prompt 中，加上 spec 文件本身，context 超过预算。

**降险**：
1. 只注入摘要（invariants + boundaries），不注入全文
2. 摘要限制 ≤500 tokens
3. 如果 context budget 不够（compact-safe mode），跳过 grounding read

---

## 七、设计决策

### D1 — 为什么不直接用 `CLAUDE.md`？

**选择**：独立文件 `.tinkerman/charter.md`

**理由**：
- `CLAUDE.md` 是**行为准则**（AI 应该怎么工作），charter 是**工程约束**（代码应该长什么样）
- `CLAUDE.md` 的变更频率极低（宪法级），charter 允许 minor/major 版本变更
- `CLAUDE.md` 对所有项目通用（Forge 框架自带），charter 是项目特定的
- 混在一起会让 `CLAUDE.md` 膨胀，违反 §2.6 Output Conciseness

### D2 — 为什么 invariants 上限 8 条？

**选择**：硬上限 8 条

**理由**：
- 8 条 invariants 的摘要约 200 tokens，加上 boundaries 约 300 tokens，总计 ≤500 tokens 的 grounding 注入量可控
- 超过 8 条意味着项目承担了太多硬约束，可能是架构分层的信号
- CE 的策略文档也没有无限膨胀——Rumelt 的"好策略"核心是**聚焦**而非穷举

### D3 — 为什么用 `.tinkerman/` 而非项目根目录？

**选择**：`.tinkerman/charter.md`

**理由**：
- CE 的 `STRATEGY.md` 放在项目根目录是因为它面向人类+AI 双重阅读
- Forge 的 `.tinkerman/` 是受保护区域，charter 不容易被意外修改
- `.tinkerman/` 已经是 Forge 状态管理的标准位置
- 但 `/forge charter show` 可以在任何地方展示 charter 内容，不影响可读性

### D4 — 为什么 charter check 是 P1 而非 P0？

**选择**：invariant 违规 = P1

**理由**：
- P0 应该留给"立即导致运行时错误或安全漏洞"的问题
- invariant 违规是"架构 drift"，不会立即崩溃，但长期有害
- 如果团队希望提升为 P0，可以在 invariant 定义中声明 `severity: P0`
