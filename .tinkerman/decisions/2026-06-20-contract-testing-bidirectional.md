---
id: "ADR-0007"
title: "Consumer-Driven Contract (CDC) Testing: Scope Boundary and Backend Cooperation Model"
status: "accepted"
date: "2026-06-20"
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0006"
---

# ADR-0007: Consumer-Driven Contract (CDC) Testing — Scope Boundary and Backend Cooperation Model

> **决策性质**:`accepted`。本 ADR 记录的是一个**已接受的决策**——决定"**搁置 CDC 实施,改用接口变更三层门禁**"。即:CDC 的范围边界分析(D1-D4)保留备查,但**不进入实施**;实际采用的三层门禁方案见下方专节。
>
> **搁置 CDC 的理由**:目标项目(fe_ch5)的演进策略(字段只增不删 + 不满足则开新版本接口 `/api/v2`)已用版本隔离规避了 CDC 所防的破坏性变更;叠加 pont 自动同步生成物 + vue-tsc 编译期校验,CDC 的边际收益不足以支撑其后端配合与 Broker 成本。完整论证见下方 §"演进策略分析(搁置依据)"。
>
> **重新评估条件**:若未来项目演进策略改变(允许删字段 / 后端团队拆分失控 / 多消费者并存),可重新评估 CDC,届时 D1-D4 + D2 三级模型可直接复用。

## Context

ADR-0006 的 v2 spec(`.tinkerman/specs/layered-test-pyramid/`)定义了 `bash:contract` 契约层,但其 `Contract-Source` 只支持**单向校验**:`Contract-Source: pont` 让前端校验 pont 生成物(api.d.ts)是否与后端 swagger 同步新鲜(`requirements.md` Req3 AC7/AC8)。成熟度审计(见对话)指出这是 **40% 成熟度的单向契约**,缺 CDC 的"提供者验证"半边。

CDC(Consumer-Driven Contract)是业界标准模式:**前端(消费者)定义接口期望 → 生成契约文件 → 后端(提供者)用真实代码验证满足契约**。Pact(pact-foundation)是事实标准实现,Pact Broker + `can-i-deploy` 是成熟度标志。

针对实际项目 fe_ch5,有三条硬事实决定 CDC 的可行性边界:

1. **后端是 Java/Spring + Swagger v2**(`apps/2.0/pont-config.json` 的 `v2/api-docs?group=XX`,Springfox 多 group 分服务),版本走 URL 路径段(`master`/`CambridgeAPI`)。
2. **Pact provider verify 需后端接入**:Java 后端要么用 `pact-jvm`(JUnit 集成),要么用 `pact-provider-verifier`(Docker 二进制重放契约)。这是**后端仓库代码**,完全在 Forge 仓库之外。
3. **多服务多版本**:fe_ch5 后端有 ~20 个 group(AR/Block/Cashiering/Reservation...),跨 2 个 host、2 个版本段。每个交互(interaction)都要后端验证,契约文件数量 = 服务数 × 消费场景数。

这三条引出本 ADR 要回答的三个核心问题:

- **Q1 范围**:Forge(前端工作流工具)应该做 CDC 的哪部分?provider verify 和 Broker 算不算 Forge 的责任?
- **Q2 后端配合**:后端必须做什么?如何降低后端接入成本?
- **Q3 落地形态**:Pact 全套(Broker + can-i-deploy) vs 轻量方案(契约文件 git 交换)如何选?

**关键张力**:CDC 的价值闭环在后端验证侧,但 Forge 没有权限也没有理由侵入后端代码库。如果 CDC 要求后端做它不愿意做的事,整个方案就是空中楼阁。本 ADR 的首要任务是**诚实界定 Forge 能做的边界**,而非承诺一个 Forge 兑现不了的"完整 CDC"。

## 演进策略分析(搁置依据 — 本节导致决策为"搁置 CDC 实施")

在完成 Q1-Q3 的范围边界论证后,对目标项目 fe_ch5 的实际演进策略做了核实,结论推翻了"CDC 有必要"的前提。

### 核实到的演进策略(fe_ch5 真实代码)

