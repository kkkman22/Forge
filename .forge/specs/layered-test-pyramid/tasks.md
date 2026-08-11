---
feature: "layered-test-pyramid"
date: "2026-06-20"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
decided_by: "ADR-0006"
revision: 2
---

# tasks.md — Layered Test Pyramid (完整落地版)

## Overview

7 波落地四层金字塔的完整方案。相比 v1 增加 recipe 系统(Wave 6)和比例门禁(Wave 2 并入)。每波独立可 ship,遵循 TDD(§2.1)+ 原子提交(§2.3)。

**总预估**:18-24 工作日。关键路径:Wave1→3→5→6(recipe 依赖 delegate 的 INCONCLUSIVE 指引)。

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "title": "Verify-By:layer 强制门禁 (keystone)",
      "tasks": ["T-01"],
      "rationale": "最高杠杆,后续路由全依赖此契约字段。",
      "depends_on": [],
      "blocks": ["T-03", "T-05", "T-08"]
    },
    {
      "wave": 2,
      "title": "聚合分层信号 + 比例门禁",
      "tasks": ["T-02", "T-08"],
      "rationale": "Req5 信号 + Req7 强制共享 isE2eHeavy 纯函数,同波落地避免逻辑漂移。",
      "depends_on": ["T-01"],
      "blocks": []
    },
    {
      "wave": 3,
      "title": "ScenarioType 扩层 + 分类器",
      "tasks": ["T-03"],
      "rationale": "使 delegate 能被路由。",
      "depends_on": ["T-01"],
      "blocks": ["T-05"]
    },
    {
      "wave": 4,
      "title": "API body 断言 (独立可并行)",
      "tasks": ["T-04"],
      "rationale": "无依赖,可与 Wave2/3 并行。",
      "depends_on": [],
      "blocks": []
    },
    {
      "wave": 5,
      "title": "三个 Delegate Runner + 契约来源",
      "tasks": ["T-05"],
      "rationale": "需 ScenarioType 扩层;含 Contract-Source 对接。",
      "depends_on": ["T-03"],
      "blocks": ["T-06"]
    },
    {
      "wave": 6,
      "title": "Recipe 系统 (P1 核心修复)",
      "tasks": ["T-06"],
      "rationale": "delegate 缺套件时指引 recipe;先有 delegate 的 INCONCLUSIVE 语义。",
      "depends_on": ["T-05"],
      "blocks": []
    },
    {
      "wave": 7,
      "title": "R6.5 守护测试 + docs sync",
      "tasks": ["T-07", "T-09"],
      "rationale": "R6.5 守护是 recipe 的安全网;docs 收尾。",
      "depends_on": ["T-06"],
      "blocks": []
    }
  ]
}
```

## Task Definitions

### T-01 Verify-By:`<layer>` 强制门禁(keystone)

- **Goal**:`check-spec-contract.sh` 拒绝缺 `:layer` 的 Verify-By + 校验 Evidence 文件存在;spec SKILL 白名单更新。
- **TDD Steps**:
  - RED:`test/check-spec-contract.property.test.ts` — 合法5值通过;裸工具名/未知值/空被拒;`contract_legacy:true` 跳过;**Evidence 文件不存在→阻断**(P4)。
  - GREEN:改 `scripts/check-spec-contract.sh` 加正则校验段 + Evidence 存在性检查(`test -f`)。
  - REFACTOR:提 `validateVerifyBy(field)` + `checkEvidenceExists(path)` 纯函数。
- **Verify**:`bash scripts/check-spec-contract.sh .forge/specs/layered-test-pyramid/requirements.md && npx vitest run test/check-spec-contract.property.test.ts`
- **DoD**:非法 Verify-By 非零退出;Evidence 缺失阻断;属性测试全绿。
- **Depends On**: 无
- **Requirement**: Req1

### T-02 `aggregateVerdicts` 分层健康度 + pyramidShape

- **Goal**:聚合返回 layerHealth + pyramidShape;artifact 写入。
- **TDD Steps**:
  - RED:`test/aggregate-verdicts.property.test.ts` — layerHealth 与按 type 分组一致;pyramidShape 分类不变量(e2e-heavy/no-unit/empty);blocksShip 不变。
  - GREEN:改 `aggregateVerdicts`(`accept-driver.ts:443`)加 groupBy + classifyPyramid + **isE2eHeavy 共享纯函数**(Req5/Req7 共用);改 `accept-gate.ts:110`。
  - REFACTOR:提 `classifyPyramid`、`isE2eHeavy(scenarios, config)`、`countByVerdict`。
- **Verify**:`npx vitest run test/aggregate-verdicts.test.ts test/aggregate-verdicts.property.test.ts`
- **DoD**:新字段在 frontmatter;isE2eHeavy 被 Req7 复用。
- **Depends On**: T-01
- **Requirement**: Req5

### T-03 `ScenarioType` 扩层 + classifyScenarioType 读 Verify-By

- **Goal**:类型加 unit/component/contract;分类器优先读 verifyBy;e2e→api 映射。
- **TDD Steps**:
  - RED:`test/accept.classify.property.test.ts` — `vitest:component`→`component`;verifyBy 缺失→等价现状;`forge_exec:e2e`→`api`;**矛盾注解→注解为准+annotation_conflict警告**(P4 AC6)。
  - GREEN:改 `accept.ts:2` 扩枚举;改 `classifyScenarioType:303` 加 verifyBy 参数+优先逻辑+矛盾检测。
  - REFACTOR:提 `parseVerifyByLayer(verifyBy): Layer|null`。
- **Verify**:`npx vitest run test/accept.classify.property.test.ts`
- **DoD**:5 新 type 值可分类;向后兼容;矛盾检测生效。
- **Depends On**: T-01
- **Requirement**: Req2

### T-04 API Runner body 断言(可并行)

- **Goal**:buildCurlArgs 支持 assertBody;evaluateApiVerdict 支持 body 断言 + 脱敏。
- **TDD Steps**:
  - RED:`test/accept-driver-api-body.property.test.ts` — 仅状态码→等价现状;含body→双条件;非JSON→FAIL+reason;**脱敏:artifact 不含完整body,仅 path:value**(P4 AC6)。
  - GREEN:改 `buildCurlArgs:686`;改 `evaluateApiVerdict:652` 加 splitBodyAndStatus + matchJsonPath + **redactBody**。
  - REFACTOR:body 解析/JSONPath/脱敏各纯函数化。
- **Verify**:`npx vitest run test/accept-driver-api-body.property.test.ts`
- **DoD**:body 断言可用;脱敏生效;向后兼容。
- **Depends On**: 无
- **Requirement**: Req4

### T-05 三个 Delegate Runner + Contract-Source

- **Goal**:RUNNERS 加3 delegate 移 mixed;delegate 含 recipe 指引;Contract-Source + 契约过期检测。
- **TDD Steps**:
  - RED:扩 `test/accept-driver.property.test.ts` — 缺套件→INCONCLUSIVE+**recipe 指引文本**;crash→INCONCLUSIVE;exit0→PASS;exit≠0→FAIL;**Contract-Source=pont 但生成物过期→INCONCLUSIVE+rerun提示**(P3 AC8);mixed 已移除。
  - GREEN:实现 unit/component/contractRunner(共享 runDelegate);RUNNERS 改;删 mixedRunner;delegate failureReason 含 `/forge init --recipe` 指引;Contract-Source 解析 + mtime 校验。
  - REFACTOR:提 `resolveTestCommand(ctx, script)`、`runDelegate`、`checkContractFresh(evidence, source)`。
- **Verify**:`npx vitest run test/accept-driver.property.test.ts test/accept-driver.test.ts`
- **DoD**:3 delegate 可调度;recipe 指引输出;契约过期检测。
- **Depends On**: T-03
- **Requirement**: Req3

### T-06 Recipe 系统(P1 核心 + P5 推高)

- **Goal**:`/forge init --recipe <name>` 生成项目本地 MSW/vitest 配置;两 recipe;包管理器探测;冲突检测;**含 L3 交互示例 + L4 数据驱动分支示例 + handler 复用结构**(推高成熟度到 L4)。
- **TDD Steps**:
  - RED:`test/init-recipe.test.sh` — recipe 生成到用户项目临时目录;**未知 recipe→非零退出+列出可用**(AC12);**文件冲突→跳过+报告**(AC13);包管理器探测正确;**不自动 install**(AC9)。
  - GREEN:
    - 改 `scripts/init.sh` 加 `--recipe` 段 + `detect_package_manager` + `copy_recipe_files`(冲突检测)。
    - 建 `templates/recipes/vue3-vitest-msw/` 和 `react-vitest-msw/`,完整结构:
      ```
      ├─ package.devDeps.snippet
      ├─ vitest.config.ts          (jsdom + setup 引用)
      ├─ msw/
      │  ├─ handlers.ts             (★ 单一注册表,AC8)
      │  ├─ server.ts               (setupServer,组件测试)
      │  └─ browser.ts              (setupWorker,E2E/浏览器)
      ├─ test/
      │  ├─ setup.ts                (listen/reset/close)
      │  └─ component/
      │     ├─ interaction.example.test.ts   (★ L3 交互断言,AC6)
      │     └─ data-driven.example.test.ts   (★ L4 数据驱动分支,AC7,核心教学)
      └─ README.md                  (安装指引 + 测试哲学 + 分支扩展说明,AC5/AC7/AC8)
      ```
    - `data-driven.example.test.ts` 用 `describe.each` 枚举 2 种接口数据,`server.use(http.get(...))` 注入,语义查询断言不同 UI 分支(见 design.md 范式样板)。
    - `interaction.example.test.ts` 含至少一个 `userEvent.click`/等价交互 + 后续断言。
    - 更新 `init/instructions.md`。
  - REFACTOR:init.sh 的 recipe 段提为独立函数;recipe 目录结构标准化(两 recipe 共享 handlers/server/browser 结构,仅组件层差异)。
- **Verify**:`bash test/init-recipe.test.sh && bash scripts/init.sh --recipe vue3-vitest-msw --dry-run`
- **DoD**:
  - 两 recipe 可生成;冲突跳过;未知报错;无自动 install(AC1-4,9-10,12);
  - **文件冲突时提示手动合并(AC13,P6 修正)**,不静默跳过;
  - **`data-driven.example.test.ts` 含 ≥2 种数据状态矩阵化测试(AC7)**;
  - **`interaction.example.test.ts` 含用户交互断言(AC6)**;
  - **handlers 单一注册表,组件测试 + 用户 Playwright 复用;README 如实标注 Forge agent-browser E2E 不复用(AC8,P6 修正)**;
  - **README 含"自定义请求层适配"章节,说明加解密/拦截器两种适配策略(AC14,P6 新增)**;
  - 示例全部用语义查询,无 `querySelector`/CSS class(AC5)。
- **Depends On**: T-05(delegate 指引指向 recipe)
- **Requirement**: Req6

### T-07 R6.5 守护契约测试

- **Goal**:断言 Forge package.json 零 browser/test 依赖,守护 recipe 不破 R6.5。
- **TDD Steps**:
  - RED:`test/r65-no-test-deps.test.ts` — 读取 Forge package.json,断言 dependencies+devDependencies 不含 `msw|storybook|playwright|cypress|@testing-library|puppeteer` 任一(用禁用列表)。
  - GREEN:测试本身即实现(契约测试);若当前通过则 GREEN(现状本就满足)。
  - REFACTOR:禁用列表提为常量 `FORBIDDEN_TEST_DEPS`,便于扩展。
- **Verify**:`npx vitest run test/r65-no-test-deps.test.ts`
- **DoD**:守护测试通过;未来误加依赖会被此测试拦截。
- **Depends On**: T-06(recipe 功能就位后验证其未破 R6.5)
- **Requirement**: Req6 AC7

### T-08 金字塔比例门禁(P2 核心)

- **Goal**:check-pyramid-ratio.sh 强制 E2E 占比;config 配置项;@critical 豁免;小 spec 跳过。
- **TDD Steps**:
  - RED:`test/check-pyramid-ratio.property.test.ts` — e2e>阈值且middle=0→阻断;`strict_pyramid:false`→降级警告;**@critical e2e 不计入占比**;**total<3→跳过**(P4 AC6);复用 isE2eHeavy 纯函数(与 Req5 一致)。
  - GREEN:建 `scripts/check-pyramid-ratio.sh`;config.md 模板加 `e2e_ratio_threshold`/`strict_pyramid`;复用 T-02 的 isE2eHeavy。
  - REFACTOR:isE2eHeavy 已在 T-02 提取,此处 shell 调用 ts 编译产物或重写同逻辑(保持判定一致)。
- **Verify**:`bash scripts/check-pyramid-ratio.sh .forge/specs/layered-test-pyramid/requirements.md && npx vitest run test/check-pyramid-ratio.property.test.ts`
- **DoD**:门禁阻断 e2e-heavy;critical 豁免;小 spec 跳过;与 Req5 信号一致。
- **Depends On**: T-01(读 Verify-By)、T-02(isE2eHeavy 共享)
- **Requirement**: Req7

### T-09 Docs sync

- **Goal**:4 个 SKILL + AGENTS.md + config 模板同步。
- **TDD Steps**:
  - RED:`npm run check`(含 docs-governance、validate-skill-*)预期新描述通过。
  - GREEN:更新 `skills/forge/lib/{spec,test,accept,init}/instructions.md`、`AGENTS.md` 测试章节、`.forge/config.md` 模板。
  - REFACTOR:无。
- **Verify**:`npm run check`
- **DoD**:npm run check 全绿;契约测试 SKILL/agent 字段校验通过。
- **Depends On**: T-07
- **Requirement**: 跨 Req

## DoD (整体)

- [ ] 7 个 Requirement 全部 AC 通过验证。
- [ ] `npm run check` 全绿(typecheck/lint/契约/smoke/dist-sync)。
- [ ] `npm run test:coverage` 达标(新增代码 ≥ 门禁 lines 87/functions 90)。
- [ ] **`test/r65-no-test-deps.test.ts` 通过(Forge 包零 test 依赖)**。
- [ ] **`test/init-recipe.test.sh` 通过(recipe 生成正确)**。
- [ ] ADR-0006 `accepted`;本 spec 三文件 `locked`。
- [ ] 本 spec 自身 AC 全用 `Verify-By: <layer>` + Contract-Source(dogfood)。
- [ ] git log 每波一个原子提交(§2.3)。
- [ ] **比例门禁对本 spec 自身不误报**(本 spec 7 个 Req,unit/component 层 AC 充足,e2e 占比低)。

## v1→v2 任务差异

| v1 任务 | v2 变化 |
|---------|---------|
| T-01~T-05(5个) | 保留,AC 增强负向场景 + 契约来源 + 脱敏 |
| T-06(docs) | 拆为 T-09 |
| **新增 T-06** | Recipe 系统(P1) |
| **新增 T-07** | R6.5 守护测试 |
| **新增 T-08** | 比例门禁(P2) |
