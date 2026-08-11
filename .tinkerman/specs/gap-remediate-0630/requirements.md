---
status: locked
feature: gap-remediate-0630
layout: requirements
created: 2026-06-30
tier: standard
work_nature: bugfix
brownfield: true
related:
  - arch-review-remediate-0626
  - dead-code-assertion-gate
  - immutable-evidence-artifacts
  - agent-frontmatter-hardening
---

# Requirements — Gap Remediate 0630

> 本 spec 起源于 2026-06-30 一次"不信任 task 勾选"的代码级 spec 完成度复核。复核亲自验证后确认 **4 个缺口属实**,2 个为复核中纠正的误报(已在复核记录中澄清)。
>
> 在追问 `check-spec-status.mjs` 异常分布(locked 136 / approved 109)时,进一步定位到**spec 状态体系的双层缺陷**(REQ-06/07):统计脚本按文件而非目录计、且 design.md/tasks.md 的 status 是被污染的野字段(混入 `done|blocked|failed`、`<go|no-go|conditional-go>` 等非枚举值)。这是 INDEX 报"100 completed"但实测"三件全 completed 仅 1 个"的根因,使**所有 spec 的完成判定不可信**。本 spec 既补 4 个确认缺口,也治理这一体系缺陷。

## 背景

复核对最近批次(06-26~06-29)的 spec 逐条对照代码验证"Definition of Done",发现:

- `arch-review-remediate-0626` 已 `approved`,但 T-01 / T-03 / T-08 三个任务实际未做。其中 **T-01 的前提("state-machine 是零引用孤岛")被代码证伪**——它有真实生产消费者(`src/domain/reservations/`、`src/pack/domain-bundle.ts`、`src/index.ts:132`)。该任务不能按原样执行,需要正式裁决。
- `dead-code-assertion-gate`(`draft`)完全未实现:脚本不存在、未接入 check 链。它存在的意义正是防止上面 state-machine 这类"误判孤岛"的错误重演。
- `immutable-evidence-artifacts` T-07 的 `validateArtifactBackedVerdict` 函数已实现且有单测,但**未接入 `npm run check`**,门禁形同虚设。
- `agent-frontmatter-hardening` 的 `lint-agents.mjs` 校验器只强制 `name`/`description`,没有强制 spec 新增的 `disallowedTools`/`memory` 等字段(注:T1 的 `disallowedTools` 实际已落地,经复核纠正,不在本 spec 范围)。

## 范围

**In Scope(4 项确认缺口)**:

1. 对 `arch-review-remediate-0626` 的 T-01 做正式裁决并落实(撤销 / 转移消费者);T-03、T-08 重新评估是否仍需执行。
2. 实现 `dead-code-assertion-gate` 的核心门禁(脚本 + check 链接入 + skip 机制 + state-machine 反向回归 fixture)。
3. 将 `validateArtifactBackedVerdict` 接入 `npm run check`(或判定不接入并给出理由 + 更新 spec DoD)。
4. 扩展 `lint-agents.mjs` 强制校验 frontmatter 新字段(disallowedTools/memory 等)。
5. 修复 `check-spec-status.mjs` 按目录统计的 bug,让分布数字反映真实 spec 数(REQ-06)。
6. 治理 spec 状态体系:清除 design.md/tasks.md 的 status 野字段,确立 requirements.md 为 spec 级 status 唯一事实源(REQ-07)。

**Out of Scope**:

- 不重新实现 `dead-code-assertion-gate` 第四维(data-dir 启发式扫描)的"显式映射表"升级(留 Open Question)。
- 不逐条核对全库 962 个未勾 task 的真实完成度(REQ-07 会让 status 字段可信,但逐条核对仍是后续工作)。
- 不处理复核中已澄清的 2 个误报(agent-frontmatter T1、domain-example T9a)。

## 功能需求

### REQ-01:arch-review-remediate-0626 T-01 正式裁决

T-01 原任务"删除 `src/state-machine/` 孤岛"的前提("零引用孤岛")与代码事实矛盾。必须给出正式裁决并落到 spec:

- **裁决 A(撤销)**:认定 T-01 作废,在 `arch-review-remediate-0626/tasks.md` 标注 `status_note` 说明撤销理由(引用真实消费者证据),T-09 不变式终验相应调整。
- **裁决 B(迁移)**:若 product 判定 state-machine 确属冗余,则先迁移 `src/domain/reservations/`、`src/pack/domain-bundle.ts`、`src/index.ts:132` 的消费者,再执行删除——此时拆为独立子任务,不可直接 `git rm`。

无论 A/B,裁决过程必须有可追溯记录(更新原 spec 或本 spec 的 Decision Point)。

### REQ-02:arch-review-remediate-0626 T-03 / T-08 重评