1. **字段只增不删**:后端约定接口字段只能新增,不能删除或改语义。证据:`packages/services/lib/*/api-lock.json` 历史变更以属性新增为主。
2. **不满足则开新版本接口**:需求无法用现有接口满足时,后端开新版本 URL,旧版本冻结保留。证据(pont 生成物):
   - URL 级版本并存:`packages/services/lib/houseKeeping/api.d.ts` 同时存在 `/api/housekeeping/v1`、`/v2`、`/v3`,`/api/attendants/v1`、`/v2`。
   - 类型级版本并存:`packages/services/lib/reservation/api.d.ts` 同时存在 `RespCheckResCCardV1`、`PostChangePackageDailyV2` 等带版本后缀的类型。
3. **pont 自动同步**:`pnpm services` → `generate.js` 从 swagger 重新生成 `api.d.ts` + `api-lock.json`,前端永远消费最新接口定义。
4. **vue-tsc 编译期校验**:`apps/express/package.json` 有 `type-check: vue-tsc --build`;`apps/revision` 有 `vue-tsc`。pont 更新 api.d.ts 后,字段删除/类型变更/必填变更会在编译期被 `tsc` 报错捕获。

### CDC 价值 vs 演进策略的对照

CDC 的核心价值是拦截后端的**破坏性变更**(breaking change)。破坏性变更有三类,CDC 对每类的防护价值与该项目的发生可能性对照如下:

| 破坏类型 | CDC 能防? | 该项目会发生吗? |
|---------|----------|----------------|
| 删除字段 | ✅ | ❌ 约定禁止 |
| 改字段语义(枚举值漂移) | ✅ | ⚠️ "不满足开新接口"约定已规避 |
| 改字段类型/必填 | ✅ | ⚠️ 同上,倾向开新接口 |
| 新增字段 | ❌ CDC 不管 | ✅ 唯一变更方式 |
| 开新版本接口 | ❌ CDC 不管 | ✅ 标准做法 |

**结论**:该项目真正发生的两类变更(新增字段、开新接口),CDC 不覆盖;CDC 能防的三类破坏,项目约定已禁止或规避。CDC 投入后端配合 + Broker 成本,防的是一个**该项目按约定不会发生**的问题——属过度工程。

### 已有防护已覆盖 CDC 的核心价值

该项目的接口稳定性实际由三层既有机制保证,且成本远低于 CDC:

| 防护层 | 防什么 | 机制 | CDC 是否冗余 |
|--------|-------|------|-------------|
| 版本隔离(`/v1` `/v2` 并存) | 接口行为被偷偷改 | 后端约定开新版本而非改老的 | ✅ 替代 CDC 的"接口稳定性"目标 |
| pont 自动同步 | 生成物与 swagger 漂移 | `pnpm services` 重新生成 | ✅ 替代 CDC 的"契约新鲜度"目标 |
| vue-tsc 编译期 | 字段删/类型变/必填变 | `vue-tsc --build` 类型校验 | ✅ 替代 CDC 的"破坏性变更拦截",且是编译期非运行时,更强 |

三层加起来覆盖了 CDC 约 90% 的价值,成本约为 CDC 的 1/100(无需后端双测、无需 Broker、无需 pact 工具链)。剩余约 10%(纯语义漂移,字段名不变值变)已被"不满足开新接口"约定规避。

### 搁置决策

基于以上分析:

1. **ADR-0007 决策为"搁置 CDC 实施"**(`status: accepted`,记录的是这个决策本身),不进入实施。
2. **ADR-0006 的 `Contract-Source: pact` 值保留**(声明性能力),但不投入落地资源。
3. **改投入方向**:把项目已有的"pont 同步 + vue-tsc + 只增不删约定"固化为**强制 CI 门禁**(pont 幂等校验 + vue-tsc 补齐到所有 app + api-lock diff 破坏性变更检测),而非引入 CDC。详见"接口变更三层门禁"设计(独立于本 ADR)。
4. **重新评估触发条件**:若未来出现以下任一情况,重新评估 CDC——
   - 项目约定改为允许删字段 / 改语义
   - 后端团队拆分到不同组织,约定执行失控
   - 出现多个独立前端消费者,接口兼容矩阵需 Broker 管理

