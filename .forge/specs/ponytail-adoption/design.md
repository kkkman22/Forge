---
name: ponytail-adoption
feature: ponytail-adoption
layout: design
created: "2026-06-18"
updated: "2026-06-18"
---

# Ponytail YAGNI 纪律借鉴 — 设计文档

## 设计决策总览

| ID | 决策 | 理由 |
|----|------|------|
| D1 | YAGNI 闸门作为 TDD 前置步骤，不替换 TDD | Forge §2.1 TDD 是铁律，不可前置简化绕过；YAGNI 只决定"要不要进 TDD"，不决定"怎么测" |
| D2 | rung 4（已装依赖）和 rung 6（最小实现）引用既有文档，不复制 | `dependency-discipline.md` 和 TDD GREEN 已存在，复制会产生维护双份 |
| D3 | Deletions 作为 quality-check 的独立维度 8，不并入 Deslop | 两者关注点正交（异味 vs 该删），合并会模糊标签语义 |
| D4 | 用 `forge:defer` 命名空间，不沿用 `ponytail:` | 避免外部项目命名依赖；Forge 自有标记便于 learn grep 回收 |
| D5 | 内化规则，不推荐用户装 Ponytail plugin | Ponytail 测试观与 Forge TDD 铁律冲突，混用会让 agent 收到矛盾指令 |

---

## D1: YAGNI 闸门作为 TDD 前置，不替换 TDD

### 背景

Ponytail 把 YAGNI 阶梯和"最小实现"合在一个流程里，且明说"trivial one-liner 不需要测试"。Forge 的 §2.1 TDD Iron Law 要求所有实现走 RED→GREEN→REFACTOR。

### 决策

YAGNI 闸门是 **TDD 之前的前置过滤器**：
- 闸门通过（需要写代码）→ 进 TDD，最小实现仍由 GREEN 约束。
- 闸门拦截（可跳过/可替代）→ 不进 TDD，记 `yagni-skip` / `yagni-replace`。

**不把"最小实现"逻辑移进闸门**——rung 6（最小实现）仍归 TDD GREEN 管。闸门只管 rung 1-5（跳过/替代决策）。

### 备选方案

- **方案 A（采纳）**：闸门前置，rung 6 归 TDD。职责清晰，不碰铁律。
- **方案 B（否决）**：把 6 rung 全塞进 forge-build 的 task 循环，rung 6 覆盖 TDD GREEN。会导致 TDD 铁律被 agent 定义里的"最小实现"稀释，且 RED（先写测试）在 rung 6 之前还是之后不清。
- **方案 C（否决）**：不做闸门，靠 Self-Review 事后检查。Self-Review 在 task 完成后跑，代码已写完，删比重写贵。

### 风险

- 闸门可能被 agent 形式化跳过（每次都答"都不成立，进 TDD"）。**缓解**：`yagni-skip`/`yagni-replace` 记录写进 progress，review 的 spec-check 可查"为什么这个 task 没产生代码"。

---

## D2: rung 4 / rung 6 引用既有文档，不复制

### 背景

`dependency-discipline.md` 已详尽覆盖"加依赖前 4 项检查"，TDD GREEN 已定义"最小代码通过测试"。

### 决策

YAGNI 阶梯的 rung d 写成：`见 skills/forge/lib/build/references/dependency-discipline.md（既有规则）`，rung f 写成：`进 TDD GREEN（既有，forge-build.toml:16）`。

### 备选方案

- **方案 A（采纳）**：引用。单一信息源。
- **方案 B（否决）**：复制 rung 4 内容进 forge-build.toml。会导致 `dependency-discipline.md` 更新时 forge-build.toml 滞后，双份漂移。

### 风险

- 引用跨文件，agent 读 forge-build.toml 时可能不去读 dependency-discipline.md。**缓解**：闸门文字明确"**见** xxx"，agent 指令里"见"是强引用信号；且 dependency-discipline 是 build references 目录既有文件，agent 本就会加载。

---

## D3: Deletions 作为独立维度 8，不并入 Deslop

### 背景

quality-check.toml 现有维度 7 Deslop 扫描 4 类 AI 代码异味（注释复述/兜底 try-catch/as any/深嵌套）。Ponytail-review 的 5 标签（delete/stdlib/native/yagni/shrink）关注点不同。

### 决策

新增维度 8 Deletions，与 Deslop 并列。明确边界：

