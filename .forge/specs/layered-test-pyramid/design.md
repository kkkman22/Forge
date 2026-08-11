---
feature: "layered-test-pyramid"
date: "2026-06-20"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
decided_by: "ADR-0006"
revision: 2
revision_reason: "推到成熟方案完整落地:补 recipe 系统(P1)、比例门禁(P2)、契约来源(P3)、负向 AC(P4)"
---

# design.md — Layered Test Pyramid (完整落地版)

## Overview

将 Forge 验收模型从"扁平 accept + 裸 test"重塑为四层组合金字塔的**完整落地**。相比 v1,本版补齐了让金字塔真正可用的三块短板:

| 短板 | v1 状态 | v2 修复 | Req |
|------|---------|---------|-----|
| P1 中间层空壳(组件层无脚手架) | delegate 是路由层 | Recipe 系统生成项目本地 MSW/vitest 配置 | **Req 6** |
| P2 形态无约束(E2E-heavy 仅警告) | advisory 信号 | 比例门禁独立阻断 | **Req 7** |
| P3 契约层无来源 | `bash:contract` 只跑命令 | `Contract-Source` 字段 + 生成物校验 | **Req 3** |
| P4 缺负向场景 | 全正向 AC | 每个 Req 补负向 AC | 各 Req |

**核心设计原则**:
1. **keystone 优先**(`Verify-By: <layer>`)。
2. **委托而非自建**(delegate 经 forge_exec 委托)。
3. **生成而非集成**(recipe 模板写入用户项目,Forge 包零增量,守 R6.5)。
4. **信号与强制分离**(Req 5 出信号,Req 7 出强制,职责不混淆)。
5. **诚实三态**(缺套件/过期契约 → INCONCLUSIVE,含修复指引)。

## Architecture

### 分层路由架构(Req 1-5)

```
spec AC → Verify-By: <layer> [+ Contract-Source]
            │
    classifyScenarioType (优先读 Verify-By,关键词 fallback)
            │
    ┌───────┴──────────────────┐
    ▼                          ▼
/forge test Layer1          /forge accept (仅 e2e)
  unit/component/contract     api/ui/cli (真实执行)
  delegate → forge_exec       (注:执行位置可落在 test 或 accept,
  → 项目 vitest/schema          由 config.md stage_routing 决定)
            │
    aggregateVerdicts
      layerHealth + pyramidShape (信号,Req5)
            │
    check-pyramid-ratio.sh (强制门禁,Req7,独立于 ship gate)
```

### Recipe 生成架构(Req 6,P1 修复)

```
用户: /forge init --recipe vue3-vitest-msw
            │
   skills/forge/lib/init (透传 --recipe)
            │
   scripts/init.sh
     ├─ 探测包管理器 (packageManager / lockfile)
     ├─ 定位 templates/recipes/vue3-vitest-msw/
     ├─ 复制到用户项目 (不写 Forge 包):
     │    ├─ vitest.config.ts
     │    ├─ msw/handlers.ts (骨架)
     │    ├─ test/component/示例.test.ts
     │    ├─ package.devDeps.snippet (文本,非安装)
     │    └─ README.md (pnpm add 指引)
     ├─ 冲突检测 (已存在则跳过+报告)
     └─ 输出 "请运行 pnpm add -D msw vitest @vue/test-utils"
            │
   用户: pnpm add -D msw vitest @vue/test-utils  (用户执行,非 Forge)
            │
   Forge 包: 零依赖增量 (R6.5 守护,test/r65-no-test-deps.test.ts 验证)
```

**关键边界**:recipe 模板是**文本资源**,随 plugin/clone 分发(templates/ 已是分发内容),但其中的依赖声明**永远不被 Forge 解析或安装**——只是写给用户项目的 `pnpm add` 指引文本。

### 金字塔比例门禁架构(Req 7,P2 修复)

