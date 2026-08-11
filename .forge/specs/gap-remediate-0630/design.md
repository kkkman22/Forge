---
feature: gap-remediate-0630
layout: design
created: 2026-06-30
tier: standard
---

# Design — Gap Remediate 0630

> 本 spec 是补救性 spec,design 聚焦"如何把 4 个确认缺口最小风险地补齐"。不引入新架构,全部沿用既有 check 链 / lint / spec-lifecycle 约定。

## 1. 整体策略

四个缺口性质不同,分两类处理:

- **裁决类(REQ-01/02)**:不写代码,写决策记录。更新原 spec 的 `status_note` / frontmatter,让 spec 状态与代码事实一致。这是"治本"——根因是 spec 状态机没有"前提证伪则撤销"的出口。
- **实现类(REQ-03/04/05)**:写代码,全部以"新增只读门禁 + fail-open + skip 机制"形态接入既有 `npm run check`,零行为变更。

执行顺序:先做 REQ-01 裁决(它决定 state-machine 命运,直接影响 REQ-03 的 fixture 是否仍有效),再做 REQ-03/04/05 实现,最后 REQ-02 收尾。

## 2. REQ-01:state-machine 裁决

### Decision Point

- **[state-machine 有真实消费者]** → **[撤销 T-01,选裁决 A]** → **[依据:`src/domain/reservations/reservation.ts:18` + `reservation-machine.ts:14` + `pack/domain-bundle.ts:15` + `src/index.ts:132` 均为活跃 import;domain-example-reference-impl spec REQ-07 明确"consumes state-machine"]**

裁决 A 的落实:

- 在 `arch-review-remediate-0626/tasks.md` 的 T-01 加 `> **裁决(2026-06-30):撤销**。前提"零引用孤岛"被证伪:state-machine 有 4 处活跃生产消费者(列证据)。本任务作废,不得执行 `git rm`。`dead-code-assertion-gate`(本 spec REQ-03)将以 state-machine 为反向回归 fixture 永久锚定此判定。`
- T-09 不变式终验的"state-machine 0 引用"断言相应删除/改写。
- 不改 frontmatter `status`(仍 approved),只在 `status_note` 记录"T-01 撤销,T-03/T-08 待 REQ-02 裁定"。

**为什么不选 B(迁移)**:迁移消费者 = 改 domain 参考实现 + pack bundle 组装 + 公共 API re-export,属于行为变更,违反 arch-review 自身"5 项对外行为不变"的核心约束,且 domain-example spec 刚把 state-machine 立为 REQ-07 消费对象。迁移成本与收益完全不匹配。

### 风险

极低。撤销一个"本就不该执行"的任务,无代码改动。

## 3. REQ-02:T-03 / T-08 重评

### T-03(`.forge` 局部常量)