## Decision

采用**分层责任模型**:Forge 只负责 CDC 的**消费者侧编排**,不负责 provider verify 和 Broker;后端配合通过**标准契约文件格式 + 可选接入等级**实现,不强求后端全套接入。

### D1. Forge 的责任边界(消费者侧 only)

Forge 在 CDC 中**只做三件事**,全部在前端仓库内:

| 责任 | 形态 | 对应 Forge 能力 |
|------|------|----------------|
| 1. 生成 Pact consumer 测试脚手架 | `recipe` 扩展(`templates/recipes/<stack>-pact/`) | 复用 ADR-0006 Req6 的 recipe 机制 |
| 2. 执行 consumer 测试、产出契约文件 | `contractRunner` delegate 扩展(`Contract-Source: pact`) | 复用 ADR-0006 Req3 的 delegate |
| 3. 发布契约文件到约定位置 | 契约文件写入 `.tinkerman/contracts/*.json` 或 git 仓库 | Forge 的文件系统 |

**Forge 明确不做**:
- ❌ 运行 Pact provider verify(后端代码,在 Forge 仓库外)
- ❌ 部署/维护 Pact Broker(基础设施,非前端工具职责)
- ❌ 执行 `can-i-deploy` 门禁(跨前后端 CI 协调,非单仓库能力)
- ❌ 强制后端接入任何工具(无权限侵入后端代码库)

**理由**:Forge 的定位是"前端工作流编排器"(见 ADR-0006 的 R6.5 守护哲学)。provider verify 是后端 CI 的职责,Broker 是 DevOps 基础设施的职责。把这三项塞进 Forge 会违反单一职责、突破仓库边界、并制造 Forge 无法兑现的承诺。

### D2. 后端配合的三级模型(降低门槛,不强求全套)

后端按**可选接入等级**逐步参与,任何一级都能产生独立价值:

| 等级 | 后端做什么 | 防什么问题 | 后端成本 |
|------|-----------|-----------|---------|
| **L0 零接入**(默认) | 什么都不做,只维持现有 swagger | 无额外防(退化为 ADR-0006 的单向契约) | 零 |
| **L1 手动 verify**(最低门槛) | 后端开发者本地拉取前端 `.tinkerman/contracts/*.json`,跑一次 `pact-provider-verifier`(Docker,无需改后端代码) | 防字段语义/枚举值漂移 | 极低(一次性脚本) |
| **L2 CI verify**(推荐) | 后端 CI 加一个 job,拉契约文件 + 跑 verifier,失败阻断后端发版 | 同 L1,但自动化、持续 | 低(一个 CI job) |
| **L3 Broker 全套**(成熟) | 后端接 Pact Broker,契约双向发布,`can-i-deploy` 跨 CI 门禁 | 全套 + 版本兼容矩阵 + 发版门禁 | 中(基础设施 + 接入) |

**关键设计**:Forge 的 consumer 侧产物(契约文件)在 L0 就存在且可用,**后端可以从 L0 逐步升到 L3,不需要一次性投入**。这避免了"要 CDC 就必须后端全套"的全有全无陷阱。

### D3. 轻量优先的落地形态(契约文件 git 交换,不强求 Broker)

**默认形态**:**契约文件经 git 仓库交换**,不部署 Broker。

```
前端仓库(fe_ch5)                    后端仓库
┌─────────────────────┐             ┌─────────────────────┐
│ consumer 测试        │             │                     │
│   ↓ pact generate   │             │                     │
│ .tinkerman/contracts/   │  git 同步    │ 拉取 contracts/      │
│   user-role.json    │◄──────────► │   (submodule/mirror) │
│   reservation.json  │             │   ↓ pact verify      │
│                     │             │ 后端 CI 验证          │
└─────────────────────┘             └─────────────────────┘
```