- **T-03**(`.forge` path.join 局部常量,39 处):复核实测仍 40 处原始用法、0 个 `FORGE_DIR`。判定是否仍需执行;若不执行,记录理由(如与 ADR-0008 #3"不建集中模块"一致——但 T-03 是局部常量非集中模块,需澄清是否被该 ADR 覆盖)。
- **T-08**(dist-sync 触发策略):复核实测无 trigger/throttle 机制。判定是否仍需,或转 deferred。

### REQ-03:dead-code-assertion-gate 核心门禁落地

实现该 spec 的 T-01 / T-02 / T-04(脚本 + 接入 + 反向回归):

- 新增 `scripts/check-unused-module.mjs`,给定模块路径做四维扫描(imports in src / imports in scripts / test public-api usage / data-dir 启发式),有引用即 `exit 1`,`--help` 可用,只读不写。
- 接入 `npm run check` 链尾;支持 `FORGE_SKIP_UNUSED_CHECK=1` 与 commit-msg `[unused-check-skip]` skip;无参数运行跳过(不误报现有模块)。
- **state-machine 反向回归 fixture**:以 `src/state-machine/` 为输入,断言脚本判定其**非死代码**并报告 `test/pms-pack`、`test/pack/zero-pack-invariant`、`packs/pms/state-machines` 引用点。这是本机制的验证锚点,直接对冲 REQ-01 的误判风险。

### REQ-04:immutable-evidence-artifacts T-07 门禁接入

- 将 `validateArtifactBackedVerdict`(`src/evidence-artifact.ts:245`)接入 `npm run check`(新增或复用一个 check 脚本调用它扫描证据 artifact 对应的 verdict 声明)。
- 若经评估判定不应接入(如性能/误报),必须在 `immutable-evidence-artifacts/tasks.md` 更新 T-07 DoD 并记录理由,不得静默搁置。

### REQ-05:agent-frontmatter 校验器强化

扩展 `scripts/lint-agents.mjs`:在现有 `REQUIRED_FRONTMATTER = ["name","description"]` 之外,按 spec 要求校验 review 类 agent 的 `disallowedTools`、forge-* agent 的 `memory`/`initialPrompt` 等字段;缺失时 `exit 1` 并报告。校验规则需与 `agent-frontmatter-hardening` spec 的 Verify-By 对齐(注意字段是 camelCase `disallowedTools`,非 spec 字面的 kebab-case `disallowed-tools`)。

### REQ-06:check-spec-status.mjs 统计口径修复

`scripts/check-spec-status.mjs` 当前按**文件**统计(扫 requirements/design/tasks 各算一份),导致分布严重夸大(实测 locked 136 / approved 109,而真实 spec 目录仅 146 个,且 124/146 三件套 status 不一致)。同时 walk 递归无差别进入 `_archived/`(占 33 个文件噪声)。

- 统计单位改为**目录**:每个 spec 取**单一代表 status**(与 `rebuild-spec-index.mjs` 对齐,以 `requirements.md` 的 status 为准——见 REQ-07 确立的唯一事实源)。
- 默认排除 `_archived/`(或单独列 archived 桶,不混入主分布)。
- 报告里同时给出"按目录"与(可选)"按文件不一致"两个维度,后者用于暴露 REQ-07 要清的野字段。
- 修复后分布数字应与 `rebuild-spec-index.mjs` 的目录级统计一致(差值 ≤ 1)。

### REQ-07:spec 状态体系治理(status 野字段清除)

`spec-lifecycle-management/requirements.md §2` 明确:frontmatter schema 定义在 **`requirements.md` 头部**。但实测 `design.md`(129 个)、`tasks.md`(132 个)各自带了一个 `status:` 野字段,且值被严重污染——混入 `done | blocked | failed`、`<go|no-go|conditional-go>`、`decided`、`accepted` 等非 `VALID_STATUSES` 的 ADR/决策模板残留值。这是 status 不一致(124/146)与脚本分布失真的根因。

- **确立单一事实源**:spec 级 status 只认 `requirements.md` 的 `status:` 字段。
- **清除野字段**:从全库 `design.md`/`tasks.md` 移除 `status:` 行(保留各自其他 frontmatter 如 layout/feature/created)。清除前先快照备份,清除后全库 `status` 分布与 `rebuild-spec-index.mjs` 一致。
- **防回归**:扩展校验(`check-spec-status.mjs` 或新 lint)断言 `design.md`/`tasks.md` **不得**含 `status:` 字段,违规 `exit 1`。
- **文档同步**:在 `spec-lifecycle-management/requirements.md` 明示"status 只在 requirements.md;design.md/tasks.md 不得重复定义 status 字段"。

## 非功能需求

- **行为不变**:REQ-03/04/05/06/07 的脚本改动不得改变任何对外行为(CLI/MCP/public API)。REQ-06/07 是统计口径与数据清洗,不改变 spec 内容语义。
- **fail-open 约束**:REQ-03 的死代码判定必须 fail-open(有引用即阻断删除,而非有引用即通过)。
- **零新增依赖**:REQ-03 用 grep 级扫描,不引入新依赖。
- **不破坏现有 check**:`npm run check` 在接入新门禁后仍全绿(skip 机制保障)。
- **可逆性**:REQ-07 野字段清除前必须有 git 快照(提交前 `git status` 干净),便于回滚。
- **口径一致**:REQ-06 修复后,`check-spec-status.mjs` 的目录级分布必须与 `rebuild-spec-index.mjs` 一致(同一 spec 不被重复计数)。

## 验收标准

### AC-1:arch-review T-01 裁决记录
`arch-review-remediate-0626` 的 T-01 有正式裁决记录(撤销),spec `status_note` 反映真实状态。
- **Verify-By**: manual
- **Evidence**:`grep -A3 "裁决(2026-06-30):撤销" .tinkerman/specs/arch-review-remediate-0626/tasks.md` 命中;`test -d src/state-machine`(目录仍在);frontmatter status_note 含撤销说明。

### AC-2:arch-review T-03/T-08 重评记录
T-03 / T-08 各有 deferred 判定与理由记录。
- **Verify-By**: manual
- **Evidence**:`grep -c "重评(2026-06-30)" .tinkerman/specs/arch-review-remediate-0626/tasks.md` ≥ 2。

### AC-3:check-unused-module 脚本 + state-machine 反向回归
`scripts/check-unused-module.mjs` 存在,`--help` 退出 0,state-machine 输入返回 `exit 1`(非死代码)并报告 ≥3 个引用点。
- **Verify-By**: vitest:unit
- **Evidence**:`node scripts/check-unused-module.mjs --help` exit 0;`test/check-unused-module.test.ts` 断言 state-machine → exit 1 + 含 test/pms-pack、test/pack/zero-pack-invariant、packs/pms/state-machines 引用点,全绿。

### AC-4:check 链接入 + skip 机制
`npm run check` 含 check-unused-module 且全绿;`FORGE_SKIP_UNUSED_CHECK=1` 与 `[unused-check-skip]` 均有效;无参数跳过。
- **Verify-By**: bash:contract
- **Evidence**:`npm run check` exit 0;skip 三态测试在 `test/check-unused-module.test.ts` 全绿;`grep check-unused-module package.json` 命中。

### AC-5:evidence verdict 门禁接入(或 DoD 更新)
`validateArtifactBackedVerdict` 已被 check 链调用,或 T-07 DoD 已更新并附不接入理由。
- **Verify-By**: bash:contract
- **Evidence**:PoC 数据记录;接入则 `grep validateArtifactBackedVerdict scripts/*.mjs` 命中且 `npm run check` 全绿;撤回则 `immutable-evidence-artifacts/tasks.md` T-07 含不接入理由。

### AC-6:lint-agents 分角色校验
`lint-agents.mjs` 对缺 `disallowedTools` 的 review agent / 缺 `memory` 的 forge-* agent 报错 `exit 1`;现有合规 agent 不受影响。
- **Verify-By**: vitest:unit
- **Evidence**:`test/lint-agents.test.ts` 断言缺字段 → exit 1、合规 agent → exit 0,全绿;`node scripts/lint-agents.mjs` exit 0。

### AC-7:全局门禁全绿
`npx tsc --noEmit && npm run check && node scripts/check-dist-sync.mjs` 全绿。
- **Verify-By**: bash:contract
- **Evidence**:三条命令连续 exit 0 的终端输出。

### AC-8:check-spec-status 目录级统计
`check-spec-status.mjs` 按目录统计,分布数字与 `rebuild-spec-index.mjs` 一致(差值 ≤ 1);`_archived/` 不混入主分布。
- **Verify-By**: bash:contract
- **Evidence**:`test/check-spec-status.test.ts` 断言每 spec 只计 1 次、`_archived` 不在主分布,全绿;两脚本目录级分布 diff ≤ 1。

### AC-9:status 野字段清除 + 防回归
全库 `design.md`/`tasks.md` 不再含 `status:` 字段;校验脚本对违规 `exit 1`;清除前后 `requirements.md` 的 status 分布不变。
- **Verify-By**: bash:contract
- **Evidence**:`node scripts/check-spec-status.mjs 2>&1 | grep -c "rogue status"` = 0;`git diff --stat` 仅触及 design/tasks 文件;清除前后 requirements.md status 分布一致(INV-7)。

### AC-10:单一事实源文档化
`spec-lifecycle-management/requirements.md` 明示"status 仅 requirements.md";REQ-06/07 让 INDEX 的 completed 计数可信。
- **Verify-By**: manual
- **Evidence**:`grep "status 仅" .tinkerman/specs/spec-lifecycle-management/requirements.md` 命中;`rebuild-spec-index.mjs` 的 completed 数 == requirements.md=completed 的真实目录数。

## Open Questions

1. **REQ-01 裁决 A vs B**:state-machine 是真冗余(应迁移消费者后删)还是误判孤岛(应撤销 T-01)?需 product 视角裁定。倾向 A(撤销),因为 `src/domain/reservations/` 是 REQ-07 参考实现的真实消费者,domain-example spec 明确"consumes state-machine"。
2. **REQ-04 接入 vs 撤销**:`validateArtifactBackedVerdict` 扫描全库 artifact 的性能与误报率未知,需 PoC 后定。
3. **T-03 是否被 ADR-0008 覆盖**:ADR-0008 #3 说"不建集中模块",但 T-03 是局部常量——语义边界需澄清。
