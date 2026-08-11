---
feature: "layered-test-pyramid"
status: "locked"
date: "2026-06-20"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
decided_by: "ADR-0006"
revision: 2
revision_reason: "推到成熟方案完整落地:补 recipe 系统(P1)、比例门禁(P2)、契约来源(P3)、负向 AC(P4)"
---

# requirements.md — Layered Test Pyramid (完整落地版)

## Purpose

Forge 当前的自动化验收模型是**扁平**的:只有 `accept`(api/ui/cli/mixed,且 `mixed` 是 no-op SKIP)和 `test` Layer 1(裸 `vitest run`)两层。这导致一类最难、最常见的场景——**接口数据决定走哪个业务分支、呈现不同 UI**(如权限复杂的后台管理系统)——无法被有效验证:

- `mixedRunner` 空实现(`src/accept-driver.ts:414-419`),API+UI 混合场景直接 SKIP。
- API runner 丢弃响应体(`src/accept-driver.ts:697-701`),无法断言字段值。
- `ScenarioType` 无组件层/契约层概念(`src/accept.ts:2`),组合爆炸只能堆在 E2E。
- **零测试基础的项目无法启动**(P1):组件层虽被定义,但 Forge 不提供落地脚手架,分层价值无法兑现。
- **金字塔形态无约束**(P2):E2E-heavy 反模式只警告不阻断。
- **契约层无来源**(P3):`bash:contract` 只跑命令,不定义契约怎么产生。

本特性将 Forge 验收模型从"扁平 accept + 裸 test"重塑为**四层组合金字塔的完整落地**——既改路由与聚合(Req 1-5),又提供**让中间层真正可用的脚手架**(Req 6,recipe 模式)、**强制金字塔形态**(Req 7,比例门禁)、**契约来源对接**(Req 3 增强)、**负向场景覆盖**(各 Req 补充)。

**决策依据**:ADR-0006。本 spec 是 ADR-0006 的可执行落地。**严格遵守 R6.5**(Forge 不得向 npm 包或插件引入 browser/test 依赖)——recipe 通过模板生成到用户项目,Forge 包零增量。

**面向对象**:使用 Forge 开发前端(尤其 Vue/React 后台管理系统)的开发者,以及 Forge 维护者。

## Glossary

| Term | Definition |
|------|-----------|
| Test Pyramid | 分层测试模型:unit → contract → component → e2e,组合下沉到廉价层 |
| `Verify-By: <layer>` | spec AC 契约字段,声明 AC 由哪层验证 |
| Layer | 测试金字塔一层。4 个执行层(unit/contract/component/e2e)+ 1 个 manual 层 |
| Delegate Runner | 不自建引擎、经 `forge_exec` 委托项目测试命令的 Runner |
| Layer Health | `aggregateVerdicts` 按层汇总的健康度 |
| Pyramid Shape | 金字塔形态分类,检测反模式 |
| **Recipe** | **NEW**. `/forge init --recipe <name>` 时生成到**用户项目本地**的测试栈配置模板。Forge 包不含依赖,仅含模板文件 |
| **Pyramid Ratio Gate** | **NEW**. ship/lock 门禁:E2E 场景占比超阈值时阻断(可配降级) |
| Contract Source | **NEW**. 契约文件的来源:OpenAPI schema 派生 / pont 生成物 / Pact 消费者驱动 |

## Requirements

### Requirement 1: `Verify-By: <layer>` 强制分层契约(keystone)

Forge 的 spec AC 锁定门禁 SHALL 强制每条 AC 声明所属测试层,作为路由与聚合的唯一真理源。

#### Acceptance Criteria

