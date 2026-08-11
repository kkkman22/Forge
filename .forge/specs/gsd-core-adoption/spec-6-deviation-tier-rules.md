# Spec 6: 偏差分级规则 — Executor 遇到偏离计划时的 4-Tier 行为分级

> 来源：open-gsd/gsd-core v1.4.4 `agents/gsd-executor.md`（786 行）
> 优先级：P2 | 影响范围：forge-build agent + build instructions
> 预估工作量：2-3h
> Forge 现状：✅ 已通过现有实现满足 — `src/error-recovery/` 已有等价 4 级系统

---

## 评估结论（2026-06-12）

**✅ 已通过现有实现满足，无需开发。**

Forge 的 fix routing 系统已等价于 Spec 6 的 4-Tier：

| Spec 6 Rule | Forge 等价 | 源码位置 |
|-------------|-----------|---------|
| Rule 1: Auto-Fix Bugs | `safe_auto`（自动修复） | `src/error-recovery/types.ts` + `engine.ts` |
| Rule 2: Auto-Add Missing | `gated_auto`（需确认的自动操作） | `src/error-recovery/types.ts` |
| Rule 3: Auto-Fix Blocking | `manual`（手动处理） | `src/error-recovery/types.ts` |
| Rule 4: STOP for Architecture | `advisory`（建议 + 停止） | `src/error-recovery/types.ts` |

- **autoFixable vs requiresUserDecision**：`engine.ts` 已区分可自动修复和需要用户决策的条目
- **修复限制**：Three-Strike circuit breaker = Spec 6 的「每 task 最多 3 次修复」
- **Slopsquatting**：N/A — `src/*.ts` 中零 `npm install/pnpm add/yarn add`，无冲突目标
- **Analysis paralysis guard**：属于 agent 行为指导，写入 SKILL instructions 比代码更合适

## 问题

Executor 在执行 plan 时，经常遇到计划未预见的情况（缺失文件、类型错误、缺少依赖）。如果没有明确的偏离处理规则，Agent 要么：

- **过度自主**：随意修改架构、安装新依赖（slopsquatting 风险）
- **过度保守**：遇到任何偏差就停下询问用户（效率低下）

GSD Core v1.4.4 的 4-Tier Deviation Rules 为 Executor 提供了明确的行为分级。

### v1.4.4 新增 vs v1.3.0

| 特性 | v1.3.0 | v1.4.4 |
|------|--------|--------|
| 偏差处理 | 无分级 | **4 级规则**（Auto-Fix → Auto-Add → Auto-Fix Blocking → STOP） |
| 包安装 | 允许 | **Rule 3 排除 package installs**（slopsquatting 防御） |
| 修复限制 | 无限制 | **每 task 最多 3 次修复尝试** |
| 停滞检测 | 无 | **5+ 次读取无行动 = 卡住**（analysis paralysis guard） |
| 认证操作 | 无特殊处理 | **auth gates → checkpoint:human-action** |

## 需求

### R1: 4-Tier 偏差规则

```
Rule 1: Auto-Fix Bugs（自动修复 Bug）
  触发：发现明确的代码 bug（类型错误、语法错误、逻辑错误）
  行为：直接修复，无需确认
  记录：在 progress 中记录修复内容
  示例：plan 要求创建 auth.ts，但导入路径写错 → 自动修复导入路径

Rule 2: Auto-Add Missing Critical（自动添加缺失的关键内容）
  触发：plan 要求的功能缺少关键实现部分
  行为：自动补充缺失的关键部分
  约束：仅限 plan 中明确要求的功能
  示例：plan 要求 CRUD API，但只创建了 Create → 自动补充 Read/Update/Delete

Rule 3: Auto-Fix Blocking Issues（自动修复阻塞问题）
  触发：非 plan 内容但阻塞了 plan 执行的问题
  行为：自动修复阻塞问题
  ⚠️ 排除：package installs（npm install / pip install / cargo add）
  ⚠️ 排除理由：slopsquatting 攻击防御（恶意包名混淆攻击）
  示例：tsconfig.json 路径配置错误导致编译失败 → 自动修复配置
  反例：缺少 npm 包 → 停下来要求用户确认安装（不自动安装）

Rule 4: STOP for Architecture（架构变更必须停止）
  触发：需要修改架构、添加新依赖、改变数据模型、修改公共 API
  行为：停止执行，记录偏差，要求用户决策
  输出：偏差报告 + 建议方案 + 风险评估
  示例：plan 要求用 REST API，但发现需要 WebSocket → 停下来询问
```

