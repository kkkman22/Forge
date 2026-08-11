# Spec 5: 科学调试框架 — 假设检验 + Reasoning Checkpoint + Debug Session

> 来源：open-gsd/gsd-core v1.4.4 `agents/gsd-debugger.md`（1453 行）+ `references/debugging-methodology.md`
> 优先级：P2 | 影响范围：debug instructions + debug session 文件格式
> 预估工作量：4-6h
> Forge 现状：⚠️ 部分借鉴 — `src/debug.ts` 有 4 阶段 + 假设验证，缺少 reasoning checkpoint 5 字段 + debug session 文件 + 4 模式

---

## 评估结论（2026-06-12）

**⚠️ 部分值得借鉴。有 4 个明确可执行项，合计 4-6h。**

### ✅ 已有（无需开发）
- R1 5-phase 调试方法论（collect→pattern→hypothesize→fix）— `src/debug.ts` 4 阶段已等价
- R5 Three-Strike reroute — 已有 3-strike circuit breaker + `analyzeHypothesisResults()` 3-strike 升级
- `validateHypothesis()` — 已有假设验证
- `isValidPhaseTransition()` — 已有阶段转换验证

### ⚠️ 需要增强（可执行项）
| 工作项 | R# | 类型 | 影响文件 | 工作量 |
|--------|----|------|---------|--------|
| Hypothesis type 扩展 +falsification_test +blind_spots | R2 | TypeScript | `src/debug.ts`（Hypothesis type 当前只有 3 字段：description/verifyCommand/expectedOutcome） | 1h |
| Reasoning checkpoint 5 字段模板 | R2 | debug instructions (markdown) | debug SKILL instructions | 1-2h |
| Debug session 文件协议（5-file） | R3 | debug instructions (markdown) | 同上 | 1-2h |
| 4 调试模式定义 | R4 | debug instructions (markdown) | 同上 | 1h |

R6 knowledge base 回流已有等价机制（`/forge learn` 五维度提取），无需额外开发。

---

## 问题

当前 Forge 的调试是 **症状驱动**（symptom-driven）：看到错误 → 猜测原因 → 修改代码 → 希望修复。这导致：

| 问题 | 现状 | v1.4.4 方案 |
|------|------|------------|
| **猜测链断裂** | 修改后如果"好了"，不知道为什么好 | reasoning checkpoint 记录因果链 |
| **回归丢失** | 修复后忘记之前的假设 | debug session 文件持久化 |
| **模式重复** | 相同类型的 bug 反复耗时 | knowledge base 模式查询 |
| **TDD 断裂** | 修复不先写失败测试 | tdd_mode 强制 RED→GREEN |

### v1.4.4 新增 vs v1.3.0

| 特性 | v1.3.0 | v1.4.4 |
|------|--------|--------|
| Reasoning | 无结构化记录 | **checkpoint 5 必填字段** |
| Debug 文件 | 无 | **5-section 文件协议** |
| 调试模式 | 无区分 | **4 种模式**（find_root_cause/find_and_fix/tdd/symptoms_prefilled） |
| 假设质量 | 无验证 | **可证伪测试（falsification test）** |

## 需求

### R1: 5-Phase 调试方法论

```
Phase 1: Knowledge Base Check
  → 查询 .tinkerman/knowledge/ 中的历史 bug 模式
  → 查询 evolved-rules.md 中的 project-specific 错误预防指令
  → 匹配 → 直接尝试已知解决方案

Phase 2: Initial Evidence Collection
  → 收集错误信息（stack trace / log / 用户描述）
  → 确定错误类型（crash / silent failure / wrong output / hang）
  → 记录复现步骤

Phase 3: Common Bug Patterns
  → 对照常见 bug 模式清单：
    - Null/undefined 引用
    - 类型不匹配（runtime vs compile-time）
    - 异步竞态条件
    - 边界条件（off-by-one / empty array / null check）
    - 状态泄漏（全局变量 / 闭包捕获）
    - 环境差异（NODE_ENV / 路径 / 权限）
    - 缓存失效
    - 序列化/反序列化丢失

Phase 4: Form Hypothesis
  → 基于 Phase 1-3 的证据，形成可证伪的假设
  → 必须包含 falsification test（如何证明假设是错的）
  → 写入 reasoning_checkpoint

Phase 5: Test & Evaluate
  → 执行 falsification test
  → 如果假设被证伪 → 回到 Phase 4，形成新假设
  → 如果假设被确认 → 实施修复
  → 修复后验证：问题不再复现 + 无新回归
```

### R2: Reasoning Checkpoint（5 必填字段）

每次形成假设时，必须填写以下 5 个字段：