1. THE spec AC 锁定门禁(`scripts/check-spec-contract.sh`)SHALL 拒绝任何 `Verify-By` 缺少 `:layer` 后缀的 AC,合法值为 `vitest:unit` / `vitest:component` / `bash:contract` / `forge_exec:e2e` / `manual`。
2. WHEN AC 的 `Verify-By` 缺失或非法,THE 锁定 SHALL 被阻断,输出缺失字段列表与合法取值。
3. THE frontmatter `contract_legacy: true` 的 spec SHALL 跳过该校验(复用 `src/contract-validator.ts:81` grandfathering)。
4. THE spec SKILL(`skills/forge/lib/spec/instructions.md:120` Validation Contract 表)SHALL 更新白名单。
5. THE `classifyScenarioType`(`src/accept.ts:303`)对带 `Verify-By: <layer>` 注解的显式场景,SHALL 以 `<layer>` 为 `type` 权威来源。
6. **[负向]** WHEN `Verify-By` 注解与场景文本矛盾(如注解 `vitest:component` 但 Given/When/Then 全是 API 关键词),THE 分类器 SHALL 以 `Verify-By` 注解为准,并在 artifact 记录 `annotation_conflict: true` 警告(不阻断)。 <!-- P4 修复 -->
7. **[负向]** WHEN 同一 AC 的 `Evidence` 指向的文件在仓库中不存在,THE 锁定 SHALL 阻断并输出缺失文件路径。 <!-- P4 修复 -->

> Verify-By: bash:contract
> Evidence: scripts/check-spec-contract.sh, test/check-spec-contract.property.test.ts(合法/非法值、矛盾注解、Evidence 缺失)

### Requirement 2: 扩展 `ScenarioType`,新增 unit / component / contract

#### Acceptance Criteria

1. THE `ScenarioType`(`src/accept.ts:2`)SHALL 扩展为含 `"unit" | "component" | "contract"`。
2. THE `classifyScenarioType` SHALL 优先读 `Verify-By: <layer>` 推导 `type`;无注解回退关键词启发式。
3. WHEN `Verify-By` 为 `vitest:component`,THE `type` SHALL 为 `"component"`。
4. THE `mixed` 类型 SHALL 保留于联合类型(向后兼容),但 SHALL 无 Runner 服务;带 `Verify-By` 注解的场景不再产生 `mixed`。
5. **[负向]** WHEN `Verify-By` 注解为 `forge_exec:e2e`,THE `type` SHALL 映射为 `"api"`(复用既有 api/ui runner,不新增 e2e 枚举值,避免类型膨胀)。 <!-- Open Question Q1 落定 -->

> Verify-By: vitest:unit
> Evidence: test/accept.classify.property.test.ts(注解→type 确定性映射、e2e→api 映射)

### Requirement 3: 新增三个 Delegate Runner + 契约来源对接

#### Acceptance Criteria

1. THE `RUNNERS`(`src/accept-driver.ts:426`)SHALL 含 `unitRunner` / `componentRunner` / `contractRunner`,置于 `apiRunner` 前。
2. EACH delegate Runner SHALL 实现 `Runner` 接口,`supports` 返回 `scenario.type` 匹配。
3. THE delegate Runner SHALL 经 `forge_exec` 调用项目测试命令(取自 `.tinkerman/config.md` `test_commands` 段,或按约定探测包管理器+`npm/pnpm/yarn run test:unit`),作用域限定 AC 的 `Evidence` 文件。
4. WHEN 项目未配置对应测试套件,THE delegate Runner SHALL 返回 `INCONCLUSIVE` + `failureReason`(含**修复指引**:指向 `/forge init --recipe` 生成脚手架)。 <!-- P1 关联:delegate 失败时引导 recipe -->
5. WHEN `forge_exec` crash,THE delegate SHALL 返回 `INCONCLUSIVE`。
6. THE stale `mixedRunner`(`src/accept-driver.ts:414-419`)SHALL 从 `RUNNERS` 移除。
7. **[契约来源 P3]** THE `contractRunner` SHALL 支持 `Evidence` 指向**代码生成产物**(如 pont/swagger 生成的 `api.d.ts` 或 OpenAPI schema),校验其与 `bash:contract` 命令输出一致;契约来源由 AC 的 `Contract-Source` 字段声明(值为 `openapi` / `pont` / `pact` / `manual`)。 <!-- P3 修复 -->
8. **[负向]** WHEN `Contract-Source` 为 `pont` 但 `Evidence` 指向的生成物为空或过期(mtime 早于源 swagger),THE `contractRunner` SHALL 返回 `INCONCLUSIVE` + `stale contract: rerun pont generate`。 <!-- P3 修复 -->
9. **[超时 P4 修复]** THE delegate Runner SHALL 对单次 `forge_exec` 执行设置超时上限(默认 60s,可在 `.tinkerman/config.md` `delegate_timeout` 配置);超时 SHALL 返回 `INCONCLUSIVE` + `failureReason: "delegate timeout after Ns"`,不无限挂起验收流程(对齐 Google Testing Blog 的 per-layer 时间预算要求)。