```
spec lock / ship 前:
            │
   scripts/check-pyramid-ratio.sh
     ├─ 解析 spec 的全部场景 + Verify-By
     ├─ 统计: total / e2e(非@critical) / unit+component
     ├─ total < 3 → 跳过 (小 spec 豁免)
     ├─ strict_pyramid: false 或 e2e_ratio_threshold: 0 → 降级警告
     ├─ e2e占比 > 阈值 且 unit+component=0 → 阻断 (e2e-heavy)
     └─ @critical e2e 不计入占比 (保护关键路径安全网)
            │
   与 Req5 pyramidShape 共享判定纯函数 isE2eHeavy(scenarios, config)
```

## Component Interfaces

### 1-5. (与 v1 一致,见下方"未变接口")

`classifyScenarioType`、delegate Runner、`buildCurlArgs`/`evaluateApiVerdict`、`aggregateVerdicts` 的核心签名与 v1 相同,增加项:
- `evaluateApiVerdict` body 断言新增**脱敏**:`redactBody(body, matchedPaths)` 仅保留断言命中的 `path:value`,不写完整 body。
- delegate `failureReason` 增加 recipe 指引:`` `component suite not configured — run /forge init --recipe vue3-vitest-msw` ``。

### 6. Recipe 系统(NEW)

```bash
# scripts/init.sh 新增段 (透传模式,与 --pack 同构)
if [[ "$1" == "--recipe" ]]; then
  recipe_name="$2"
  recipe_dir="${SCRIPT_DIR}/../templates/recipes/${recipe_name}"
  if [[ ! -d "$recipe_dir" ]]; then
    echo "❌ recipe '$recipe_name' not found. Available:"
    ls "${SCRIPT_DIR}/../templates/recipes/" 2>/dev/null
    exit 1
  fi
  pkg_manager=$(detect_package_manager)   # packageManager / lockfile 探测
  copy_recipe_files "$recipe_dir" "$PROJECT_ROOT"  # 冲突检测:已存在则跳过
  echo "✅ recipe '$recipe_name' generated. Run: $pkg_manager add -D $(cat "$recipe_dir/package.devDeps.snippet")"
fi
```

```typescript
// templates/recipes/vue3-vitest-msw/package.devDeps.snippet (纯文本,非 JSON 解析对象)
msw vitest @vue/test-utils jsdom @vitest/coverage-v8
```

**契约**:recipe 目录名即 `--recipe` 参数值;生成物只进用户项目;`devDeps.snippet` 是空格分隔的包名文本,由 init.sh 拼成 `<pkg> add -D <names>` 指令输出给用户,**Forge 不执行该指令**。

#### Recipe 目录结构(P5 推高:L2 基础设施 → L4 数据驱动分支)

```
templates/recipes/vue3-vitest-msw/
├─ package.devDeps.snippet          # 纯文本包名
├─ vitest.config.ts                 # jsdom 环境 + setup 引用
├─ msw/
│  ├─ handlers.ts                   # ★ 单一 handler 注册表(server/worker 共用,AC8)
│  ├─ server.ts                     # setupServer(...handlers) 组件测试用
│  └─ browser.ts                    # setupWorker(...handlers) E2E/浏览器用
├─ test/
│  ├─ setup.ts                      # beforeAll listen / afterEach reset / afterAll close
│  └─ component/
│     ├─ interaction.example.test.ts  # L3:用户交互断言(AC6)
│     └─ data-driven.example.test.ts  # ★ L4:数据驱动分支示例(AC7,核心教学)
└─ README.md                        # 安装指引 + 测试哲学 + 分支扩展示范
```

#### 数据驱动分支示例范式(AC7 的落地样板)

这是 recipe 推高成熟度的**核心教学文件**,直接示范"接口数据决定 UI 分支"如何测:

```typescript
// templates/recipes/*/test/component/data-driven.example.test.ts
import { mount, flushPromises } from '@vue/test-utils'  // Vue3 示例
import { server } from '../../msw/server'
import { http, HttpResponse } from 'msw'
import RolePanel from '@/components/RolePanel.vue'

// ★ 矩阵化:同一组件 × 多种接口数据 → 不同 UI 分支
const cases = [
  { role: 'admin',  deleteButtonVisible: true,  desc: 'admin 能看到删除按钮' },
  { role: 'viewer', deleteButtonVisible: false, desc: 'viewer 看不到删除按钮' },
] as const

describe.each(cases)('RolePanel 当 role=$role', ({ role, deleteButtonVisible, desc }) => {
  it(desc, async () => {
    server.use(                                    // MSW 注入对应接口数据
      http.get('/api/user', () =>
        HttpResponse.json({ code: 1000, data: { role } }))
    )
    const wrapper = mount(RolePanel)
    await flushPromises()
    const btn = wrapper.find('[role="button"]')    // 语义查询(AC5)
    expect(btn.exists()).toBe(deleteButtonVisible)
  })
})
```

**设计要点**:此示例是 `manual` 验证(内容评审),不进 Forge 测试套件;但它固化了**数据驱动分支的标准写法**,用户照着扩展即可覆盖 N 角色 × M 场景。这正是把组合爆炸从 E2E 下沉到组件层的**范式载体**。

#### handler 复用模式(AC8 — P6 修正复用边界)

```typescript
// msw/handlers.ts —— 单一注册表
export const handlers = [
  http.get('/api/user', () => HttpResponse.json({ code: 1000, data: { role: 'viewer' } })),
]
// msw/server.ts  → setupServer(...handlers)   组件测试(Node):✅ 复用成立
// msw/browser.ts → setupWorker(...handlers)   用户项目自有 Playwright E2E:✅ 配置 worker 后复用
```

**复用边界(P6 修正,务必如实)**:

| 消费方 | 是否复用 handlers | 原因 |
|--------|-----------------|------|
| 组件测试(`setupServer`,Node 进程) | ✅ | MSW 在 Node http 层拦截,handler 直接生效 |
| 用户项目自有 Playwright E2E | ✅(需配置) | 用户在应用 HTML 注册 `mockServiceWorker.js` 后,worker 拦截生效 |
| **Forge 内置 `agentBrowserRunner`** | ❌ | agent-browser 驱动**真实 dev server**,不注入 MSW worker,走真实后端 |

> ⚠️ **P6 修正说明**:原 AC8 暗示"组件测试与 E2E 复用"对所有 E2E 成立,但 Forge 内置 E2E(agent-browser)不消费 worker。README.md 必须如实标注此边界,避免用户误以为"用了 Forge accept 就自动复用 MSW handler"。

#### 自定义请求层适配(AC14 — P6 新增)

通用 recipe 模板不懂项目的业务封装。对有**非标准 axios/fetch 拦截器**的项目(如 fe_ch5 的 `encryptSessionInfo`/`decryptSessionInfo` 加解密 + 业务码分流),README.md 必须指引两种适配策略:

```typescript
// 策略 A:handler 返回"封装处理后"的数据形态
//   适用于:想测真实封装链路
http.get('/api/user', () =>
  HttpResponse.json({ code: 1000, data: { role: 'admin' } }))  // 已是业务码分流后的形态

// 策略 B:组件测试 setup 中短路封装,直接测组件逻辑
//   适用于:封装链路另有单测,组件测试只关心 UI 分支
vi.mock('@/utils/http', () => ({
  request: vi.fn((url) => /* 直接返回业务数据,跳过加解密 */)
}))
```

README.md SHALL 用伪代码说明这两种策略,避免"标准 handler 在加解密项目上 mock 下绿、真实环境挂"。加解密链路本身由项目的 unit 测试覆盖,不进组件测试职责。

### 7. 比例门禁(NEW)

