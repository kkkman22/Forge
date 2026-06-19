---
name: ponytail-adoption
status: draft
feature: ponytail-adoption
layout: requirements
created: "2026-06-18"
updated: "2026-06-18"
priority: P2
tier: light
source: Ponytail (github.com/DietrichGebert/ponytail) 借鉴分析
---

# Ponytail YAGNI 纪律借鉴 — 需求文档

## 背景

### 痛点：build 阶段缺少"这事该不该做"的前置闸门

调研 [Ponytail](https://github.com/DietrichGebert/ponytail)（一个让 AI agent 按"最懒资深开发者"原则写代码的 SKILL）后发现，其核心价值是一套**写代码前的 YAGNI 阶梯**：停在第 1 个成立的 rung，能不写就不写。

```
1. 这东西需要存在吗？      → 不需要就跳过（YAGNI）
2. 标准库能做吗？          → 用标准库
3. 平台原生功能覆盖吗？    → 用原生（<input type=date> vs flatpickr）
4. 已装依赖能解决吗？      → 用已装的，不加新依赖
5. 能一行解决吗？          → 一行
6. 最后才：能跑的最小代码
```

**Forge 现状对照**：

| Ponytail rung | Forge 现有覆盖 | 差距 |
|---------------|---------------|------|
| rung 1 YAGNI 跳过 | 仅 Critic agent（`.claude/agents/critic.md:31`）在 plan 阶段查一次，forge-build Self-Review（`.codex/agents/forge-build.toml:67`）一句话带过 | build 阶段执行中**无前置闸门** |
| rung 2 stdlib | 无显式规则 | 需补 |
| rung 3 原生平台 | 无显式规则 | 需补 |
| rung 4 已装依赖 | `skills/forge/lib/build/references/dependency-discipline.md` 已覆盖 | **已有，不重复** |
| rung 5 一行优先 | 无显式规则 | 需补 |
| rung 6 最小实现 | TDD GREEN 隐含（`forge-build.toml:16` "最小代码"） | **已有，不重复** |

**核心差距**：build agent 进入 TDD RED 前（`forge-build.toml:13-14`），没有任何机制让它停下来问"这个 task 是否可以用 stdlib/原生/一行代码替代，甚至整个跳过"。Critic 在 plan 阶段做过一次，但 build 中途发现 spec 有水分时**无路可退**。

### 第二个痛点：review Layer 2 缺"砍代码"维度

`.codex/agents/quality-check.toml` 现有 **Deslop（Code-Slop Detection）**（注释复述 / 兜底 try-catch / `as any` / 深嵌套，P1-P3），但**没有"应该删除"的显式维度**。reviewer 容易只提"建议改进"不提"应该删除"——重写 stdlib、为单实现造接口、无调用的配置层这类膨胀代码会被"优化建议"放过而非"删除"。

Ponytail 的 `ponytail-review` 给出了紧凑的 delete-list 格式，5 个标签 + `net: -N lines` 结尾：

```
L12-38: stdlib: 27行 EmailValidator。'@' in email 1行。
L4: native: moment.js 导入用于一次格式化。Intl.DateTimeFormat，0 依赖。
repo.py:L88: yagni: AbstractRepository 单实现。等第二个出现再抽象。
net: -30 lines possible.
```

### 第三个痛点：延迟决策无追踪标记

Forge 有 `/forge learn` 和 `.forge/knowledge/`，但 build 中做的"先这样简化、以后再升级"的延迟决策**没有显式代码标记**，散落在 commit message 或进度文件里，learn 阶段无法系统回收。

Ponytail 用 `// ponytail: <已知上限>，<升级路径>` 注释标记，配合 `/ponytail-debt` 命令回收成台账。

### 与现有 spec 的关系

- **`build-discipline-enhancement`**（completed）：增强 build 阶段纪律（分支隔离/提交粒度）。本 spec 补其缺失的 **YAGNI 前置闸门**，不重叠。
- **`code-slim-0612`**（completed，ADR-0008 code-slim-strategy）：一次性瘦身 Forge 自身代码。本 spec 是**防新膨胀的持续机制**，code-slim 是事后清理，正交。
- **`dependency-discipline`**（reference doc）：已覆盖 Ponytail rung 4。本 spec rung 4 **直接引用该文档**，不重写。

### 不借鉴 Ponytail 的部分（明确排除）

- ❌ **Ponytail 的"测试最小化"**：Ponytail 说"trivial one-liner 不需要测试，YAGNI applies to tests too"。这**直接违反** Forge §2.1 TDD Iron Law（RED→GREEN→REFACTOR 铁律级）。本 spec **不采纳**。
- ❌ **Ponytail 的"强度档位 lite/full/ultra"**：Forge 是纪律驱动，不适合让 agent 自选松紧。
- ❌ **Ponytail 的 prose 压缩**：与 Forge §2.6 + Caveman companion 正交，不在本 spec 范围。

## 目标

在 build 阶段前置插入 YAGNI 闸门，在 review Layer 2 增加"砍代码"维度，并建立延迟决策的代码标记 + learn 回收闭环。

- build agent 进 TDD 前过一次 YAGNI 阶梯，能跳过的 task 跳过、能用更轻方案替代的就替代。
- quality-check reviewer 必须输出 delete-list，强制审视"能删的代码"。
- build 中的延迟决策以 `forge:defer` 注释标记，`/forge learn` 系统回收。

## 需求

### 1. forge-build 增加 Pre-task YAGNI 闸门

在 `forge-build.toml` 的 Core Flow（`.codex/agents/forge-build.toml:12-18`）中，第 2 步（读 spec）和第 3 步（TDD RED）之间插入 **2.5 Pre-task YAGNI gate**。

**行为变更**：每个 task 进 TDD 前，agent 必须过一次 5 rung 阶梯（rung 4 引用既有 `dependency-discipline.md`，不重写）：

```
2.5 Pre-task YAGNI gate（每个 task 实现前过一次）
   a. spec 要求的功能是否真有必要？       → 否：在 progress 记 `yagni-skip: <task>`，跳到下个 task
   b. 标准库能做吗？                       → 是：用标准库，不手写
   c. 平台原生功能覆盖吗？                 → 是：用原生，不引依赖
   d. 已装依赖能解决吗？                   → 见 dependency-discipline.md（既有规则）
   e. 能一行解决吗？                       → 是：一行
   f. 以上都不成立 → 进 TDD（rung 6 最小实现，既有）
```

**跳过记录格式**（写进 `.forge/progress/<topic>.md`）：
```
- yagni-skip: task-3 "CSV 求和" — stdlib `sum(col)` 已覆盖，跳过手写循环实现
- yagni-replace: task-5 "日期选择器" — rung 3 命中，用 `<input type="date">` 替代 flatpickr，计划中的依赖安装步骤取消
```

**验收条件**：
- [ ] `forge-build.toml` Core Flow 在第 2 步和第 3 步之间新增 "2.5 Pre-task YAGNI gate" 小节，含 5 rung 阶梯。
- [ ] 阶梯 rung d（已装依赖）**引用** `skills/forge/lib/build/references/dependency-discipline.md`，不复制其内容。
- [ ] 阶梯 rung f **引用** 既有 TDD GREEN（"最小代码"），不复制。
- [ ] 新增跳过/替代记录格式说明，明确写进 `.forge/progress/<topic>.md`。
- [ ] `.claude/agents/forge-build.md` 同步更新（保持与 `.codex/agents/forge-build.toml` 一致，遵循双 agent 副本惯例）。

### 2. forge-build Self-Review 增加硬边界清单

在 `forge-build.toml:63-70` 的 Self-Review 段，把 Ponytail 的"绝不简化掉"清单显式化，作为**不可跳过项**。

**保留现有三项自审**（完整性/质量/纪律），**新增第四项"硬边界"**：

```
**硬边界（不可为 YAGNI 牺牲的）**：
- 信任边界校验（输入验证、鉴权、权限检查）
- 防数据丢失的错误处理（写操作的事务/回滚/确认）
- 安全措施（加密、脱敏、注入防护）
- 可访问性基础（a11y）
- spec 显式要求的功能
```

**验收条件**：
- [ ] `forge-build.toml` Self-Review 段新增"硬边界"小节，含上述 5 类。
- [ ] 现有三项自审（完整性/质量/纪律）保留不变。
- [ ] `.claude/agents/forge-build.md` 同步更新。

### 3. quality-check 增加 Deletions 维度（Layer 2）

在 `quality-check.toml` 的 Six-Dimension Check（实际七维，含 Deslop）之后，新增 **Dimension 8: Deletions（可删代码）**。

**行为变更**：reviewer 必须扫描 diff 找以下 5 类可删项，输出 delete-list：

| 标签 | 含义 |
|------|------|
| `delete:` | 死代码、无用的灵活性、投机功能。替代：nothing |
| `stdlib:` | 手写但标准库已提供的。指明函数名 |
| `native:` | 依赖/代码做了平台已做的事。指明原生特性 |
| `yagni:` | 单实现的接口、无人设置的配置、单调用者的层 |
| `shrink:` | 同逻辑更少行。给出更短形式 |

**输出格式**（在现有 `## Layer 2 — Code Quality` 报告末尾追加）：

```markdown
### Deletions

| Location | Tag | Finding | Replacement |
|----------|-----|---------|-------------|
| L12-38 | stdlib | 27行 EmailValidator | `'@' in email`，真实验证靠确认邮件 |
| L4 | native | moment.js 用于一次格式化 | `Intl.DateTimeFormat`，0 依赖 |

net: -30 lines possible.
```

**无可删项时**：输出 `Lean already. Ship.` 并省略表格。

**与既有 Deslop 的边界**：Deslop（维度 7）管"AI 代码异味"（注释复述/兜底 catch/as any/深嵌套），Deletions（维度 8）管"本不该写的代码"。两者正交，同一行代码可能同时被两者标记。

**验收条件**：
- [ ] `quality-check.toml` 新增 "Dimension 8: Deletions" 小节，含 5 标签表 + 输出格式。
- [ ] Deletions 输出追加在现有 `## Layer 2 — Code Quality` 报告末尾，不替换原有六维+Deslop。
- [ ] 明确写出 Deletions 与 Deslop 的边界（正交关系）。
- [ ] 无可删项时的 `Lean already. Ship.` 兜底。
- [ ] 若 `.claude/agents/` 下有 quality-check 对应副本则同步（需 build 阶段核实路径）。

### 4. `forge:defer` 延迟决策标记 + learn 回收

**4a. build 阶段标记**：build agent 做的每个"先简化、以后升级"决策，在代码处标 `forge:defer` 注释（沿用 Ponytail `ponytail:` 模式，但用 Forge 命名空间）。

格式：`// forge:defer <已知上限>，<升级触发条件> / <升级路径>`

示例：
```python
# forge:defer 全局锁，单机吞吐 > 1000 req/s 时升级为 per-account 锁 / src/lock.ts:split
```

**4b. learn 阶段回收**：`/forge learn` 扫描本次 build 产生的所有 `forge:defer` 注释，汇总进 `.forge/knowledge/deferred.md`（新建），格式：

```markdown
## deferred.md — 延迟决策台账

| 日期 | Feature | 文件:行 | 已知上限 | 升级触发 | 升级路径 |
|------|---------|---------|---------|---------|---------|
| 2026-06-18 | xxx | src/lock.ts:42 | 全局锁 | 吞吐 > 1000 req/s | per-account 锁 |
```

**验收条件**：
- [ ] `forge-build.toml` 新增 "deferred decisions" 小节，说明 `forge:defer` 注释格式 + 何时使用。
- [ ] `.forge/knowledge/deferred.md` 创建（初始模板，空表 + 表头说明）。
- [ ] `/forge learn` 的 instructions（`skills/forge/lib/learn/instructions.md` 或等效）新增一步：grep `forge:defer`，汇总写进 `deferred.md`。
- [ ] `deferred.md` 纳入 `.forge/knowledge/` 的 20 文档上限管理（见 AGENTS.md §4.2，由 learn 既有逻辑处理，不需新机制）。

## 验收标准

- [ ] `npm run check` 全绿（tsc + biome + vitest + public-api + dist-sync + skill/doc 校验）。
- [ ] forge-build.toml + forge-build.md 双副本一致更新（YAGNI 闸门 + 硬边界 + defer 标记）。
- [ ] quality-check.toml 新增 Deletions 维度，不破坏现有六维+Deslop。
- [ ] `.forge/knowledge/deferred.md` 创建，learn instructions 含回收步骤。
- [ ] skill-length 检查通过（本 spec 主要改 agent toml/md，不显著增加 skill 体积）。

## 依赖

- **无外部依赖**：本 spec 全部是 agent 指令和文档调整，不改运行时代码。
- **既有文档**：`dependency-discipline.md`（rung 4 引用）、TDD GREEN（rung 6 引用）。

## 非目标

- **不引入 Ponytail 作为外部 plugin**：借鉴其理念，内化进 Forge agent 定义，不推荐用户安装 Ponytail（与 Forge 纪律体系重叠，且 Ponytail 的测试观与 Forge TDD 铁律冲突）。
- **不动 Caveman 推荐**：`init.sh:900-908` 的 Caveman companion 安装保留不变（Caveman 管 prose 压缩，与 Ponytail 的代码体积压缩正交）。
- **不实现强度档位**：不抄 Ponytail 的 lite/full/ultra，Forge 纪律不分级。
- **不改动 TDD 铁律**：YAGNI 闸门是 TDD **之前**的前置过滤，通过后才进 TDD；不弱化 RED→GREEN→REFACTOR。
- **不做 Ponytail 的 benchmark 复现**：其 80-94% 减码数据是单任务基准，与 Forge 多 agent 编排场景不可比，不作为本 spec 的量化目标。