> Verify-By: vitest:unit
> Evidence: test/accept-driver.test.ts, test/accept-driver.property.test.ts(delegate 缺套件→INCONCLUSIVE+指引、契约过期检测)

### Requirement 4: API Runner 支持响应体断言

#### Acceptance Criteria

1. THE `buildCurlArgs`(`src/accept-driver.ts:686`)SHALL 接受 `opts.assertBody`;为 `true` 时 curl 保留响应体。
2. THE `evaluateApiVerdict`(`src/accept-driver.ts:652`)SHALL 支持 `data.<path> shall be <value>` 断言,JSONPath 匹配。
3. WHEN `Then` 同时含状态码与 body 断言,THE 两类 SHALL 都通过才 `PASS`。
4. WHEN 仅含状态码断言,THE 行为 SHALL 等价现状(向后兼容)。
5. **[负向]** WHEN 响应非 JSON 或 JSONPath 解析失败,THE 判定 SHALL 为 `FAIL` + `failureReason`(不抛异常)。 <!-- 原有,保留 -->
6. **[安全]** THE body 断言 SHALL 不把完整响应体写入 artifact(可能含敏感数据),仅写入匹配字段的 `path:value` 摘要。 <!-- P4 新增:安全负向 -->

> Verify-By: vitest:unit
> Evidence: test/accept-driver-api-body.property.test.ts(双条件、非JSON→FAIL、脱敏摘要)

### Requirement 5: `aggregateVerdicts` 分层健康度 + 金字塔形态(仅信号)

#### Acceptance Criteria

1. THE `aggregateVerdicts`(`src/accept-driver.ts:443`)SHALL 返回 `layerHealth: {unit, component, contract, e2e}`,每层为 `{pass, fail, inconclusive}`。
2. THE `aggregateVerdicts` SHALL 返回 `pyramidShape: "healthy" | "e2e-heavy" | "empty-middle" | "no-unit" | "empty"`。
3. THE `blocksShip` 语义 SHALL 不变(`fail > 0`)。
4. THE 验收报告(`accept-gate.ts` frontmatter `verdicts_summary`)SHALL 含 `layerHealth` + `pyramidShape`。
5. **[注意]** 本 Req 的 `pyramidShape` 仅为**信号**(advisory);**强制阻断由 Req 7 的比例门禁独立负责**。本 Req 不改 ship gate 语义,避免职责混淆。 <!-- P2 拆分:信号归 Req5,强制归 Req7 -->

> Verify-By: vitest:unit
> Evidence: test/aggregate-verdicts.property.test.ts(layerHealth 一致性、pyramidShape 分类不变量)

### Requirement 6: Recipe 系统 —— 可选测试栈脚手架生成(P1 核心修复)

Forge SHALL 提供可选的 recipe 机制,在用户主动选择时生成**项目本地**的测试栈配置(MSW/vitest/Storybook 等),**Forge 包零依赖增量**,严格遵守 R6.5。

#### Acceptance Criteria