- **[ADR-0008 #3 是"不建集中模块",T-03 是"局部常量"]** → **[语义不冲突,T-03 仍可执行]** → 但 **[40 处替换是纯卫生改动,无行为/契约收益,且属"宁重勿轻"的反向]**
- **建议**:转 `deferred`,在 T-03 记录"低优先卫生项,可在下次 touch 这些模块时顺手做,不单独立项"。理由:ADR-0008 的精神是"精简有收益的才做",40 处魔字符串改局部常量收益边际。

### T-08(dist-sync 触发策略)

- **[原 Open Question #3"团队工作流"未解]** → **[机制设计无依据,且 dist 入库子集极小(复核:git ls-files dist 仅 4 文件)]** → **[sync 提交频率问题的根因不在触发策略,而在流程]**
- **建议**:转 `deferred` 或并入后续"CI 产 dist"讨论。记录"T-08 前提(dist 大量入库导致噪音)经复核不成立,优先级降级"。

两项均落到 `arch-review-remediate-0626/tasks.md` 的 `status_note`。

## 4. REQ-03:dead-code-assertion-gate 门禁

### 4.1 脚本设计 `scripts/check-unused-module.mjs`

复用 `scripts/check-public-api.mjs` 的正则提取模式,四维扫描:

```
输入: module-path(目录或文件)
1. 定位 entry:目录优先 index.ts,否则单文件
2. extractExports(entry):正则提 value export 符号集(借 check-public-api.mjs:83-95)
3. 四维扫描任一命中 → exit 1 + 报告(文件:行 + 维度):
   a. scanImports("src")     — import from <module> 
   b. scanImports("scripts") — 同上
   c. scanTestPublicApiUsage("test") — test 调用 exported 符号
   d. scanDataDirUsage()     — 启发式:packs/*/state-machines、manifest 引用
4. 全无命中 → exit 0
```

skip 机制(对齐 `check-dist-sync.mjs:92-108`):

- `FORGE_SKIP_UNUSED_CHECK=1` → exit 0 + warn
- commit msg 含 `[unused-check-skip]` → exit 0 + warn
- **无参数运行 → 输出"工具就位" + exit 0**(INV:避免全库误报,本脚本只在被显式调用或 build SKILL 显式触发时扫描)

### 4.2 check 链接入

`package.json` 的 `check` 链尾追加 `&& node scripts/check-unused-module.mjs`(无参数 = 跳过,不误报)。

### 4.3 state-machine 反向回归 fixture(REQ-03 核心)

`test/check-unused-module.test.ts`:

- (a) 真死代码 fixture(tmpdir 构造无引用模块)→ `exit 0`
- (b) `--help` → `exit 0` 含 usage
- (c) **`src/state-machine/` → `exit 1`(非死代码)**,输出含:`test/pms-pack`、`test/pack/zero-pack-invariant`、`packs/pms/state-machines`(维度 a/c/d)

第四维启发式:命名约定映射 `state-machine` ↔ `state_machines` category,grep `packs/*/pack.yaml` manifest + `packs/*/state-machines/*.yaml`。先宽匹配,T-01 fixture 驱动调优。

### 4.4 build SKILL 文档约定

`skills/forge/lib/build/instructions.md` Pre-build Checks 段新增:"删除 src 模块前必须 `node scripts/check-unused-module.mjs <target>`;exit 1 时迁移消费者或撤销主张(参见 state-machine 案例);`[unused-check-skip]` 仅限紧急 hotfix。"

## 5. REQ-04:evidence verdict 门禁接入

### 5.1 接入方案

新增 `scripts/check-evidence-verdicts.mjs`(或复用现有 check 脚本入口):

- 扫描 `.forge/artifacts/` 下 evidence artifact 对应的 verdict 声明
- 调用 `validateArtifactBackedVerdict(content)`(从 dist 或 tsx 调用 src 实现)
- 有 diagnostic → `exit 1` + 报告

### 5.2 PoC 决策点

接入前先跑一次全库扫描,看误报率与耗时:

- **[误报率低 + 耗时可接受]** → **[接入 check 链]**
- **[误报率高 or 耗时过长]** → **[不接入,更新 T-07 DoD 为"提供 standalone 脚本供按需调用",记录理由]**

PoC 结果决定走哪条,避免拍脑袋接入后又被关掉。

## 6. REQ-05:lint-agents 强化

`scripts/lint-agents.mjs` 现状:`REQUIRED_FRONTMATTER = ["name","description"]`(line 27)。

扩展为分角色校验:

```
ROLE_RULES = {
  "review-agents": [spec-check, quality-check, security-check] 
    → required: disallowedTools(含 Bash/Write/Edit/Agent)
  "forge-agents": [forge-build, forge-plan, forge-review, ...]
    → required: memory(=project), initialPrompt
  "decide-agents": [forge-decide-*]
    → required: effort
}
缺失任一 → exit 1 + 报告 "agent X missing required field Y"
```

**关键修正点**:校验时用 camelCase `disallowedTools`(全库 16 处实际用法),不要用 `agent-frontmatter-hardening` spec 字面的 kebab-case `disallowed-tools`。同时在该 spec 的 Verify-By 旁加勘误注释,根治"字面 grep 假阴性"问题。

## 7. 不变式

| INV | 描述 |
|-----|------|
| INV-1 | REQ-03/04/05 脚本只读不写(除 --fix 类显式写操作,本 spec 无) |
| INV-2 | 接入 check 链后 `npm run check` 全绿(skip 机制 + 无参数跳过保障) |
| INV-3 | 不改变任何对外行为(public API / CLI / MCP tool / Bitbucket marker) |
| INV-4 | check-unused-module 无参数运行不误报现有模块 |
| INV-5 | 每任务结束 `tsc --noEmit && vitest run` + `check-dist-sync.mjs` |
| INV-6 | REQ-06 修复后 `check-spec-status.mjs` 目录级分布 == `rebuild-spec-index.mjs` 分布 |
| INV-7 | REQ-07 清除野字段后 `requirements.md` 的 status 真值不变(git diff 只触及 design/tasks 的 status 行) |

## 8. REQ-06/07:spec 状态体系治理

### 8.1 根因复盘(数据支撑)

| 实测 | 值 | 含义 |
|------|-----|------|
| 脚本扫描文件数 | 465 | 含 `_archived` 33 个,walk 递归无差别进入 |
| 真实 spec 目录数 | 146 | 应是统计单位 |
| locked=136 / approved=109 | 文件级 | 同 spec 三文件被重复计 |
| 三件套 status 不一致 | 124/146 (85%) | design/tasks 的 status 是野字段 |
| design/tasks status 污染值 | `done\|blocked\|failed`、`<go\|no-go\|conditional-go>`、`decided`、`accepted` | ADR/决策模板残留,非 `VALID_STATUSES` |
| 真正"三件全 completed" | **1 个** | INDEX 报 100 completed 是假象 |

**真相链**:`rebuild-spec-index.mjs` 只读 `requirements.md`(正确)→ INDEX 报 requirements.md=completed 的数(101)≈ 100。`check-spec-status.mjs` 读三件套(错误)→ 把野字段也计入 → 分布失真。两者口径矛盾,INDEX 的 100 completed 因此不可信。

### 8.2 REQ-06:check-spec-status 统计口径修复

脚本 `collectSpecFiles`/统计逻辑改为目录级:

```
对每个 spec 目录:
  代表 status = requirements.md 的 status(若缺则 tasks.md → design.md 兜底,标 warning)
  归入分布桶
默认排除 _archived/(或单列 archived 桶)
额外报告"三件套不一致"子项(暴露 REQ-07 待清野字段),但不计入主分布
```

与 `rebuild-spec-index.mjs:145,171` 的"`requirements.md` 为准"口径完全对齐 → 满足 INV-6。

### 8.3 REQ-07:野字段清除 + 单一事实源

清除策略(分两步,可逆):

1. **快照**:`git add -A && git stash` 或单独 commit "chore: snapshot before status field purge"。
2. **清除**:对全库 `design.md`/`tasks.md`,移除 frontmatter 里的 `status:` 行(保留其他 frontmatter 字段)。用脚本批量执行,逐文件 `tsc/lint` 无关(纯文档)。
3. **防回归 lint**:在 `check-spec-status.mjs` 加规则——`design.md`/`tasks.md` 含 `status:` → warning→exit 1(REQ-06 改造时一并加入)。
4. **文档**:更新 `spec-lifecycle-management/requirements.md §2`,明示 status 仅 requirements.md。

**Decision Point**:野字段值里有些(如 tasks.md 的 `approved`)反映了"已批准待开发"的真实状态——但这个状态本就该在 requirements.md。清除前需 spot-check 几个 spec,确认 requirements.md 的 status 已能代表,避免清掉后丢失"approved"语义。若发现 requirements.md status 落后(如还是 draft 而 tasks 已 approved),先修正 requirements.md 再清野字段。

### 8.4 与 REQ-01~05 的关系

REQ-06/07 是**所有 spec 完成判定的基础设施**。REQ-01~05 是单个 spec 的缺口,但只要 status 体系不可信,后续任何 spec 的"是否完成"都无法自动判定。因此 REQ-06/07 应与 REQ-01 裁决同一 Wave 推进(都是"让 spec 状态说真话")。

## 9. 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| REQ-03 第四维启发式误报/漏报 | 中 | state-machine fixture 锚定 + 先宽匹配再调优 |
| REQ-04 接入后误报炸全库 | 中 | PoC 决策点,误报高则不接入 |
| REQ-05 现有 agent 不合规被新校验拦 | 低 | 先全量跑一次,补齐不合规 agent 再合入 |
| REQ-01 撤销 T-01 后 state-machine 后续真变孤岛 | 低 | REQ-03 fixture 永久锚定,状态变化时 fixture 同步更新(已在 dead-code spec 注明) |
| REQ-07 清除野字段误删 requirements.md 真值 | 中 | git 快照 + INV-7 断言(git diff 只触及 design/tasks 的 status 行);清前 spot-check requirements.md 是否已代表真实状态 |
| REQ-07 清后丢失 tasks.md 的 "approved" 语义 | 中 | Decision Point:先修正落后的 requirements.md status,再清野字段;不清空只迁移 |
| REQ-06 口径改后历史 `--fix` 行为变化 | 低 | `--fix` 仍只补 requirements.md;测试覆盖目录级 fix |