契约文件是**标准 Pact JSON**(pact-foundation 规范),前后端工具链都认。git 交换(子模块 / 镜像仓库 / monorepo 共享目录)在 L1/L2 足够,**只有当契约数 > 50 或多消费者并存时才需要 Broker 的版本矩阵能力**。

**何时升级到 Broker**:契约文件数 > 50、或多于 2 个前端消费者、或需要 `can-i-deploy` 跨 CI 门禁时。这是 L3 的触发条件,不是默认。

### D4. 与 ADR-0006 的衔接点(不破坏既有设计)

CDC 是 ADR-0006 `bash:contract` 层的**扩展**,不是替代:

| ADR-0006 现状 | ADR-0007 扩展 |
|--------------|--------------|
| `Contract-Source: openapi/pont/pact/manual` | `pact` 值现在有真实落地(L1+),不再只是声明 |
| `contractRunner` delegate 跑 `test:contract` | 当 `Contract-Source: pact` 时,delegate 跑 consumer 测试 + 产出 `.tinkerman/contracts/*.json` |
| recipe 只含 MSW+vitest | 新增 `<stack>-pact` recipe 变体(vue3-vitest-msw-pact) |

**不破坏**:ADR-0006 的单向契约(`Contract-Source: pont` 生成物新鲜度)继续工作;CDC 是 `Contract-Source: pact` 这个值的深度落地。两者共存,用户按需选。

## 实际采用的替代方案:接口变更三层门禁

> 本节是"CDC 实施搁置"决策的**实际落地**。CDC 搁置后,接口稳定性改由项目既有的工程机制(而非新工具链)保证。此方案适用于 fe_ch5,属项目工程实践,不进 Forge 包。

### 设计依据

讨论中确认 fe_ch5 已有三层接口稳定性机制,但**未固化为强制 CI 门禁**(依赖开发者手动跑、PR review 人肉看 diff)。三层门禁的本质是**把既有能力接进 CI**,而非发明新工具。

| 既有机制 | 现状风险 | 三层门禁固化后 |
|---------|---------|---------------|
| `pnpm services`(pont 自动同步) | 手动跑,易忘 | CI 重新 generate + diff 校验,倒逼自动 |
| `vue-tsc`(express 有 `type-check`) | 可能没接进所有 app 的 CI | 三个 app 强制 type-check |
| "只增不删"约定 | 口头约定,无强制力 | api-lock.json diff 脚本阻断字段删除 |

### 三层门禁的具体形态

**第 1 层 — pont 幂等校验(防"忘 generate")**:
CI 跑 `pnpm services` 后 `git diff --quiet -- packages/services/`,有 diff 说明提交的 api-lock.json 过期,阻断并提示本地重新 generate。零额外工具,纯 git diff。

**第 2 层 — vue-tsc 补齐到所有 app(把"跑起来报错"变 CI 强制)**:
- `apps/express` 已有 `type-check: vue-tsc --build`,确认接入 CI
- `apps/revision` 补 `type-check` 脚本(`vue-tsc --build`)
- `apps/2.0`(Vue2+vue-cli)用 `tsc --noEmit` 或 vue-cli 等价命令

pont 更新 api.d.ts 后,字段删除/类型变更/必填变更在编译期被 `tsc` 报错捕获(`Property 'xxx' does not exist`)。**编译期、确定性**,比 CDC 运行时重放更强。

**第 3 层 — api-lock.json 破坏性变更检测(把"只增不删"变可执行规则)**:
新增 `scripts/check-api-lock-compatible.sh`,解析 `git diff` 中 api-lock.json 的 `-` 行(被删除的 `"name": "xxx"`),只阻断字段删除,放行新增。配合废弃流程——真要删,先标 `@deprecated` 一个版本,下版本再删。

### 三层 vs CDC 的成本对照

| 维度 | 三层门禁 | CDC(Pact 全套) |
|------|---------|----------------|
| 新增依赖 | 零(用已有 pnpm/vue-tsc/git) | pact-js + pact-jvm + Broker |
| 后端配合 | 零(纯前端仓库内) | 必须(provider verify + Broker) |
| 防护范围 | 字段删/类型变/必填变/生成物漂移/约定违反 | 同左 + 语义漂移(已用版本隔离规避) |
| 实施成本 | 1 个 CI 文件 + 1 个 30 行脚本 | 前后端双测 + 基础设施 + 持续维护 |
| 适配 fe_ch5 演进策略 | ✅(只增不删 + 版本隔离) | ❌(防不会发生的事) |