1. THE `/forge init` SHALL 支持 `--recipe <name>` 参数(复用既有 `--pack` 透传模式,`skills/forge/lib/init/instructions.md:36`),透传给 `scripts/init.sh`。
2. THE `scripts/init.sh` SHALL 在 `--recipe` 指定时,从 `templates/recipes/<name>/` 复制模板到**用户项目**的对应目录(不写入 Forge 包)。
3. THE Forge 仓库 SHALL 提供 `templates/recipes/` 目录,初始含至少 `vue3-vitest-msw`(Vue3+Vite+Vitest+MSW)与 `react-vitest-msw`(React+Vite+Vitest+MSW)两个 recipe。
4. EACH recipe SHALL 包含:`package.json.devDeps.snippet`(待合并的依赖声明,**非自动安装**)、`vitest.config.ts`、`msw/handlers.ts`(骨架)、`test/component/` 示例、`README.md`(手动 `pnpm add` 指引)。
5. **[测试哲学 P4 修复]** THE recipe 的 `test/component/` 示例 SHALL 遵循"测行为不测实现"原则:元素查询 SHALL 使用可访问性/语义查询(`getByRole` / `getByText` / `getByLabelText`),SHALL NOT 使用脆弱的实现细节查询(`querySelector('#app .btn')` / 按 CSS class 查询)。README.md SHALL 说明该原则,避免用户写出脆弱测试。 <!-- 对齐 Testing Library 哲学 -->
6. **[L3 交互测试 — P5 推高]** THE recipe 的示例 SHALL 包含至少一个**用户交互**断言(模拟点击/输入后断言后续 UI 变化或接口调用),而非仅静态渲染断言;交互模拟 SHALL 使用语义方式(`userEvent.click(getByRole('button'))` 或组件测试框架等价 API),不依赖 DOM 选择器。 <!-- 推高成熟度 L2→L3 -->
7. **[L4 数据驱动分支 — P5 推高]** EACH recipe SHALL 包含一个**数据驱动分支示例** `test/component/data-driven.example.test.ts`,演示"同一组件 × 多种接口数据 → 不同 UI 分支"的矩阵化测试:用 `it.each` / `describe.each` 枚举至少 2 种接口数据状态(如 `role=admin` vs `role=viewer`),每种用 MSW `server.use(http.get(...))` 注入对应响应,断言不同的可见 UI 分支(如"删除按钮可见 vs 不可见")。此示例是 recipe 的**核心教学文件**,README.md SHALL 引用它说明如何扩展更多分支场景。 <!-- 推高成熟度 L2→L4,直击"接口数据决定 UI 分支"核心痛点 -->
8. **[handler 复用契约 — P6 修正]** THE recipe 的 `msw/handlers.ts` SHALL 导出**单一 handler 注册表**,供**组件测试**(`setupServer`)与**用户项目自有的 Playwright E2E**(`setupWorker`,需用户在应用 HTML 注册 mockServiceWorker)两种模式共用。README.md SHALL **如实说明复用边界**:组件测试复用成立;用户 Playwright E2E 配置 worker 后可复用;**Forge 内置的 `agentBrowserRunner` E2E 走真实 dev server,不消费 MSW worker,不适用此复用**(agent-browser 驱动真实浏览器,不注入 mock)。 <!-- P6 修正:原 AC8 暗示 Forge E2E 也能复用 worker,属虚假承诺。修正为仅组件测试 + 用户 Playwright 可复用。 -->
9. THE recipe 生成 SHALL **不自动执行 `npm/pnpm install`**,仅生成文件并输出"请运行 `<pkg manager> install`"指引(尊重 R6.5 + 用户对依赖的完全控制)。
10. THE recipe 生成 SHALL 检测目标项目的包管理器(`packageManager` 字段 / lockfile),在指引中输出对应命令(pnpm/yarn/npm)。
11. **[R6.5 守护]** THE Forge 的 `package.json` `dependencies`/`devDependencies` SHALL **不因 recipe 功能新增任何 browser/test 依赖**(MSW/Storybook/Playwright 一律不进 Forge 包);契约测试 `test/contract.test.ts` SHALL 增加断言验证此不变量。 <!-- R6.5 铁律守护 -->
12. **[负向]** WHEN `--recipe <name>` 的 `<name>` 不存在于 `templates/recipes/`,THE init SHALL 列出可用 recipe 并以非零退出码停止(不静默失败)。 <!-- P4 -->
13. **[负向 — P6 修正]** WHEN 目标项目已存在 recipe 将要生成的文件(如 `vitest.config.ts`),THE init SHALL 跳过该文件、报告冲突文件清单,并**提示用户手动比对合并**(而非静默跳过)——因为既有配置可能与 recipe 的依赖项(如 jsdom vs happy-dom)不兼容,静默跳过会导致示例测试跑不通。 <!-- P6 修正:原仅"跳过",升级为"跳过+提示合并",防不一致组合 -->
14. **[加解密/拦截器适配 — P6 新增]** THE recipe 的 README.md SHALL 包含一节"**自定义请求层适配**",**指引用户**:若项目 axios/fetch 封装有非标准处理(如响应体加解密、业务码拦截分流),应在 MSW handler 中**返回该封装处理后的数据形态**(而非原始 HTTP 响应),或在组件测试 setup 中**短路该封装**直接测组件逻辑。README SHALL 以伪代码示例说明两种策略。 <!-- 措辞 P7 精确化:原文 "handler SHALL 返回" 易误读为 Forge 强制 handler 行为;改为 "README SHALL 指引用户",明确这是对 recipe 文档的要求,Forge 不代用户决定策略。加解密是项目特有,无法通用自动化,Forge 只负责提醒+给标准解法。原 P6 理由(fe_ch5 encryptSessionInfo)不变。 -->

