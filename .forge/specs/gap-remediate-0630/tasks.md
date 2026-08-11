---
feature: gap-remediate-0630
layout: tasks
created: 2026-06-30
tier: standard
work_nature: bugfix
brownfield: true
next_step: "decide(裁决 REQ-01) → plan → build"
---

# Tasks — Gap Remediate 0630

## Overview

7 个 REQ 拆为 11 个任务,分 5 波。核心约束:裁决类任务(REQ-01/02/07)先于实现类(REQ-03/04/05/06),因为 REQ-01 决定 state-machine 命运(影响 REQ-03 fixture),REQ-07 决定 status 单一事实源(影响 REQ-06 统计口径)。全程 TDD,每任务结束 `tsc --noEmit && vitest run` + `check-dist-sync.mjs`(INV-5)。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["T-01", "T-02"], "parallel": true, "note": "裁决类:撤销 T-01 + T-03/T-08 重评(纯文档,无代码)" },
    { "wave": 2, "tasks": ["T-03", "T-04"], "parallel": true, "note": "T-03 脚本骨架(RED)+ T-04 state-machine fixture 驱动" },
    { "wave": 3, "tasks": ["T-05"], "parallel": false, "note": "check 链接入 + skip(依赖 T-03 脚本存在)" },
    { "wave": 4, "tasks": ["T-06", "T-07", "T-10"], "parallel": true, "note": "evidence 门禁 + lint-agents 强化 + status 野字段 spot-check(独立)" },
    { "wave": 5, "tasks": ["T-09", "T-11"], "parallel": false, "note": "REQ-06 脚本口径修复(依赖 T-10 spot-check)+ REQ-07 防回归 lint(依赖 T-09)" }
  ]
}
```

依赖:T-04 depends T-03;T-05 depends T-03;T-06/T-07/T-10 独立;T-01 须先于 T-03/T-04;T-09 depends T-10(spot-check 先行);T-11 depends T-09(口径定了再加防回归 lint);T-08 终验 depends 全部。

---

## Task Definitions

### T-01 撤销 arch-review-remediate-0626 T-01(裁决 A)

- **Goal**: 正式裁决 state-machine 非孤岛,T-01 作废,落到原 spec 记录。
- **REQ**: REQ-01
- **TDD Steps**: 非 TDD(裁决记录)。
  - 在 `.forge/specs/arch-review-remediate-0626/tasks.md` 的 T-01 标题下加裁决块:
    > **裁决(2026-06-30):撤销**。前提"零引用孤岛"被证伪。证据:`src/domain/reservations/reservation.ts:18`、`reservation-machine.ts:14`、`src/pack/domain-bundle.ts:15`、`src/index.ts:132` 均为活跃 import;`domain-example-reference-impl` REQ-07 明确 consumes state-machine。本任务作废,禁止 `git rm`。反向回归由 `gap-remediate-0630` T-04 fixture 永久锚定。
  - T-09 不变式终验:删除"state-machine 0 引用"断言,改为"state-machine 保持活跃(≥4 处消费者)"。
  - 原 spec frontmatter 加 `status_note: "T-01 撤销(前提证伪);T-03/T-08 见 gap-remediate-0630 T-02"`。
- **Verify Command**: `grep -A3 "裁决(2026-06-30):撤销" .forge/specs/arch-review-remediate-0626/tasks.md`(命中)且 `test -d src/state-machine`(目录仍在)
- **Definition of Done**: T-01 裁决块存在;state-machine 目录与消费者未被改动;T-09 断言已调整;frontmatter status_note 已加。
- **Depends On**: 无
- **风险**: 极低(纯文档,无代码改动)

### T-02 arch-review T-03 / T-08 重评并记录

- **Goal**: 对 T-03(path.join 常量)、T-08(dist-sync 触发)各给出执行/deferred 判定与理由。
- **REQ**: REQ-02
- **TDD Steps**: 非 TDD(决策记录)。
  - T-03: 标注 `> **重评(2026-06-30):deferred**。40 处魔字符串改局部常量收益边际;ADR-0008 精神是"有收益才精简"。下次 touch 相关模块时顺手做。`
  - T-08: 标注 `> **重评(2026-06-30):deferred**。前提(dist 大量入库)经复核不成立(git ls-files dist 仅 4 文件);sync 频率根因在流程非触发策略。并入后续 CI-产-dist 讨论。`
- **Verify Command**: `grep -c "重评(2026-06-30)" .forge/specs/arch-review-remediate-0626/tasks.md`(≥2)
- **Definition of Done**: T-03、T-08 各有重评块 + deferred 理由;status_note 反映。
- **Depends On**: 无(可与 T-01 并行)
- **风险**: 极低

### T-03 新增 `scripts/check-unused-module.mjs`(四维扫描骨架)

- **Goal**: 实现四维扫描脚本,给定模块判定死代码(有引用 → exit 1)。
- **REQ**: REQ-03
- **TDD Steps**:
  - RED: `test/check-unused-module.test.ts` 先写——(a) tmpdir 真死代码 fixture → exit 0;(b) `--help` → exit 0 含 usage。脚本未建,import 失败。
  - GREEN: 实现 `scripts/check-unused-module.mjs`:
    1. 解析 module-path → 定位 entry(目录优先 index.ts)。
    2. `extractExports(entry)`(借 `check-public-api.mjs:83-95` 正则)提 export 符号集。
    3. 四维:`scanImports("src")` + `scanImports("scripts")` + `scanTestPublicApiUsage("test")` + `scanDataDirUsage()`(启发式)。
    4. 任一命中 → 报告(文件:行 + 维度) + exit 1;全无 → exit 0。
    5. skip:`FORGE_SKIP_UNUSED_CHECK=1` / commit-msg `[unused-check-skip]` / 无参数 → exit 0 + warn(对齐 `check-dist-sync.mjs:92-108`)。
    6. `--help` 输出 usage。
  - REFACTOR: 抽 scan 函数为可单测纯函数。
- **Verify Command**: `node scripts/check-unused-module.mjs --help && npx vitest run test/check-unused-module.test.ts`
- **Definition of Done**: 脚本存在;`--help` 规范;真死代码 fixture exit 0;只读不写(INV-1);skip 三态有效。
- **Depends On**: 无(T-01 先行确保 state-machine 仍在)
- **风险**: 中(第四维启发式边界——见 T-04)

### T-04 state-machine 反向回归 fixture(REQ-03 验证锚点)

- **Goal**: 用 state-machine 作 fixture,证明脚本堵住"误判孤岛"——判定它非死代码并报告引用点。
- **REQ**: REQ-03
- **TDD Steps**:
  - RED: `test/check-unused-module.test.ts` 加用例——`execFileSync(node, [script, "src/state-machine/"])` 断言 `status !== 0` 且输出含:`test/pms-pack`、`test/pack/zero-pack-invariant`(维度 c)、`packs/pms/state-machines`(维度 d)。第四维未调优,失败。
  - GREEN: 调优 `scanDataDirUsage` 启发式(命名映射 `state-machine`↔`state_machines`;grep `packs/*/pack.yaml` manifest;grep `packs/*/state-machines/*.yaml`)使第四维命中。测试通过。
  - REFACTOR: 启发式映射抽为可配置(为后续"显式映射表"升级留路)。
- **Verify Command**: `npx vitest run test/check-unused-module.test.ts`
- **Definition of Done**: state-machine → exit 1(非死代码);输出含 test + packs 引用点;真死代码 fixture 仍 exit 0。
- **Depends On**: T-03(脚本存在)
- **风险**: 中(第四维启发式是否够准——核心锚点必须命中)

### T-05 接入 `npm run check` + build SKILL 文档约定

- **Goal**: 脚本接入 check 链(无参数跳过),build SKILL 文档化"删除前必跑"。
- **REQ**: REQ-03
- **TDD Steps**:
  - RED: 测试断言——(a) `npm run check`(脚本无参数)全绿(跳过);(b) `FORGE_SKIP_UNUSED_CHECK=1` → exit 0 + warn;(c) commit msg `[unused-check-skip]` → exit 0 + warn。
  - GREEN:
    1. `package.json` check 链尾追加 `&& node scripts/check-unused-module.mjs`。
    2. `skills/forge/lib/build/instructions.md` Pre-build Checks 段新增条目:"删除 src 模块前必须 `node scripts/check-unused-module.mjs <target>`;exit 1 时迁移消费者或撤销主张(参见 state-machine 案例);`[unused-check-skip]` 仅限紧急 hotfix。"
    3. `.forge/knowledge/evolved-rules.md` R3 的 Infra_Ref 追加 `scripts/check-unused-module.mjs`(不占 R15 名额,只更新)。
  - REFACTOR: skip 检测抽 `shouldSkip()` 复用。
- **Verify Command**: `npm run check 2>&1 | tail -3`(全绿)+ skip 测试 + `grep check-unused-module skills/forge/lib/build/instructions.md`
- **Definition of Done**: `npm run check` 含本脚本且全绿;skip 两方式有效;无参数跳过;build SKILL + R3 Infra_Ref 含脚本。
- **Depends On**: T-03
- **风险**: 低(无参数跳过保护现有模块)

### T-06 evidence verdict 门禁(PoC 决策后接入或撤回)

- **Goal**: `validateArtifactBackedVerdict` 接入 check,或 PoC 后判定不接入并更新 DoD。
- **REQ**: REQ-04
- **TDD Steps**:
  - RED: 先 PoC——`tsx scripts/check-evidence-verdicts.mjs`(新建)扫描 `.forge/artifacts/` 调用 `validateArtifactBackedVerdict`,记录误报数 + 耗时。无断言,只采集。
  - **Decision Point**:
    - **[误报率低 + 耗时 < 5s]** → GREEN: 接入 check 链 + 写断言测试(有 diagnostic → exit 1)。
    - **[误报高 or 耗时过长]** → 撤回:更新 `immutable-evidence-artifacts/tasks.md` T-07 DoD 为"standalone 脚本供按需调用",记录 PoC 数据与不接入理由。
  - REFACTOR: 扫描逻辑抽纯函数。
- **Verify Command**: PoC 数据记录 + (若接入)`npm run check` 全绿;(若撤回)T-07 DoD 更新 + 理由记录。
- **Definition of Done**: 有明确的"接入/撤回"决策 + 数据支撑;接入则 check 链含且全绿;撤回则 T-07 DoD 已更新。
- **Depends On**: 无
- **风险**: 中(误报炸库——靠 PoC 决策点规避)

### T-07 lint-agents 分角色 frontmatter 校验强化

- **Goal**: `lint-agents.mjs` 按 agent 角色强制校验 disallowedTools/memory/initialPrompt/effort。
- **REQ**: REQ-05
- **TDD Steps**:
  - RED: `test/lint-agents.test.ts` 加用例——(a) 缺 `disallowedTools` 的 review agent → exit 1;(b) 缺 `memory` 的 forge-* agent → exit 1;(c) 现有合规 agent 全部通过(exit 0)。
  - GREEN: `scripts/lint-agents.mjs` 扩展 `ROLE_RULES`(review-agents/forge-agents/decide-agents 分组),缺失字段 → exit 1 + 报告。**用 camelCase `disallowedTools`(全库 16 处实际用法),不用 spec 字面 kebab-case。**
  - **存量合规(decide Critic #3 约束)**:GREEN 前先全量 dry-run `node scripts/lint-agents.mjs`,补齐 forge-decide-* 的 effort、forge-build/plan/review 的 memory/initialPrompt 违规——否则接入门禁后 CI 直接红。补齐清单记录在本 spec status_note。
  - REFACTOR: 角色分组抽配置表。
- **Verify Command**: `node scripts/lint-agents.mjs && npx vitest run test/lint-agents.test.ts`(现有 agent 全绿 + 新校验生效)
- **Definition of Done**: review/forge/decide 三类 agent 各自必填字段被强制;现有合规 agent 不受影响;`npm run check` 全绿。
- **Depends On**: 无
- **风险**: 低(可能暴露现有不合规 agent——先跑一次补齐)

### T-08 全局不变式终验

- **Goal**: PR 前验证 INV-1~7 全满足。
- **REQ**: 全部
- **TDD Steps**: 非 TDD(验证门禁)。
- **Verify Command**:
  ```bash
  npx tsc --noEmit && \
  npx vitest run && \
  npm run check && \
  node scripts/check-dist-sync.mjs && \
  node scripts/check-spec-status.mjs && \
  node scripts/rebuild-spec-index.mjs --check
  ```
- **Definition of Done**: INV-1~7 全满足;7 个缺口(REQ-01~07)均有闭环;`check-spec-status.mjs` 目录级分布 == `rebuild-spec-index.mjs` 分布(INV-6);spec status 标 completed + status_note 记录交付。
- **Depends On**: T-01 ~ T-07, T-09 ~ T-11

### T-09 check-spec-status.mjs 统计口径修复(目录级)

- **Goal**: 统计单位从"文件"改为"目录",与 `rebuild-spec-index.mjs` 口径一致,排除 `_archived/`。
- **REQ**: REQ-06
- **TDD Steps**:
  - RED: `test/check-spec-status.test.ts`(新建)断言——(a) 目录级分布里每个 spec 只计 1 次;(b) 同 spec 三件套 status 不一致时,代表值取 requirements.md;(c) `_archived/` 不出现在主分布。当前按文件统计,断言失败。
  - GREEN: 改 `collectSpecFiles` + 统计循环为目录级:遍历 spec 目录,代表 status = requirements.md 的 status(缺则 tasks.md→design.md 兜底 + warning);默认 skip `_archived/`(或单列 archived 桶)。额外输出"三件套不一致"子表(暴露野字段),不计入主分布。
  - REFACTOR: 抽 `resolveSpecStatus(dir)` 纯函数(返回代表 status + 不一致信息)。
- **Verify Command**: `npx vitest run test/check-spec-status.test.ts && node scripts/check-spec-status.mjs 2>&1 | head -20`(分布行数 ≤ 目录数,无 `_archived` 混入)
- **Definition of Done**: 目录级统计;主分布 spec 总数 ≤ 146(不含 `_archived`);与 `rebuild-spec-index.mjs` 目录级分布一致(INV-6);`--fix` 仍只补 requirements.md;三件套不一致作为子表报告。
- **Depends On**: T-10(spot-check 确认 requirements.md 代表性后改口径)
- **风险**: 低(只读脚本,逻辑等价于 rebuild-spec-index 的读取方式)

### T-10 REQ-07 spot-check + 单一事实源文档化

- **Goal**: 清野字段前确认 requirements.md 的 status 已能代表 spec 真实状态;文档确立唯一事实源。
- **REQ**: REQ-07
- **TDD Steps**: 非 TDD(调查 + 文档)。
  - spot-check:对 tasks.md status=approved 的 96 个 spec,核对其 requirements.md status 是否已 ≥ approved(即没落后)。统计"requirements.md 落后于 tasks.md"的 spec 清单。
  - **Decision Point**:
    - **[落后 spec = 0]** → requirements.md 已是可靠事实源,直接进 T-11 清野字段。
    - **[落后 spec > 0]** → 先修正这些 spec 的 requirements.md status(以 tasks.md 真值为准提升),再进 T-11。修正清单记录在本 spec status_note。
  - 文档:更新 `.forge/specs/spec-lifecycle-management/requirements.md §2`,明示"status 仅写在 requirements.md;design.md/tasks.md 不得重复定义 status 字段"。
- **Verify Command**: `grep -n "status 仅" .forge/specs/spec-lifecycle-management/requirements.md`(命中)+ spot-check 清单留存
- **Definition of Done**: spot-check 完成 + Decision Point 裁决;落后的 requirements.md status 已修正(若有);spec-lifecycle 文档明示单一事实源。
- **Depends On**: 无(可与 T-06/T-07 并行)
- **风险**: 中(可能发现 requirements.md 大面积落后——但这是暴露真问题,不是引入)

### T-11 清除 design/tasks 的 status 野字段 + 防回归 lint

- **Goal**: 移除全库 design.md/tasks.md 的 `status:` 野字段,加 lint 防回归。
- **REQ**: REQ-07
- **TDD Steps**:
  - RED: 在 `check-spec-status.mjs`(T-09 改造后)加规则——design.md/tasks.md 含 `status:` → warning→exit 非 0。此时野字段仍在,断言"扫描后 warnings 含违规"通过(基线)。
  - GREEN:
    1. **快照**:`git status` 干净 → 记录 commit hash 备回滚。
    2. **清除**:写一次性脚本 `scripts/purge-rogue-status.mjs`,对全库 design.md/tasks.md 移除 frontmatter 内的 `status:` 行(保留其他字段)。执行后 `git diff` 只触及这些文件的 status 行(INV-7)。
    3. **验证**:`check-spec-status.mjs` 不再报野字段违规;`rebuild-spec-index.mjs --check` 通过(requirements.md 真值未变)。
  - REFACTOR: 清除脚本可弃(一次性),防回归 lint 留在 check-spec-status.mjs。
- **Verify Command**: `node scripts/check-spec-status.mjs 2>&1 | grep -c "rogue status"`(0)+ `node scripts/rebuild-spec-index.mjs --check`(通过)+ `git diff --stat`(仅 design/tasks 文件)
- **Definition of Done**: 全库 design.md/tasks.md 无 status 字段;防回归 lint 生效;requirements.md status 分布与清除前一致(INV-7);INDEX 的 completed 计数现在可信(= requirements.md=completed 的真实数)。
- **Depends On**: T-09(lint 钩子就位)+ T-10(落后 status 已修正,避免清后丢语义)
- **风险**: 中(误删——靠 git 快照 + INV-7 diff 断言 + spot-check 规避)

---

## 执行顺序建议

> **build 前置(plan §1.5 Branch Gate + Critic #2 提交约束)**:
> 1. **分支**:从 main 切 `feature/gap-remediate-0630`(当前在 `docs/sync-roadmap-and-refdocs-to-v3.9`,非本 spec 分支;build §2.2 会硬阻断)。
> 2. **工作树清理**:当前有未跟踪 `docs/zcode/`、`scripts/zcode-probe/`(非本 spec 产物)+ `docs/INDEX.md` 改动。build 前先 stash 或提交到原 docs 分支,确保 feature 分支起点干净。
> 3. **提交粒度**(Critic #2):T-09(脚本口径改造)与 T-11(清野字段)必须**不同 commit**——回滚粒度,避免脚本改动与批量数据改动混在一起无法独立回退。其余任务每任务一个原子 commit。

1. **Wave 1**: T-01(撤销 state-machine T-01)+ T-02(T-03/T-08 重评)—— 纯文档裁决,并行
2. **Wave 2**: T-03(脚本骨架)+ T-04(state-machine fixture 驱动)—— 并行,T-04 的 RED 推 T-03 调优
3. **Wave 3**: T-05(check 链接入 + 文档)
4. **Wave 4**: T-06(evidence 门禁 PoC)+ T-07(lint-agents 强化)+ T-10(status spot-check + 单一事实源文档)—— 独立并行
5. **Wave 5**: T-09(check-spec-status 口径修复,依赖 T-10)→ T-11(清野字段 + 防回归 lint,依赖 T-09)—— **不同 commit**
6. **收尾**: T-08(不变式终验,含 INV-6/7)→ spec status completed + learn

> **优先级**:REQ-01 是本 spec 的逻辑前提(T-04 fixture 锚定撤销后的 state-machine),须先于 T-03/T-04。REQ-06/07 是所有 spec 完成判定的基础设施——只要 status 体系不可信,后续任何 spec 的"是否完成"都无法自动判定,因此与 REQ-01 同属"让 spec 状态说真话"的高优先项,但实现上排在 REQ-03~05 之后(避免 11 任务并发)。REQ-03 是最高价值项——它把"误判孤岛"这类错误永久自动化拦截,直接对冲本次复核发现的根因。