```bash
# scripts/check-pyramid-ratio.sh
TOTAL=$(count_scenarios "$spec")
E2E_NON_CRITICAL=$(count_scenarios "$spec" --layer e2e --exclude-tag @critical)
MIDDLE=$(count_scenarios "$spec" --layer unit,component,contract)

THRESHOLD=$(read_config e2e_ratio_threshold 0.3)
STRICT=$(read_config strict_pyramid true)

if [[ $TOTAL -lt 3 ]]; then exit 0; fi                        # 小 spec 豁免
if [[ "$STRICT" == "false" || $THRESHOLD == 0 ]]; then warn; exit 0; fi
RATIO=$(echo "scale=2; $E2E_NON_CRITICAL / $TOTAL" | bc)
if (( $(echo "$RATIO > $THRESHOLD" | bc) )) && [[ $MIDDLE -eq 0 ]]; then
  echo "❌ E2E-heavy anti-pattern: e2e=${RATIO} > ${THRESHOLD}, middle=0"
  echo "   将组合下沉到 component 层 (/forge init --recipe)"
  exit 1
fi
```

```typescript
// src/accept-driver.ts — Req5/Req7 共享判定纯函数
export function isE2eHeavy(scenarios, config): boolean {
  const total = scenarios.length;
  if (total < 3) return false;
  const e2eNonCritical = scenarios.filter(s =>
    layerOf(s.type) === "e2e" && !s.tags.includes("@critical")).length;
  const middle = scenarios.filter(s =>
    ["unit","component","contract"].includes(s.type)).length;
  return e2eNonCritical / total > config.e2eRatioThreshold && middle === 0;
}
```

## Data Model

### 新增配置(`.forge/config.md`)

```yaml
test_commands:                    # delegate 命令映射(覆盖约定探测)
  unit: "pnpm run test:unit"
  component: "pnpm run test:component"
  contract: "pnpm run test:contract"
e2e_ratio_threshold: 0.3          # E2E 占比上限(默认 0.3)
strict_pyramid: true              # 比例门禁是否阻断(false=仅警告)
```

### 新增 AC 字段

- `Contract-Source: openapi | pont | pact | manual`(仅 `bash:contract` 层 AC 需要)。

### 类型扩展(同 v1)

`ScenarioType` 加 3 值;新增 `PyramidShape` 联合类型。

## Error Handling

| 场景 | 处理 | 判定 | v2 变化 |
|------|------|------|---------|
| delegate 缺套件 | INCONCLUSIVE + recipe 指引 | 非阻断 | **v2 加修复指引** |
| 契约生成物过期 | INCONCLUSIVE + `rerun generate` | 非阻断 | **v2 新增** |
| body 含敏感数据 | 脱敏后写 artifact | — | **v2 新增** |
| recipe 名不存在 | 非零退出 + 列出可用 | 阻断 | **v2 新增** |
| recipe 文件冲突 | 跳过 + 报告 | 非阻断 | **v2 新增** |
| E2E-heavy | **阻断**(strict)或警告 | 可配 | **v2 从 advisory 升 enforcement** |
| spec 总场景<3 | 跳过比例检查 | — | **v2 新增豁免** |
| Verify-By 与文本矛盾 | 注解为准 + 警告 | 非阻断 | **v2 新增** |

## Testing Strategy

| Req | 测试 | 关键属性 |
|-----|------|---------|
| Req1 | check-spec-contract.property | 合法/非法值、矛盾注解、Evidence 缺失 |
| Req2 | accept.classify.property | 注解→type、e2e→api 映射 |
| Req3 | accept-driver.property | delegate INCONCLUSIVE+指引、契约过期 |
| Req4 | accept-driver-api-body.property | 双条件、脱敏、非JSON |
| Req5 | aggregate-verdicts.property | layerHealth、pyramidShape |
| **Req6** | **r65-no-test-deps.test.ts** | **Forge 包零 browser/test 依赖(核心守护)** |
| **Req6** | **init-recipe.test.sh** | recipe 生成、冲突跳过、未知 recipe 报错 |
| **Req7** | **check-pyramid-ratio.property** | 阈值阻断、降级、critical 豁免、小spec跳过 |