> Verify-By: bash:contract (init.sh 行为 + R6.5 不变量契约测试), manual (recipe 内容评审)
> Evidence: scripts/init.sh, templates/recipes/, test/r65-no-test-deps.test.ts(Forge 包零 browser/test 依赖断言)

### Requirement 7: 金字塔比例门禁 —— E2E-heavy 阻断(P2 核心修复)

Forge SHALL 在 ship/lock 门禁强制金字塔比例,当 E2E 场景占比超阈值时阻断(可配置降级),使形态反模式从 advisory 升级为 enforcement。

#### Acceptance Criteria

1. THE Forge SHALL 新增 `scripts/check-pyramid-ratio.sh`,在 spec lock / ship 前运行,统计 `e2e` 层场景数占总场景的比例。
2. WHEN `e2e` 场景占比 > `e2e_ratio_threshold`(默认 0.3,可在 `.tinkerman/config.md` 配置)且 `unit+component` 层场景数为 0,THE 门禁 SHALL 阻断,输出"E2E-heavy 反模式:请将组合下沉到 component 层"。
3. WHEN `e2e_ratio_threshold: 0` 或 `strict_pyramid: false`(config.md),THE 门禁 SHALL 降级为警告(非阻断),兼容既有项目。
4. THE 门禁 SHALL 区分**显式 E2E 场景**(`@critical` 标签的 e2e)与**全量 E2E**:仅全量 E2E 计入占比;`@critical` 的关键路径 E2E 不受比例限制(保证安全网)。 <!-- 关键:不误伤关键路径 -->
5. THE `pyramidShape: "e2e-heavy"`(Req 5 的信号)SHALL 与本门禁的阻断判定**保持一致**(同输入同输出,纯函数共享判定逻辑)。 <!-- Req5/Req7 不矛盾 -->
6. **[负向]** WHEN 总场景数 < 3(小 spec),THE 门禁 SHALL 跳过比例检查(避免小功能被误判)。 <!-- P4 -->

> Verify-By: bash:contract
> Evidence: scripts/check-pyramid-ratio.sh, test/check-pyramid-ratio.property.test.ts(阈值阻断、降级、critical 豁免、小 spec 跳过)

## Non-Functional Requirements