### R2: Slopsquatting 防御

```
Slopsquatting 攻击：
  攻击者在 npm/PyPI/crates.io 上注册与热门包名相似的恶意包。
  AI Agent 在自动安装依赖时可能安装错误的包。

防御策略：
  1. Rule 3（Auto-Fix Blocking）明确排除 package installs
  2. 任何 package install 必须经过用户确认
  3. 确认时显示包名、来源、下载量、维护者信息
  4. 对包名进行合法性检查（与已知包名的 Levenshtein 距离）
  5. 对包进行合法性验证（registry-API verdicts: OK | SUS | SLOP）
```

### R3: 修复尝试限制

```
每个 task 的修复尝试上限：3 次

  第 1 次失败 → 分析原因，调整方案
  第 2 次失败 → 重新审视假设，换方向
  第 3 次失败 → 停止，进入 Three-Strike Reroute（Spec 5 R5）

计数规则：
  - 修复同一根因的多次小调整算 1 次（如连续修改同一函数）
  - 修复不同根因的尝试各算 1 次
  - 第 3 次失败后禁止第 4 次尝试同方向
```

### R4: Analysis Paralysis Guard（分析瘫痪防御）

```
检测条件：连续 5 次以上文件读取/搜索操作，无任何代码编辑

触发后：
  1. 注入警告："已读取 N 个文件无行动。可能陷入分析瘫痪。"
  2. 建议：停止搜索，基于现有信息做决策
  3. 强制选择：
     a. 立即开始实现（接受不完全信息）
     b. 停下来询问用户（可能需要更多上下文）
  4. 如果继续读取（忽略建议）→ 再次警告并升级

设计理由：
  过度收集信息 ≠ 更好的决策。
  5 次读取后的边际信息收益极低。
```

### R5: Auth Gates → Checkpoint:human-action

```
需要人工操作的认证场景 → checkpoint:human-action（1% 场景）

Auth Gate 触发条件：
  1. 需要登录第三方服务（npm publish, docker push, cloud deploy）
  2. 需要提供 API key / secret / token
  3. 需要审批 / 合规检查
  4. 需要数据库迁移权限

行为：
  → 停止自动执行
  → 输出明确的操作指引
  → 等待用户完成操作并确认
  → 用户确认后继续

Checkpoint 分布：
  checkpoint:human-verify  → 90%（代码审查确认）
  checkpoint:decision      → 9%（架构决策）
  checkpoint:human-action  → 1%（认证/权限操作）
```

### R6: Threat Model 集成

```
偏差处理前进行安全评估：

  每次偏差修复前，快速评估：
  1. 修改是否引入注入风险？（SQL/NoSQL/XSS/Command）
  2. 修改是否绕过权限检查？
  3. 修改是否暴露敏感数据？
  4. 修改是否引入不安全依赖？

  如果任何评估为"是" → 升级到 Rule 4（STOP）
```

## 设计决策

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 分级数量 | 2/3/4 级 | 4 级 | 渐进式自主权，平衡效率和安全 |
| 包安装 | 允许自动 / 禁止自动 | 禁止自动（Rule 3 排除） | slopsquatting 防御 |
| 修复限制 | 无限 / N 次 | 3 次/task | 防止在错误方向上循环 |
| 停滞检测 | 无 / N 次读取 | 5 次读取无行动 | 防止分析瘫痪 |
| 认证处理 | 自动跳过 / 停止 | 停止（human-action） | 安全第一 |

## 验收标准

- [ ] R1 4-Tier deviation rules 写入 build instructions
- [ ] R2 slopsquatting 防御规则（Rule 3 排除 package installs）
- [ ] R3 修复尝试限制（3 次/task）+ 计数规则
- [ ] R4 analysis paralysis guard（5 次读取检测）
- [ ] R5 auth gates → checkpoint:human-action 机制
- [ ] R6 threat model 集成（偏差修复前安全评估）
- [ ] `npm run check` 通过