### 边界与限制(诚实)

1. **第 1 层环境依赖**:`pnpm services` 连 swagger 端点(内网/外网),CI 需能访问,或改用 swagger 快照文件。
2. **第 2 层历史包袱**:`apps/2.0` 大量 `any`/`@ts-ignore` 会削弱 tsc 覆盖度,不能指望 100% 拦截。
3. **第 3 层误报**:字段重命名(老名删+新名加)会被判为删除。初版可先警告不阻断,或支持豁免标记。
4. **三层不覆盖语义漂移**:字段名不变、值变(role 从 `"admin"`→`"ADMIN_ROLE"`)三层都拦不住。但这已被 fe_ch5"不满足开新接口"约定规避——约定执行靠第 3 层的 PR 流程辅助,不靠工具。

### 落地位置说明

三层门禁属 **fe_ch5 项目工程实践**,落地在 fe_ch5 仓库(`scripts/check-api-lock-compatible.sh` + `.github/workflows/api-guard.yml` + 各 app type-check 补齐),**不进 Forge 包、不进 Forge spec 体系**。本 ADR 仅记录决策与方案,作为 CDC 搁置后的替代记录。

## Rejected Alternatives

### Alternative A: Forge 全套 CDC(含 provider verify + Broker)

**Decision**: Rejected。

**Reasoning**: 违反仓库边界与单一职责。provider verify 需要后端 Java 代码在 Forge 进程内执行(或 Forge CI 起后端服务),这既不现实(后端是独立仓库、独立部署),也违反 Forge "前端工作流编排器"的定位。Broker 是基础设施,部署维护成本不属于一个 npm 包/plugin 的职责。承诺全套 CDC 会让 Forge 兑现不了——provider verify 失败时 Forge 无法修复后端代码。D1 的边界划分正是为了规避这个陷阱。

### Alternative B: 强制后端全套接入(全有全无)

**Decision**: Rejected。

**Reasoning**: 后端是独立的 Java/Spring 团队,强制其接入 pact-jvm + Broker 是组织协调问题,不是技术问题。若 CDC 的前提是"后端必须 L3",那么只要后端不配合,整个方案作废——这是脆弱的设计。D2 的三级模型让后端可以从 L0(零成本)起步,价值随接入等级递增,避免了全有全无。

### Alternative C: 不用 Pact,自研轻量契约格式

**Decision**: Rejected。

**Reasoning**: Pact JSON 是 pact-foundation 的**跨语言标准格式**,Java/JS/Go/Python 都有 verify 工具。自研格式意味着后端没有现成 verifier 可用,反而抬高 L1 门槛。用标准格式让后端的 `pact-provider-verifier`(Docker 二进制)开箱即用,这是 L1"极低成本"的基础。标准格式的另一个价值:未来若升级 Broker,契约文件无需转换。

### Alternative D: 把 CDC 塞进 ADR-0006 的 v2 spec

**Decision**: Rejected(已在审计中决定)。

**Reasoning**: ADR-0006 的 v2 spec 已经 7 个 Req、46 条 AC。CDC 的 provider verify + Broker + 后端 CI 接入会让 spec 范围炸开,且依赖后端团队决策(组织不确定性)。混在一起会导致 v2 spec 因后端配合未定而无法锁定。拆分独立 ADR + 独立 spec,让 ADR-0006 先 ship 不受 CDC 拖累。

## Consequences

### Positive

- **边界清晰**:Forge 只做消费者侧编排,不承诺兑现不了的 provider 侧。诚实标注能力边界。
- **后端零强制**:L0 起步,L1 极低成本(Docker verifier),L2/L3 按需升级。组织阻力最小化。
- **复用 ADR-0006 基建**:recipe + delegate + Contract-Source 字段都已定义,CDC 是扩展不是新建。
- **标准格式**:Pact JSON 跨语言,后端 verifier 开箱即用,未来 Broker 无缝升级。
- **独立交付**:本 ADR + spec 可独立于 ADR-0006 推进,不拖累 v2 ship。