**R6.5 守护测试是 Req6 的灵魂**:`test/r65-no-test-deps.test.ts` 断言 Forge `package.json` 的 dependencies/devDependencies 不含 `msw|storybook|playwright|cypress|@testing-library` 等任一包名——这道契约测试确保未来任何人误加依赖都会被 CI 拦截。

## Rollout

7 波,按依赖与杠杆排序:

1. **Wave 1**:Req1 keystone 门禁(最高杠杆)
2. **Wave 2**:Req5 聚合分层(纯函数)+ Req7 比例门禁(依赖 Req5 的判定函数)
3. **Wave 3**:Req2 ScenarioType 扩层
4. **Wave 4**:Req4 API body 断言(独立,可并行)
5. **Wave 5**:Req3 delegate Runner(依赖 Req2)
6. **Wave 6**:Req6 Recipe 系统(依赖 Req3 的 INCONCLUSIVE 指引)
7. **Wave 7**:Req6 的 R6.5 守护测试 + docs sync(收尾)

## Open Questions

- ~~Q1 `e2e` 映射~~:**已落定** Req2 AC5——映射到 `api`,不新增枚举。
- Q2 delegate 命令探测:无 `test_commands` 配置时,探测 `packageManager` + 约定 `run test:unit`。build 阶段细化。
- Q3 recipe 的 Storybook 可选性:初始 recipe 只含 MSW+vitest(组件测试最小集),Storybook 作为 recipe 变体(`vue3-vitest-msw-storybook`)后续加。倾向先 ship 最小集。
- Q4 比例门禁与 accept 的关系:比例门禁检查的是 **spec 的场景分布**(lock 时),不是 accept 运行结果(ship 时)。两者都跑,检查对象不同。

## Current State (brownfield)

### 相关模块

| 模块 | 位置 | 当前职责 | 是否改 |
|------|------|---------|--------|
| accept 场景类型 | `src/accept.ts:2` | 5 值枚举 | 改:加3值 |
| 场景分类 | `src/accept.ts:303` | 关键词启发式 | 改:优先Verify-By |
| Runner 注册表 | `src/accept-driver.ts:426` | RUNNERS 4项 | 改:加3 delegate,移mixed |
| mixed runner | `src/accept-driver.ts:414` | 空SKIP | 移除 |
| curl 构造 | `src/accept-driver.ts:686` | 丢body | 改:加assertBody+脱敏 |
| API 判定 | `src/accept-driver.ts:652` | 仅状态码 | 改:加body断言 |
| 聚合 | `src/accept-driver.ts:443` | 扁平计数 | 改:加layerHealth/pyramidShape |
| spec 门禁 | `scripts/check-spec-contract.sh` | 仅字段存在 | 改:加Verify-By校验 |
| **init** | `skills/forge/lib/init` + `scripts/init.sh` | `.forge/` 初始化 | **改:加--recipe透传** |
| **templates** | `templates/` | spec/ddd/cmux 模板 | **扩:加recipes/目录** |
| contract grandfathering | `src/contract-validator.ts:81` | legacy跳过 | 复用 |
| accept artifact | `src/accept-gate.ts:110` | verdicts_summary | 改:加分层字段 |
| **config** | `.forge/config.md` | 项目配置 | **扩:加test_commands/ratio配置** |

### 结构概览

- `src/accept.ts`:场景解析/分类(纯函数)
- `src/accept-driver.ts`:Runner + 聚合(含I/O边界)
- `scripts/init.sh`:初始化脚本(交互式,`read -rp`)
- `scripts/check-spec-contract.sh`:spec 门禁
- `templates/`:分发模板(随 plugin 进用户,但不进 npm `files`)

## Proposed Change (brownfield)

### To Change