```markdown
## Reasoning Checkpoint

### hypothesis（假设）
当前认为的根因。
例："auth.ts:42 的 token 解析在 token 包含 '.' 时抛出异常"

### confirming_evidence（支持证据）
支持这个假设的证据列表。
例：
- stack trace 指向 auth.ts:42
- 错误日志显示 "Unexpected token ."
- 受影响的用户都使用了包含 '.' 的用户名

### falsification_test（可证伪测试）
如何证明这个假设是错的。如果无法证伪，假设不科学。
例："在 auth.ts:42 前添加 console.log(token)，
如果 token 不包含 '.' 但仍然报错 → 假设证伪"

### fix_rationale（修复理由）
为什么选择的修复方案是正确的。
例："使用 split('.') 而非 indexOf('.') 可以正确处理
包含多个 '.' 的 token，因为 JWT 的 header.payload.signature 格式固定"

### blind_spots（盲点）
当前分析中可能遗漏的方面。
例：
- 未验证 token 是否可能为 null
- 未考虑 token 编码（base64url vs base64）
- 未检查是否有中间件在 auth.ts 之前修改了 token
```

### R3: Debug Session 文件协议

调试会话持久化到 `.tinkerman/debug/` 目录：

```
.tinkerman/debug/
  └── <bug-id>/
      ├── current-focus.md    ← 当前焦点（覆写模式，每次更新覆盖）
      ├── symptoms.md         ← 症状记录（不可变，首次创建后不改）
      ├── eliminated.md       ← 已排除的假设（追加模式）
      ├── evidence.md         ← 证据收集（追加模式）
      └── resolution.md       ← 解决方案（覆写模式，修复后填写）

文件写入模式：
  current-focus.md  → OVERWRITE（每次推理更新覆盖旧内容）
  symptoms.md       → IMMUTABLE（首次创建后永不修改）
  eliminated.md     → APPEND（每排除一个假设追加一条）
  evidence.md       → APPEND（每收集一条证据追加一条）
  resolution.md     → OVERWRITE（修复后填写，验证后可能更新）
```

### R4: 4 种调试模式

```
Mode 1: find_root_cause_only
  → 只找根因，不实施修复
  → 适用：排查问题、理解系统行为、准备修复计划
  → 输出：root cause report + recommended fix（不执行）

Mode 2: find_and_fix（默认）
  → 找到根因后立即修复
  → 适用：明确的 bug、低风险修复
  → 流程：Phase 1-5 → 修复 → 验证 → 关闭 session

Mode 3: tdd_mode
  → 强制 TDD 循环：先写失败测试（RED）→ 修复使测试通过（GREEN）→ 重构（REFACTOR）
  → 适用：回归 bug、需要测试覆盖的 bug
  → 铁律：如果修复时测试已经通过（非 RED 状态）→ fail-fast，必须先让测试失败

Mode 4: symptoms_prefilled
  → 症状已由外部系统预填（如 CI 失败日志、用户报告）
  → 从 Phase 2 开始（跳过症状收集）
  → 适用：CI 失败排查、用户报告的 bug
```

### R5: Three-Strike Reroute（铁律）

```
同一修复连续失败 3 次：
  → 立即停止
  → 进入 /forge debug（如果不在）
  → 禁止第 4 次尝试同方向

在 debug 中同一假设连续验证失败 3 次：
  → 停止修复
  → 质疑架构
  → 重新评估方向
  → 考虑 Oracle 咨询
```

### R6: Knowledge Base 回流

调试完成后，自动提取经验：

```
提取维度：
  1. 问题模式（什么类型的 bug）
  2. 根因（实际原因是什么）
  3. 修复方案（如何修复的）
  4. 排除路径（哪些假设被证伪了——防止重复探索）
  5. 预防措施（如何避免再次发生）

写入：.tinkerman/knowledge/debug-patterns.md
高频模式写入：.tinkerman/knowledge/evolved-rules.md（附 Confidence Score 0.3-0.9）
```

## 设计决策

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 推理记录 | 可选 / 强制 | 强制 5 字段 | 没有结构化推理 = 猜测 |
| 文件模式 | 统一覆写 / 分区 | 分区（覆写/不可变/追加） | 不同信息有不同的生命周期 |
| 假设验证 | 确认测试 / 可证伪测试 | 可证伪测试 | 科学方法核心——可证伪才是科学 |
| TDD 集成 | 可选 / 模式化 | 模式化（tdd_mode） | 不同场景需要不同策略 |
| Strike 限制 | 无限重试 / 3 次 | 3 次 | 防止在错误方向上浪费资源 |

## 验收标准

- [ ] R1 5-phase 调试方法论写入 instructions
- [ ] R2 reasoning checkpoint 5 字段模板定义
- [ ] R3 debug session 文件协议（5 文件 + 写入模式）
- [ ] R4 4 种调试模式定义（find_root_cause/find_and_fix/tdd/symptoms_prefilled）
- [ ] R5 three-strike reroute 规则（与 AGENTS.md §2.4 一致）
- [ ] R6 knowledge base 回流机制
- [ ] `npm run check` 通过
