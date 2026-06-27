---
date: 2026-06-27
topic: domain-example-reference-impl
status: blocked-on-distribution
tier: full
triggered_by: "state-machine orphan 调查 → pms-pack-v1 R4.5 先天缺陷 → 用户意图（实例领域代码供参照 + 领域知识贯穿全流程）"
slice: "A（示例领域代码）— 切片 B（领域知识贯穿 decide/plan/build/review）待本切片后"
blocked_by: "切片 A'（packs/ 进 plugin bundle 分发）— 决策中发现 plugin 用户（主推途径）连 packs/ 都拿不到，分发是示例参照价值的前置阻塞"
related_adrs:
  - "ADR-0008 (code-slim-strategy)"
related_specs:
  - ".forge/specs/pms-pack-v1/（R4.5 先天缺陷，本决策部分修正）"
  - ".forge/specs/pack-system/"
related_decisions:
  - ".forge/decisions/2026-06-26-arch-review-remediate-0626.md（T-01 state-machine 反转，本决策的直接源头）"
perspectives:
  product: "medium"
  architect: "medium"
  security: "low-medium"
critic_verdict: "pass（附三条强制修正，非 needs_revision）"
---

# 决策：Forge 内建 DDD PMS 示例领域代码（参考实现）— 切片 A

## 0. 背景：为什么有这个决策

本决策源自对 `src/state-machine/` orphan 状态的深挖。调查链：
1. T-01 反转（arch-review-remediate-0626）：state-machine 被判死代码→build 实证发现非死代码
2. 深读发现：state-machine 是 "planned-but-unfinished"——pms-pack-v1 R4.5 要求 `/forge plan` 消费它，但 design.md §5 跳过了 plan 流，tasks.md 零任务引用 R4.5（先天缺陷）
3. 深读 reference-advanced.md + packs/ + 原始 spec 发现：**src/domain/ 从未存在**，pack 定位是"数据素材+复制模板"非"可运行参考实现"
4. 用户澄清真实意图：**Forge 要有实例领域代码供用户参照，且领域知识要贯穿全流程**

本切片 A 只决策"建什么样的示例领域代码 + 怎么建"。切片 B（领域知识贯穿 decide/plan/build/review）待本切片交付后。

## 0.1 分发阻塞（decide 确认阶段发现，2026-06-27）

**本切片在落地前被一个更优先的现存缺陷阻塞。**

decide 确认阶段核实用户获取路径时发现：**pms pack 对主推的 plugin 安装用户完全失效**。
- `scripts/build-dist.sh:118-122` 显式拷 skills/agents/commands/hooks/templates 进 bundle，**唯独无 `cp -r packs`**（全文 grep "packs" 零命中）。
- `init.sh:1254-1255`（bundle 版）显式兜底"pack 找不到"：`warn "Pack 未找到于 packs/ 目录。配置已记录，但 Pack 功能将不可用直到安装"`——说明分发缺失是已知状态。
- 后果：`/forge init --pack pms` 在 plugin 安装下声称启用 pms，实际 warn"不可用"却照常写配置——**是个谎言式缺陷**。

| 用户类型 | `/forge init --pack pms` 结果 |
|---------|------------------------------|
| plugin 安装（主推，README:28） | ❌ pack 完全不工作（warn + 空配置） |
| git clone | ✅ 正常 |
| npm（files: dist/src/） | ❌ packs 不在包内 |

**含义**：示例领域代码的参照价值前提是"用户能拿到示例"。若 plugin 用户连 packs/ 都拿不到，建再多 src/domain/ 他们也看不到。因此分发是前置阻塞。

**衍生新切片 A'**（优先级高于本切片）：让 packs/ 进 plugin bundle，使 pack 机制对 plugin 用户真正工作。本切片（示例领域代码）待 A' 解决后启动，且 A' 的解法可能改变示例代码的落点（放 src/ vs 放 packs/）。

## 1. Product 视角（苏格拉底式，风险：中）

**核心结论**：示例的真实价值是"可读可改的参照物"，不是可运行系统。但价值成立的前提是它做了 pack 模板做不到的事——展示**聚合间协作**与**状态机如何落地为代码**（静态 {{placeholder}} 模板给不了）。