### Negative

- **价值依赖后端**:Forge 做完消费者侧,CDC 的真正价值(provider 拦截后端破坏性变更)**必须后端至少 L1 才能兑现**。若后端长期停留在 L0,CDC 退化为单向契约,与 ADR-0006 现状无异。这是组织风险,不是技术风险。
- **契约文件同步摩擦**:git 交换契约文件需要前后端仓库有同步机制(子模块/mirror/monorepo 共享目录),这是额外的仓库拓扑协调。Broker 能消除这个摩擦,但引入基础设施成本。
- **多服务契约爆炸**:fe_ch5 有 ~20 个后端 group,若每个都做 consumer 测试,契约文件数膨胀。需有优先级策略(只对高频变更/关键业务接口做 CDC,其余维持 pont 单向)。
- **后端 Java 工具链**:pact-jvm 与 Spring/Springfox 集成有学习曲线,L2 CI 接入需要后端投入。

### Neutral / Expected

- CDC 的 consumer 测试本身是前端单测,跑在 vitest 里,不增加 Forge 的运行时依赖(pact-js 是项目 devDep,经 recipe 生成,不进 Forge 包,守 R6.5)。
- 本 ADR 的决策为"搁置 CDC 实施、改用三层门禁"(`status: accepted`)。D1-D4 的范围边界设计与 D2 三级模型保留备查,作为未来重新评估 CDC 时的起点。

## 讨论过程关键结论(决策推导链)

为便于未来重新评估时理解决策由来,记录推导过程中的四个关键转折:

1. **CDC 是什么 → 范围边界**:CDC(Consumer-Driven Contract)是前端定义接口期望、后端用真实代码验证的**双向闭环**。Pact 是标准实现,Broker + `can-i-deploy` 是成熟度标志。但 provider verify 在后端代码、Broker 是基础设施,都**超出 Forge(前端工具)仓库边界**——故 D1 界定 Forge 只做消费者侧。

2. **CDC 防什么 → 与项目演进策略冲突**:CDC 核心价值是拦截**破坏性变更**(删字段/改语义/改类型)。核实 fe_ch5 真实代码后发现:项目约定**字段只增不删**、**不满足则开新版本接口**(`/api/housekeeping/v1`/`v2`/`v3` 并存,`RespCheckResCCardV1`/`PostChangePackageDailyV2` 类型级版本并存)。CDC 能防的三类破坏,项目约定已禁止或规避;项目真正发生的两类变更(新增字段、开新接口)CDC 不覆盖。**CDC 在此场景是防一个不会发生的问题的过度工程**。

3. **项目已有机制 → 已覆盖 CDC 90% 价值**:核实发现 fe_ch5 已有三层机制——pont 自动同步(生成物新鲜)、vue-tsc 编译期校验(字段删/类型变/必填变,编译期非运行时,比 CDC 更强)、版本隔离(接口稳定性)。三层加起来覆盖 CDC 约 90% 价值,成本约 1/100。**不需要 CDC**。

4. **既有能力的短板 → 固化为 CI 门禁**:三层机制的问题是"未接进 CI 必跑门禁"(依赖手动 generate、type-check 可能漏 app、约定靠人肉 review)。故实际落地方案是**接口变更三层门禁**(见上方专节),把已有能力强制化,而非引入 CDC 工具链。

### 重新评估的触发条件

若未来出现以下任一,重新评估 CDC(届时 D1-D4 + D2 三级模型可直接复用):

- 项目约定改为允许删字段 / 改语义(三层门禁第 3 层失效)
- 后端团队拆分到不同组织,约定执行失控(口头约定不再可靠)
- 出现多个独立前端消费者,接口兼容矩阵需 Broker 管理(超过 git 交换的治理上限)
- 接口数量爆炸(>50 契约),git diff review 不再可行

## Rollback Plan

