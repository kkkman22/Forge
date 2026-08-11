# Spec 8: 4 级 Artifact 验证 — 详细规格

> 来源：open-gsd/gsd-core v1.4.4 `references/verification-patterns.md`
> 优先级：P2 | 影响范围：review instructions + spec-check agent
> 预估工作量：3-4h
> Forge 现状：⚠️ 合并到 Spec 3 — L1/L2 已有，L3/L4 与 Spec 3 可执行项完全重叠

---

## 评估结论（2026-06-12）

**⚠️ 与 Spec 3 完全重叠，应合并处理。**

### ✅ 已有（无需开发）
- R1 L1 Exists — spec-check agent 已有文件存在性检查
- R2 L2 Substantive — spec-check agent 已有 stub 模式检测

### ⚠️ 需要增强（与 Spec 3 合并）
- R3 L3 Wired — 5 种 wiring 路径 → **与 Spec 3 R2 可执行项完全相同**
- R4 L4 Data-Flow — 端到端 trace → **与 Spec 3 R2 可执行项完全相同**
- R5 状态矩阵 → **与 Spec 3 评估结论中的状态矩阵可执行项相同**
- R6 Overrides — 80% token overlap + deferred items → 可作为 Spec 3 补充

**建议**：不再单独实施 Spec 8。所有内容合并到 Spec 3 的 spec-check agent 增强中处理。

---

## 问题

当前 Forge 的 review 检查"文件是否存在"和"测试是否通过"，但不检查：

| 遗漏 | 后果 | v1.4.4 方案 |
|------|------|------------|
| **Stub 代码** | 看起来有实现，实际是 return null | L2 Substantive 检查 |
| **孤儿代码** | 文件存在但没人 import | L3 Wired 检查 |
| **断裂数据流** | API 存在 + DB 函数存在，但未连通 | L4 Data-Flow 检查 |
| **虚假覆盖** | 测试文件存在但只测 happy path | Spot-check（Spec 3 R5） |

### v1.4.4 新增 vs v1.3.0

| 特性 | v1.3.0 | v1.4.4 |
|------|--------|--------|
| 验证级别 | 文件存在 + 测试通过 | **L1-L4 渐进式验证** |
| 状态矩阵 | 无 | **VERIFIED/HOLLOW/ORPHANED/STUB/MISSING** |
| Wiring 模式 | 无 | **5 种标准连接路径** |
| Overrides | 无 | **80% token overlap + deferred items** |

## 需求

### R1: Level 1 — Exists（存在性验证）

```
目标：确认 artifact 在文件系统中存在

验证方法：
  1. fs.existsSync(filepath) — 文件存在
  2. grep -r "identifier" src/ — 关键标识符在代码中出现
  3. 检查 git tracked 状态（不是 gitignored 的幽灵文件）

通过条件：文件存在 + 标识符出现
失败状态：MISSING
```

### R2: Level 2 — Substantive（实质性验证）

```
目标：确认 artifact 不是 stub

Stub 检测模式：
  - return null / return undefined / return {} / return []
  - return true（无条件的硬编码）
  - TODO / FIXME / HACK / XXX / not-implemented
  - 空函数体（仅一行 return）
  - 硬编码数据替代真实逻辑（如 return [{id:1,name:"test"}]）
  - console.log 但无业务逻辑
  - if (true) / if (false)（死分支）
  - 注释掉的实现代码（// old implementation...）

验证方法：
  1. 读取文件内容
  2. 匹配 stub 模式列表
  3. 检查函数体行数（< 3 行 + return → 疑似 stub）
  4. 检查是否有条件分支/循环/异常处理（真实逻辑的标志）

通过条件：无 stub 模式匹配 + 有真实逻辑结构
失败状态：STUB
```

### R3: Level 3 — Wired（连接性验证）