**关键追问**：
- 怎么验证"开发者真需要内置示例"而非 Gist+walkthrough？→ 作为交付节奏处理：先 ship 1 个聚合（reservation）观察 1-2 周，再补其余。
- 示例会不会绑架 Forge 演进（领域改→示例跟→模板跟，三处真相）？→ 视作"快照参照物"，不进 build 产物、不被 Forge 流程序消费。
- 切片 B 贯穿全流程若只有 spec 消费，切片 A 凭什么现在做完整？→ 做核心 3 上下文即可，不做全 8。

**完整性边界（product，用户确认修订 2026-06-27）**：**全 8 限界上下文** + BDD 场景覆盖相应扩大。边际价值在"展示模式"非穷举覆盖，但用户明确要求全 8 上下文作为完整参考实现。通过分期（先 ship 1 个）控制单次交付风险。

## 2. Architect 视角（Design It Twice，风险：中）

### 方案对比
- **方案 A（推荐）— In-Repo 参考实现**：`src/domain/` 驻留 Forge 仓库，单向依赖（领域可选引用引擎，引擎不反向依赖领域）。Locality 高（单一真相源）。
- 方案 B — Template 渲染产物冻结到 packs/pms/rendered/：引擎零耦合，但双源维护负担 + mutation_critical_modules 仍空路径（本切片目标落空）。

**推荐方案 A**。方案 B 牺牲本切片真实目标（让 mutation_critical_modules 变真实路径、让 mutate 能跑），换取的"解耦"是虚假的。

### state-machine 角色
**领域代码消费 `src/state-machine/` 引擎，而非自带状态实现。** 理由：自带状态实现 = 永远放弃让 orphan 引擎有真实生产消费者。示例领域作为首个 consumer 把 orphan 转为 load-bearing module。

### 完整性边界（architect，用户确认修订 2026-06-27）
**全 8 限界上下文**（reservations/front-desk/housekeeping/folio-billing/night-audit/rate-inventory/channel-integration/reporting）× **全套 DDD 原语**（聚合根+值对象+领域事件+仓储 interface+Application Service）。8 个覆盖 PMS 全领域；全套原语才能验证状态转换 invariants/事件溯源/不变量聚合。分期先 ship reservation（1 个，验证模式），观察后再批量补 7 个。

### 关键架构风险
**示例领域反向腐蚀引擎**（CLI 代码 import src/domain/）。缓解：CI 加 `no-domain-imports-in-engine` lint 规则，把 seam 用编译期钉死。

## 3. Security 视角（OWASP+STRIDE，风险：低-中，pass-with-notes）

**STRIDE**：
- Tampering/EoP 中（仓储若 SQL 拼接/eval 引入注入面）
- Info Disclosure 中（事件日志打印 PII）
- Spoofing/Repudiation/DoS 低-无（纯内存领域无认证/网络/审计面）
- state-machine 引擎首次消费 低（yaml 安全 schema + 受控输入）

**分发风险**：示例随 dist 分发，用户易当生产代码 copy-paste，Forge 成不安全代码扩散放大器。

**四条安全红线**（必须落地）：
1. 仓储纯内存实现，禁 SQL 拼接/eval/new Function，不引入 DB 驱动
2. 事件载荷禁含 PII，日志走脱敏
3. 文件头标 `@non-production` / NOT FOR PRODUCTION
4. CI 新增 src/domain/ grep 巡检（禁 eval/new Function/SQL 拼接/fs/child_process/硬编码 secret）

**结论**：无 P0/P1 阻塞，pass-with-notes。

## 4. Critic 交叉审视（Round 2，裁决：pass 附三条强制修正）

### 范围矛盾裁决（requirement_side）
product（BDD 抽样）vs architect（全套原语）**正交不冲突，应叠加**：product 的"10-15 条"是对**场景库**抽样，architect 的"全套"是对**单个聚合结构**的完整。裁决：**3 上下文 × 每个全套 DDD 原语 + BDD 场景抽样 10-15 条**。