本 ADR 的决策都是**新增**(recipe 扩展、Contract-Source:pact 落地),不修改既有行为:

1. **不部署 Broker**:D3 默认 git 交换,无 Broker 可回滚。
2. **recipe 变体独立**:`<stack>-pact` recipe 是独立目录,删除即回滚,不影响 MSW-only recipe。
3. **Contract-Source: pact 降级**:若后端不配合,`Contract-Source` 改回 `pont`(单向),delegate 行为退化为 ADR-0006 现状。
4. **消费者测试可选**:consumer 测试是项目 devDep,用户不写就不产生契约文件,Forge 无强制。

**关键回滚特性**:整个 CDC 方案是**纯增量**,任何一级失败都能退回 ADR-0006 的单向契约,不破坏既有能力。

## Implementation Feasibility Gate (后端确认前置 — 已因 CDC 搁置取消)

> **状态变更**:原计划本 ADR `proposed` 时需后端确认 L1 可行性 + 做 PoC(Common group)。
> **演进策略分析**完成后的结论是 CDC 在 fe_ch5 场景属过度工程,故 **PoC 取消,不再做后端确认**。
> 原计划的确认项与 PoC 范围保留如下备查(若未来重新评估可直接复用):

| 确认项 | 确认方式 | 备注 |
|--------|---------|------|
| 后端愿意接受 L1(本地 verifier) | 与后端团队沟通 | CDC 搁置后不再推进 |
| 后端 swagger v2 可被 pact verifier 重放 | 用 1 个 group(如 Common)做 PoC | CDC 搁置后不再推进 |
| 前后端契约文件 git 同步机制可行 | 确认仓库拓扑(子模块/mirror) | CDC 搁置后不再推进 |

**原 PoC 范围(备查)**:选 fe_ch5 的 `Common` group(通用接口,变更风险高),前端写 1 个 Pact consumer 测试(如 `/api/user/login` 的 role 字段),后端用 `pact-provider-verifier` Docker 跑一次。

## Cross-References

- **ADR-0006** — `bash:contract` 层与 `Contract-Source` 字段的定义来源;本 ADR 原是其 `pact` 值的深度落地,CDC 搁置后该值保留为声明性能力,不投入资源。
- **ADR-0005** — 多级 fallback 梯子的先例(L0→L1→L2→L3 模型借鉴 review fallback ladder)。
- **R6.5**(ADR-0006)— pact-js 经 recipe 进用户项目,不进 Forge 包。
- **fe_ch5 现实约束**:`apps/2.0/pont-config.json` 的 swagger v2 多 group 结构;`packages/services/communitylib/community/mods/userApi/login.ts` 的 pontFetch 消费模式;`packages/services/lib/houseKeeping/api.d.ts` 的 `/api/housekeeping/v1|v2|v3` 版本并存;`packages/services/lib/reservation/api.d.ts` 的 `RespCheckResCCardV1`/`PostChangePackageDailyV2` 类型级版本并存。
- **接口变更三层门禁**:CDC 搁置后 fe_ch5 实际采用的替代方案(见上方专节),落地在 fe_ch5 仓库,不进 Forge。

## Open Questions (重新评估时的待解问题)

> 以下为若未来触发重新评估(见 Consequences §重新评估的触发条件)时需回答的问题。CDC 实施已搁置,不阻塞任何工作。

1. **优先级策略**:fe_ch5 的 ~20 个 group 若做 CDC,需定优先级规则(变更频率 × 业务关键度)。备选:先 Common(登录/凭证)+ Cashiering(金额,错不起)。
2. **Broker 选型**(若达 L3):自建开源 Pact Broker vs PactFlow 商业版。
3. **多版本接口**:master/CambridgeAPI 两个版本段的契约如何隔离?备选:契约文件命名带版本段(`user-role.master.json` / `user-role.cambridge.json`)。
4. **三层门禁的强化空间**:第 3 层 api-lock diff 脚本若要区分"重命名"与"真删除",需引入豁免标记机制(`// allow-rename`)。这是 fe_ch5 工程层面的优化,与 CDC 重新评估无关。