1. `src/accept.ts`:ScenarioType 扩3值;classifyScenarioType 加 verifyBy 参数(Req1 AC5、Req2)。
2. `src/accept-driver.ts`:RUNNERS 加3 delegate 移mixed;buildCurlArgs 加assertBody+脱敏;evaluateApiVerdict 加body断言;aggregateVerdicts 加layerHealth/pyramidShape + 共享 isE2eHeavy。
3. `scripts/check-spec-contract.sh`:加 Verify-By:layer 校验 + Evidence 存在性校验。
4. `scripts/init.sh`:加 --recipe 透传 + 包管理器探测 + 冲突检测。
5. `scripts/check-pyramid-ratio.sh`:新增比例门禁脚本。
6. `templates/recipes/vue3-vitest-msw/` + `templates/recipes/react-vitest-msw/`:新增两个 recipe。
7. `src/accept-gate.ts`:frontmatter 加分层字段。
8. `skills/forge/lib/{spec,test,accept,init}/instructions.md`:同步。
9. `.forge/config.md`(模板):加 test_commands/e2e_ratio_threshold/strict_pyramid。
10. `test/r65-no-test-deps.test.ts`:新增 R6.5 守护。

### Explicitly Unchanged

- `Verdict` 联合类型。
- `agentBrowserRunner`/`cliRunner`/`apiRunner` 状态码路径。
- `control-ui` ui-harness 4 级降级链。
- ship gate `blocksShip=(fail>0)` 语义(比例门禁独立)。
- **Forge `package.json` dependencies(R6.5 守护,零增量)**。
- Forge `files` 字段(npm 发布内容不变)。

## Reversibility (brownfield)

### Rollback Checklist

| 改动 | 回滚 | 难度 |
|------|------|------|
| Req1 门禁 | 删 check-spec-contract.sh 新增段 | 极低 |
| Req2 类型 | 移除3枚举值;删verifyBy参数 | 低 |
| Req3 delegate | RUNNERS删3项;恢复mixed | 低 |
| Req4 body | 删assertBody/body断言 | 低 |
| Req5 聚合 | 删layerHealth/pyramidShape | 低 |
| **Req6 recipe** | 删 templates/recipes/;init.sh 删--recipe段 | **低(纯删除,无依赖残留)** |
| **Req7 门禁** | 删 check-pyramid-ratio.sh;config删配置项 | **低** |

**关键回滚特性**:Req6(recipe)和 Req7(门禁)都是**纯新增**,回滚即删除文件/段,无既有行为依赖。Req1 单独回滚即禁用新路由且不破坏编译。

### Mount Points

- `RUNNERS` 数组(`accept-driver.ts:426`)
- `classifyScenarioType`(`accept.ts:303`)
- `aggregateVerdicts`(`accept-driver.ts:443`)
- `scripts/init.sh` 的参数解析段
- `templates/recipes/` 目录
- `.forge/config.md` 配置项

### 漂移信号

- `Verdict` 增值 → layerHealth 计数需同步。
- ScenarioType 增值 → `classifyPyramid` 归类映射需更新。
- **Forge package.json 增依赖 → `test/r65-no-test-deps.test.ts` 会立即失败**(R6.5 守护的漂移检测)。
- recipe 增值 → init.sh 的 `--recipe` 列表输出需同步。

## 与 v1 的差异(审计回应)

本 v2 直接回应了 v1 审计指出的四个问题:

- **P1(中间层空壳)**→ Req6 recipe 系统让组件层真正可用,且守 R6.5(生成到用户项目,Forge 零增量)。
- **P2(形态无约束)**→ Req7 比例门禁从 advisory 升 enforcement,与 Req5 信号职责分离。
- **P3(契约无来源)**→ Req3 AC7/AC8 新增 `Contract-Source` 字段 + 生成物过期检测。
- **P4(缺负向场景)**→ 每个 Req 补充负向 AC(矛盾注解、Evidence缺失、recipe冲突、小spec豁免等)。