| 维度 | 关注 | 典型 |
|------|------|------|
| 7 Deslop | 写了但有**异味**的代码 | 兜底 catch、as any、注释复述 |
| 8 Deletions | **本不该写**的代码 | 重写 stdlib、单实现接口、投机配置 |

同一行可能两者都标（如：一个 as any 的工厂方法造单实现接口 → Deslop 标 as any，Deletions 标 yagni）。

### 备选方案

- **方案 A（采纳）**：独立维度 8，并列输出。语义清晰。
- **方案 B（否决）**：并入 Deslop 成"8 标签大杂烩"。Deslop 是 P1-P3 严重度分级体系，Deletions 是"删/缩"动作体系，混在一起 reviewer 不知道该填 severity 还是填 replacement。

### 风险

- 维度变多，reviewer turn 预算紧张（quality-check.toml 有 Turn Budget Discipline）。**缓解**：Deletions 扫描成本低于 Deslop（只需 grep 模式：import 标准库已有的东西、interface 但单 implementation），不显著增加 turn 消耗。

---

## D4: `forge:defer` 命名空间，不沿用 `ponytail:`

### 背景

Ponytail 用 `// ponytail: <上限>，<升级路径>` 标记延迟决策。Forge 若沿用会产生语义耦合。

### 决策

用 `// forge:defer <已知上限>，<升级触发条件> / <升级路径>`。三段式比 Ponytail 两段式多一个"升级触发条件"——让 learn 回收时能判断"现在该升级了吗"，而不只是"有个债"。

### 备选方案

- **方案 A（采纳）**：`forge:defer` 三段式。Forge 命名空间，自包含。
- **方案 B（否决）**：沿用 `ponytail:`。会让读代码的人以为是 Ponytail plugin 装了，且 grep `ponytail:` 会漏掉没装 plugin 的项目。
- **方案 C（否决）**：用通用 `TODO:`。太泛，learn 无法区分"延迟决策"和"普通待办"，且 TODO lint 工具会噪音告警。

### 风险

- agent 可能滥用 `forge:defer` 当万能借口（"先这样 defer 一下"）。**缓解**：每条 defer 必须含"升级触发条件"（可量化），learn 回收时对无量化触发条件的标为低置信度（沿用 §4.2 Confidence < 0.3 清理逻辑）。

---

## D5: 内化规则，不推荐装 Ponytail plugin

### 背景

Ponytail 支持作为 Claude Code / Codex plugin 安装，always-on 注入规则。

### 决策

Forge 只借鉴 Ponytail 的理念，**内化进自己的 agent 定义**。`init.sh` **不新增** Ponytail 推荐安装段。

### 备选方案

- **方案 A（采纳）**：内化，不推荐 plugin。Forge 纪律自洽。
- **方案 B（否决）**：像 Caveman 那样推荐为 companion。但 Ponytail 的"测试最小化"与 Forge TDD 铁律直接冲突，混装会让 agent 同时收到"trivial 不用测试"和"所有实现必须 TDD"的矛盾指令。
- **方案 C（否决）**：推荐 Ponytail 但加配置禁用其测试观。Ponytail plugin 不暴露细粒度开关，做不到。

### 风险

- 内化后 Ponytail 更新（新 rung / 新标签）Forge 不会自动跟进。**缓解**：本 spec 是一次性借鉴，Ponytail 的阶梯和标签是其核心稳定设计，变动概率低；且 Forge 可在后续 `/forge learn` 中观察效果再迭代，不需要追上游。

---

## 与现有 Forge 架构的契合

| 本 spec 元素 | 落点 | 与既有结构的关系 |
|-------------|------|----------------|
| YAGNI 闸门 | `.codex/agents/forge-build.toml` Core Flow 2.5 | 插在既有 step 2/3 之间，不动 step 1-6 |
| 硬边界清单 | `forge-build.toml` Self-Review | Self-Review 既有三项后追加第四项 |
| Deletions 维度 | `.codex/agents/quality-check.toml` | 既有六维+Deslop 后追加维度 8 |
| `forge:defer` 标记 | `forge-build.toml` + `skills/forge/lib/learn/instructions.md` | build 标记，learn 回收 |
| `deferred.md` 台账 | `.forge/knowledge/deferred.md` | 新文件，纳入 §4.2 的 20 文档上限管理 |

所有改动都是**追加**，不修改既有 TDD/review/learn 的核心逻辑。