```
目标：确认 artifact 被 import 并有 callsite

5 种标准 Wiring 路径：

  路径 1: Component → API
    前端组件 import 并调用了后端 API endpoint
    验证：grep "import.*api" + grep "fetch(.*endpoint"

  路径 2: API → DB
    API handler 调用了数据库访问层
    验证：grep "import.*db" + grep "await db.query" 或 ORM 调用

  路径 3: Form → Handler
    表单组件连接到提交处理函数
    验证：grep "@submit" + grep "handleSubmit"

  路径 4: State → Render
    状态变量被渲染逻辑读取
    验证：grep "useState/useStore" + grep "state\." in JSX/template

  路径 5: Event → Action
    事件监听器连接到 action handler
    验证：grep "addEventListener/@click" + grep "handler"

验证方法：
  1. 确认 import 语句存在
  2. 确认 callsite 存在（不只是 import 了没用）
  3. 追踪至少一条完整的 wiring 路径

通过条件：被 import + 有 callsite + 至少一条完整路径
失败状态：ORPHANED（存在但不被引用）
```

### R4: Level 4 — Data-Flow（数据流验证）

```
目标：确认数据从输入到输出的端到端流通畅

验证方法：
  1. 追踪数据路径：
     Input → Parse → Validate → Transform → Store → Retrieve → Render

  2. 检查断点：
     - 数据是否在某个环节被丢弃？
     - 是否有 hardcoded override 绕过逻辑？
     - 是否有条件分支导致数据永远不到达输出？
     - 异步操作是否正确 await？

  3. Probe execution（迁移/数据相关）：
     - 迁移前 probe：记录当前数据状态
     - 迁移后 probe：对比数据是否正确转换
     - 完整性检查：行数、字段数、关键值

通过条件：端到端数据流无断裂 + 无 hardcoded override
失败状态：HOLLOW（wired 但数据流断裂）
```

### R5: 验证状态矩阵

```
L1   L2   L3   L4    → 状态        → 含义
✗                     → MISSING     → 不存在，需要创建
✓    ✗                → STUB        → 存在但是空壳，需要实现
✓    ✓    ✗           → ORPHANED    → 实现了但没接入，需要 wiring
✓    ✓    ✓    ✗      → HOLLOW      → 接入了但数据流断裂，需要修 data-flow
✓    ✓    ✓    ✓      → VERIFIED    → 完整可用

处理策略：
  MISSING  → 创建 artifact（回到 build）
  STUB     → 实现真实逻辑
  ORPHANED → 添加 import + callsite
  HOLLOW   → 修复数据流断裂
  VERIFIED → ✅ 通过
```

### R6: Verification Overrides

```
当自动验证无法 100% 判定时，使用 override 机制：

Override 规则：
  1. Token overlap matching：
     计算 spec 中描述的 tokens 与验证者实际检查的 tokens 的重叠率
     ≥ 80% → 可判定 passed
     < 80% → human_needed

  2. Override 记录：
     {
       override: true,
       reason: "80% token overlap achieved (X/Y tokens)",
       coverage: 0.82,
       manual_review_recommended: false
     }

  3. 限制：
     - P0/P1 级别的 must-haves 不允许 override
     - 每个 override 记录到 verification.status.gaps
     - 多个 override > 3 → 自动升级为 human_needed

Deferred Items 机制：
  当某个 must-have 暂时无法验证时：
  {
    deferred: true,
    reason: "需要部署环境验证",
    estimated_verification: "ship 阶段",
    blocking: false  // 不阻塞当前阶段
  }
  Deferred items 汇总到 verification.status.gaps
  在后续阶段必须验证
```

## 设计决策

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 级别数 | 2/3/4 级 | 4 级（L1-L4） | 渐进式深度，每级解决不同问题 |
| 状态名 | pass/fail | 5 状态（VERIFIED/HOLLOW/ORPHANED/STUB/MISSING） | 精确定位问题类型 |
| Override 门槛 | 50%/80% | 80% | 高门槛防止误判 |
| Deferred | 不允许 / 允许 | 允许（不阻塞） | 现实中有些验证需要后续阶段 |

## 验收标准

- [ ] R1 L1 Exists 验证方法（fs + grep + git tracked）
- [ ] R2 L2 Substantive 验证 + stub 模式列表
- [ ] R3 L3 Wired 验证 + 5 种标准 wiring 路径
- [ ] R4 L4 Data-Flow 验证 + 断点检查 + probe execution
- [ ] R5 验证状态矩阵（5 种状态 + 处理策略）
- [ ] R6 verification overrides（80% overlap）+ deferred items 机制
- [ ] `npm run check` 通过