### 根本性质疑裁决
product 的"先做最小验证"**不动摇立项基础**，是范围/节奏问题。实证：pack 模板是占位符脚手架，做不了"让 mutation 跑、让 state-machine 引擎转"——只有真实 src/domain/ 能做。示例是让两个沉没成本（state-machine 引擎、mutation phantom 路径）变现的唯一载体。product 的"最小验证"采纳为**交付节奏**（先 1 个聚合 ship）。

### 定位统一
architect 方案 A（随发版）vs product 警告（别被消费）需统一为：**in-repo dogfood 参照域，源码入库但不进 dist build 产物、不注册为 Forge 运行时模块**。"随发版"指源码随 git tag 快照（可读参照物），不是编进 dist 被 CLI 加载。独立 tsconfig project ref、package.json build 排除、CI lint 禁 engine import domain。

### 盲区补全（三视角集体遗漏）
1. **测试策略归属**：deriveStatePropertyTests 输出引用 `./reservation-machine`——这个领域类正是示例要提供的，否则 property 派生器产出无法编译。示例领域 = property 派生器的消费方 + mutation 的 target。
2. **yaml 单一真相源**：示例代码状态转换必须与 packs/pms/state-machines/*.yaml 的 invariants 一致。yaml 是状态真相源，示例聚合的 transition guard 调用引擎校验，而非自带 switch。
3. **不走模板 transition switch**：DDD 模板 aggregate-root 自带 StateTransitions switch，与"消费引擎"矛盾。示例走 `import { loadStateMachineDefinition } from "../state-machine"`，不走模板的 transition 块。

## 5. 综合决策（三视角 + Critic 统一后）

### 定位
- **in-repo dogfood 参照域**：`src/domain/` 源码入库
- 独立 tsconfig project ref；package.json build 排除 src/domain/；不进 dist
- CI `no-domain-imports-in-engine` lint：engine 侧禁止 import domain
- 身份=可读可改参照物，非生产代码，文件头标 `@non-production`

### 范围
- **全 8 限界上下文**：reservations / front-desk / housekeeping / folio-billing / night-audit / rate-inventory / channel-integration / reporting
- 每个上下文**全套 DDD 原语**：聚合根 + 值对象 + 领域事件 + 仓储（仅 interface，impl 留 TODO）+ Application Service
- **BDD 场景**覆盖相应上下文（从 packs/pms/scenarios/ 103 条中选取关键场景）
- **分期**：先 ship reservation（1 个完整聚合，验证 state-machine 消费 + 全套原语 + 分发链路），观察 1-2 周再批量补其余 7 个

### state-machine 角色
- 示例聚合**消费** `src/state-machine/` 引擎做转换校验
- **不走** DDD 模板自带的 transition switch
- packs/pms/state-machines/*.yaml 是状态真相源，示例代码受其校验
- 这让 state-machine 引擎首次有真实生产消费者，修正 orphan 状态

### 安全红线（四条，必须落地）
1. 仓储纯内存，禁 SQL 拼接/eval/new Function，不引入 DB 驱动
2. 事件载荷禁 PII
3. 文件头标 `@non-production`
4. CI grep 巡检 src/domain/

### 测试契约（盲区补全）
- 示例领域 = deriveStatePropertyTests 的消费方 + mutation 的 target
- 示例聚合的 transition guard 调用引擎校验 yaml invariants

## 6. Veto 否决记录
无视角行使否决权。Critic 标记 pass。

## 7. 不在本切片范围
- **切片 A'（前置，优先级最高）**：packs/ 进 plugin bundle 分发，让 pack 机制对 plugin 用户工作。本切片被它阻塞。
- **切片 B（后置）**：领域知识贯穿 decide/plan/build/review 的注入机制；state-machine 接进 /forge plan（R4.5.5 字面目标）
- 本切片只决定"建什么样的示例领域代码 + 怎么建"（待 A' 解决分发后启动）

## 8. 开放问题（spec 阶段需解决）
- 示例领域的 tsconfig project ref 具体怎么配（避免污染 Forge 主 build）
- deriveStatePropertyTests 产出的 TS 片段如何集成进示例测试（R4.5.4 说"开发者粘贴"，这里要自动化还是半自动）
- BDD 10-15 条场景具体选哪些（从 103 条里挑）
- mutation 跑通后的 score_threshold（pack.yaml 现写 85）是否需调整