- **NFR-1 依赖中立(R6.5 铁律)**:本特性 SHALL 不向 Forge 的 `dependencies`/`devDependencies` 引入 MSW/Storybook/Playwright/Cypress 任一依赖。Recipe 的依赖声明在 `templates/recipes/*/package.json.devDeps.snippet`,**仅作模板文本**,不进 Forge 包,不自动安装。`test/r65-no-test-deps.test.ts` 守护此不变量。
- **NFR-2 向后兼容**:既有 spec 的裸 `Verify-By` 通过 `contract_legacy: true` grandfathering;既有项目无 recipe 时 delegate 返回 INCONCLUSIVE(非 FAIL)。
- **NFR-3 性能**:Delegate Runner 不启浏览器、不打真实 API,编排开销 < 100ms;比例门禁脚本 < 500ms。
- **NFR-4 确定性**:`aggregateVerdicts`、`classifyScenarioType`、`classifyPyramid`、比例门禁判定 SHALL 均为纯函数(无 Date.now/随机/IO)。
- **NFR-5 安全**:curl 经描述符 + execFile;body 断言脱敏(Req 4 AC6);recipe 生成不执行任意代码(仅文件复制)。
- **NFR-6 异构适配**:recipe 至少覆盖 Vue2/Vue3/React;比例门禁的阈值可配,适配不同项目成熟度。

## Out of Scope

- **不实现 mixed runner**(ADR-0006 Alternative A 否决):组合下沉 component 层。
- **不自建组件测试引擎**(ADR-0006 Alternative B 否决):Forge 不内置 MSW/Storybook,recipe 是模板生成不是引擎。
- **不自动安装依赖**:recipe 只生成文件 + 指引,`install` 由用户执行(R6.5 + 用户控制)。
- **不提供 Pact Broker 集成**:契约来源支持声明 `pact`,但不内置 Broker;用户自行接。
- **不改 `/forge test --ui` Layer 2**:control-ui 4 级降级链不在本特性范围。
- **不实现所有可能 recipe**:初始只 vue3/react 两个;Angular/Svelte 等后续扩展。
- **不实现 L5 视觉回归(首版)**:视觉回归(Storybook Chromatic / 截图像素 diff)需 Storybook 全套基础设施与基线管理,成本/价值比在首版低于数据驱动分支(L4)。初始 recipe(`vue3-vitest-msw` / `react-vitest-msw`)不含 Storybook。作为后续 recipe 变体(`<stack>-vitest-msw-storybook`)在**独立 spec**中评估,不在本特性范围。 <!-- P7:消除灰色地带。原 spec 未明确,现显式记录"首版不做、预留扩展位"。 -->

## Delta (brownfield)

### Added

- `ScenarioType` 新增 `unit`/`component`/`contract`。
- `RUNNERS` 新增 3 delegate;移除 `mixedRunner`。
- `buildCurlArgs` 的 `assertBody` + `evaluateApiVerdict` body 断言(含脱敏)。
- `aggregateVerdicts` 的 `layerHealth`/`pyramidShape`。
- `check-spec-contract.sh` 的 `Verify-By: <layer>` 校验。
- **`/forge init --recipe <name>` 参数透传**(`init/instructions.md`)。
- **`templates/recipes/` 目录**(vue3-vitest-msw、react-vitest-msw)。
- **`scripts/check-pyramid-ratio.sh`** 比例门禁。
- **`test/r65-no-test-deps.test.ts`** R6.5 守护契约测试。
- AC 新增 `Contract-Source` 字段(契约来源声明)。

### Modified

- `classifyScenarioType`:优先读 `Verify-By`,关键词降级 fallback。
- `accept-gate.ts` frontmatter:`verdicts_summary` 加 `layerHealth`/`pyramidShape`。
- `scripts/init.sh`:支持 `--recipe` 透传 + 包管理器探测。
- `skills/forge/lib/{spec,test,accept,init}/instructions.md`:同步分层模型 + recipe。
- `.tinkerman/config.md`:新增 `test_commands`、`e2e_ratio_threshold`、`strict_pyramid` 配置项。

### Unchanged

- `Verdict` 联合类型(5 值)。
- `agentBrowserRunner`/`cliRunner`/`apiRunner`(状态码路径)。
- `control-ui` ui-harness 4 级降级链。
- ship gate `blocksShip = (fail > 0)` 语义(比例门禁是独立门禁,不改此语义)。
- Forge `package.json` 的 `dependencies`(R6.5 守护,零增量)。
