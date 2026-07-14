---
title: Forge 代码审查与修复计划 (Review & Action Plan)
date: 2026-07-13
reviewer: Staff Engineer 主任审查 + 4 维度并行 agent (arch/security/logic/perf)
scope: src/ (~60 TS 模块), scripts/*.mjs (hook/CI 运行面), .claude/ hook 配置, MCP 工具, cmux-mirror 守护进程
methodology: 每条 agent finding 均经主审亲自读代码复核;未过复核者剔除
summary: 3 个 P1 + 4 个 P2 + 6 类 P3
status: review
---

# Forge 代码审查与修复计划 (Review & Action Plan)

> 审查范围:`src/`(~60 TS 模块)、`scripts/*.mjs`(hook/CI 运行面)、`.claude/` hook 配置、MCP 工具、cmux-mirror 守护进程。方法论:4 个独立维度 agent 并行审查 + 主审对**每一条 finding 亲自读代码复核**。未通过复核的发现已剔除(见文末附注)。

---

## 一、核心架构诊断

Forge 分层**意图**清晰:`state.ts` 想做状态内核,`frontmatter.ts`/`token-estimate.ts` 想做共享原语,`.forge/` 文件系统做阶段间交接,`scripts/*.mjs` 做 hook/CI 执行面。但**契约与落地之间存在系统性缝隙**,根因是一条纪律的缺失:**"单一收口面"没有机制强制**——状态写入、frontmatter 解析、token 估算、文件锁都有权威模块,却无任何机制阻止旁路重写。

三个最高杠杆的结构性问题:

1. **锁与写权限 API 精心设计却生产零调用**——`state.ts` 的整套锁是纯函数,真正写 `status.md` 的 `status-manager.ts` 无锁做 read-modify-write。项目自己的铁律("锁必须跨越整个 RMW 周期")在代码里零落地,却在文档中承诺,制造**虚假安全感**。
2. **`src/*.ts` 与 `scripts/*.mjs` 双写漂移**——96 个 mjs 里 85 个独立重写 TS 逻辑,测试只覆盖 TS、hook/CI 实际运行 mjs,与既往 cmux 集成漂移事故同源。
3. **信任边界依赖脆弱回退**——hook 命令用 `|| node scripts/X.mjs` 盲试当前工作目录,把不可信仓库变成代码执行面。

`accept-driver` God module、`spec`/`learn` barrel 循环、Node `vm` 沙箱、cmux-mirror 并发缺陷群是维护性/纵深防御层面,非阻塞项。

---

## 二、P1 — 发布前必须修复(阻断 ship)

### P1-1 · 状态锁机制形同虚设 + 并发丢失更新

**文件**:`src/state.ts:520-639`、`src/status-manager.ts:86-125`、`.claude/rules/state-file-locking.md`

**证据**:`tryAcquireLock`/`lockFilePath`/`createLockInfo`/`serializeLockInfo` 是一整套纯函数(`state.ts:548` 注释自陈"实际 fs 操作由调用方执行"),全仓 `src/`+`scripts/` **调用方 = 0**。真正写 `status.md` 的 `writeTaskStatus` 做无锁整文件覆盖(`io.read → parse → io.write`,无 tmp+rename、无锁)。规则文档声称的 exit 同步清理、启动孤儿锁扫描**均无代码兑现**。

**失败场景**(两个并行 subagent,`max_parallel_agents` 默认 6):

```
T2 agent-A: read status.md → phase=review 内容准备写
T3 agent-B: read status.md → phase=build 内容准备写
T4 agent-A: io.write(phase=review)
T5 agent-B: io.write(phase=build)   ← 覆盖 A,phase=review 永久丢失
```

任务名不同还会各自触发 `migrateToMultiTask` → 双重迁移竞态,legacy 文件状态不确定。

**修复策略**:
1. 复用已存在的真实原语 `src/tool-health-writer.ts` 的 `acquireLockSync`(`O_CREAT|O_EXCL`),封装唯一原子写入面 `writeStatusAtomic(io, path, transformFn)`:`lock → read → transform → tmp写 → rename → unlock`。
2. `status-manager`/`ship-gates`/`zoom-out` 所有 `status.md` 写入全部改走它。
3. 补 `process.on('exit')` 同步锁清理 + 启动时扫描 `.forge/.locks/` 破孤儿锁。
4. 删除 `state.ts` 那套无人调用的纯函数锁,或将其接线;二选一——**不允许文档承诺代码不兑现的锁**。

### P1-2 · Hook 回退链在不可信仓库 CWD 下执行同名脚本(恶意仓库 RCE)

**文件**:`hooks/hooks.json`(28+ 条)、`dist-plugin/hooks/hooks.json`、`.claude/settings.json:36,45,56,68`、`src/runtime-config-sync.ts:53-56`

**证据**(已实证):每条 hook 形如

```
node "${CLAUDE_PLUGIN_ROOT:-}/scripts/X.mjs" || node scripts/X.mjs || node forge/scripts/X.mjs || ...
```

第 2、3 分支是**相对 CWD 路径**,hook 以当前项目目录为 cwd 运行(全文件 37 处 `.forge/` 相对引用能工作即佐证)。裸相对回退 `node scripts/X.mjs` 已确认存在于 `bash-ban-raw`/`bootstrap-check`/`check-context-boundary`/`forge-hook-dispatch` 等 28+ 个。

**攻击**:恶意仓库内放 `scripts/forge-hook-dispatch.mjs`(28 个被引用名之一),受害者打开该仓库 → SessionStart 立即触发。`CLAUDE_PLUGIN_ROOT` 未设时第一分支 `node "/scripts/X.mjs"` 确定性失败 → `||` 级联执行仓库内恶意脚本,**无需受害者任何额外操作**。

> **勘误 [2026-07-14] — P0 严重度范围限定**:复核(`forge-sync-runtime.mjs:34-36` 的 `resolveMode`)确认 source/skill 安装下 `CLAUDE_PLUGIN_ROOT` 确未设 → 此时为 **P0**(开仓即 RCE)。但 **marketplace/plugin 安装**下 Claude Code host 会注入 `CLAUDE_PLUGIN_ROOT`,第一分支命中 → 该安装路径不受此级联攻击,维持 **P1**。故分级:**source/skill = P0,marketplace = P1**。另两处数字修正:受影响 hook 实为 **35/37**(非"28+");`forge-hook-dispatch` 不在 `hooks/hooks.json`、而在 `.claude/settings.json` 与 runtime-config-sync 生成 shim 中。

**修复策略**:删除所有裸相对回退分支;仅保留绝对 `${CLAUDE_PLUGIN_ROOT}` + `~/.claude/skills/forge/` 绝对回退。用单点 resolver 按已知安装位置解析脚本路径,而非 `||` 链盲试 CWD。

### P1-3 · `src/*.ts` 与 `scripts/*.mjs` 系统性逻辑双写(测试盲区在运行面)

**文件**:`scripts/check-context-boundary.mjs`(602L)↔`src/context-boundary.ts`(391L)、`scripts/check-dist-sync.mjs`↔`src/dist-sync.ts`、`scripts/check-agent-originality.mjs`↔`src/agent-originality.ts`、`scripts/compact-inject.mjs`↔`src/checkpoint/read-budgeted.ts` 等

**证据**(已抽验):`check-context-boundary.mjs` 零 `import dist/`、自行 `import fs` 重写全部逻辑;`src/context-boundary.ts` 有同名 `checkBoundary`/`parseImports`/`resolveFileContext`——**确认是逻辑双写非薄壳**。96 个 mjs 仅 11 个复用编译产物,85 个独立重写。测试覆盖 `src/*.ts`,而 hook/CI 真跑 `scripts/*.mjs`。

**失败场景**:修 `src/context-boundary.ts` 且测试通过,但 PreToolUse hook 真跑的 `.mjs` 未同步 → 线上按旧规则放行/拦截,CI 绿灯。与既往 cmux 事故(测试自我闭环 + doctor 只查语法)**同根因**。

**修复策略**:能走 dist 的 mjs 收敛为薄壳 `import {...} from '../dist/*.js'`,逻辑只留 TS 一份;启动期无编译产物的,扩展 `check-bundle-sync.mjs` 断言 mjs 与 ts 的关键常量/正则一致,让 `npm run check` 抓漂移。

---

## 三、P2 — 应尽快修复

### P2-1 · git 参数注入:`--no-index` 任意读 + `--output` 任意写(绕过 path-validator)

**文件**:`src/mcp/tools/forge-git.ts:198-208,229,265`、`src/mcp/tools/forge-exec.ts:168-173`

**证据**:`forge_git` 的 `git diff${extraArgs}`/`git log ${args}` 走 `execCommand`,`args` 仅过 `containsShellMetachars`,**不过 `isCommandAllowed`、不过 path-validator**。而 `forge-exec.ts:172` 的 allowlist 专门挡了 `--output`(作者知道它危险)——此防护在 `forge_git` 路径**缺失**。`--no-index`/`--output`/`=`/`/` 均不含被拦元字符。

**攻击**(被 prompt injection 操纵的模型可发起):
- `forge_git({subcommand:"diff-content", args:"--no-index /etc/passwd /dev/null"})` → **dump 任意文件**(读私钥外泄),无需 git 仓库。
- `forge_git({subcommand:"log", args:"--output=/tmp/evil"})` → **任意路径写**(内容 git 格式,commit message 部分可控)。
- 在"无 Bash、以 forge-context 为唯一执行面的受限评审 agent"部署里,这是绕过唯一防线 → 升 **P1**。

**逐参数裁定**(已确认):`-c` config 注入**不可利用**(必须在 subcommand 之前,`git log -c` 不设 config,故 core.pager 类 RCE 封死);`--upload-pack` 不可利用(非联网子命令);`--no-index`/`--output` **可利用**;`--ext-diff` 需本地 config 已污染,低危。

**修复策略**:`forge_git` 与 `forge_exec` 对 git 参数统一加 denylist:`--no-index`、`--output`、`-O`/`--output-indicator`、`--ext-diff`;或对路径型参数同过 `path-validator`。

### P2-2 · forge_exec allowlist 参数透传使 "readonly" 名不副实

**文件**:`src/mcp/tools/forge-exec.ts:92,152-166`

**证据**:allowlist 自称 "primary security boundary",却放行 `vitest run <任意参数>`、`npx vitest run <任意参数>`、`biome check <任意参数>`。

**攻击**:`forge_exec({command:"vitest run --config /tmp/x.mjs"})` 通过 allowlist + 元字符检查,vitest 把 `--config` 当模块加载执行顶层代码 → **任意代码执行**。allowlist 声称锁只读命令,但"允许二进制 + 可控配置"= 可执行任意代码。

**修复策略**:对可透传参数的二进制做参数级白名单(禁 `--config`/`-c`/`--project`/`--loader`),或改为固定完整命令而非前缀匹配。

### P2-3 · cmux-mirror 守护进程并发缺陷群

长驻进程,以下缺陷随运行时长累积:

| 子项 | 文件 | 问题 | 修复 |
|------|------|------|------|
| a. sync-once 锁 TOCTOU | `scripts/cmux-mirror/sync-once.mjs:40-56,107-114` | `existsSync`+`writeFileSync` 非原子,两者都进临界区 → 对 cmux 重复 dispatch;`finally` 无条件 `unlinkSync` 删他人锁 | `openSync(O_CREAT\|O_EXCL)`;锁写 PID;release 前读回校验;staleness ≥ N×timeout |
| b. readEventsSince 撕裂行丢事件 | `lib/events.mjs:40,55`、`mirror.mjs:128-129` | 半写尾行被 `JSON.parse` 跳过,但 `cursor` 推进到 EOF → **撕裂行本身**这一条事件永久丢失(后续完整行下次仍可恢复);mirror 无视返回 cursor 用二次 `statSync` 使丢失**确定性**而非偶然 | cursor 只推进到 `lastIndexOf("\n")`,半行留待下次;mirror 用返回 cursor |
| c. event-writer 无锁 append 撕裂 NDJSON | `src/event-writer.ts:9-24` | payload 无上界、裸 `appendFileSync`,超 `PIPE_BUF` 边界并发交错损坏(与 `tool-health-writer` 加锁自相矛盾) | `acquireLockSync` 包裹,或 payload 8KB 截断 + `truncated:true` |
| d. mirror async 重入竞态 | `mirror.mjs:26-42,120-147` | `handleStateChange` async 但 debouncer `setTimeout` 不 await → 同批事件消费两次、`currentState` RMW 丢失 | 加单飞守卫(running 布尔/promise 链),在途时 pending 完成补跑 |
| e. tool-health 双重 unlink 偷锁 | `src/tool-health-writer.ts:142-156` | stale 锁破锁不重校验,A 删掉 B 刚建的新锁 → 并发 append 损坏 | 偷锁改 `renameSync` 抢占(`destructive-nonce.ts` 已有正确范式) |

### P2-4 · status 处理碎片化 + frontmatter 四套 + token 两套矛盾公式

**文件**:`src/state.ts`、`src/status-file-ext.ts`(756L)、`src/status-manager.ts`、`src/status-resolver.ts`、`src/frontmatter.ts`、`src/token-estimate.ts`、`src/checkpoint/read-budgeted.ts`

**证据**:
- status 逻辑散落 4 模块,`status-file-ext.ts` 对同一份内容做 `{Loop,Execution,Pua,Package}` 四族重复的 `extract/write/clear` 三连,内含**自己的第四套 `parseFrontmatter`**。
- frontmatter 有 fan-in 17 的权威 `frontmatter.ts`,却被 `docs-governance/frontmatter/parser.ts`、`spec-parser.ts:48`、`status-file-ext.ts:123`、`spec-bundle-io.ts:39` **另外四处绕过重写**。
- token 公式**矛盾**:`token-estimate.ts:32` 是 CJK 加权,`checkpoint/read-budgeted.ts:47` 是朴素 `length/CHARS_PER_TOKEN`(注释自陈"靠约定对齐"),`compact-inject.mjs:27` 是 `length/4`。`context-budget.md` 明文要求统一 `length/4`,与 CJK 公式冲突 → 中文内容 WARNING/CRITICAL 阈值错判、裁错内容。

**修复策略**:`frontmatter.ts` 定为唯一解析器(docs-governance 需不同返回形状则包适配层);`state.ts` 定为唯一 status 解析/序列化 owner,`status-file-ext` 四族三连收敛为单一 codec(record 描述字段族);token 指定 `token-estimate.ts` 唯一实现,加含 CJK 样本的断言测试锁定两处相等。

---

## 四、P3 — 建议改进(开发者决定)

- **accept-driver.ts God module**(`src/accept-driver.ts`,1220L/34 符号/5 职责):拆 `accept/{contract-fresh,pyramid,report,http-probe}.ts`,主文件只留 Runner 编排。
- **barrel 循环**(`src/spec.ts`↔`spec-bundle.ts`、`learn.ts`↔`glossary-hook.ts`、`router.ts`↔`router-hint-rules/intents`):共享类型下沉 `*/types.ts`,barrel 只做纯 re-export、不被子模块反向 import。当前多为 `import type`(编译期擦除,不致命),但一旦某回边变 value import 即触发运行时初始化环。
- **forge_read 依赖 Node vm 作信任边界**(`src/mcp/tools/forge-read.ts`):已强化(null 原型 context、`codeGeneration:{strings:false,wasm:false}`、`--no-addons --disable-proto=throw`),未发现可用逃逸,但 Node 官方明确 vm 非安全机制。该模式已 `@deprecated`,建议彻底移除 script 模式,只留结构化操作。
- **push-server**(`scripts/cmux-mirror/lib/push-server.mjs`):确认是 Unix socket 非网络暴露(正面结论);残留单行 buffer 无上界(本地内存 DoS)+ listen 前不 unlink stale socket(崩溃后推送通道静默失效)。加缓冲区上限 + listen 前 `unlinkSync`。
- **持久化错误信息未脱敏**(`src/observability.ts:26-27,55`):注入客户端异常 `e.message` 若含 token 会明文落盘 `.forge/findings/`;项目已有 `src/secret-redactor.ts` 但此处未应用 → 写盘前过 `redactSecrets()`。
- **respawn 非原子**(`scripts/cmux-mirror/lib/respawn.mjs:25-39`):`tryConsumeRespawn` 读-检-写非原子 + 共享固定 `.tmp` 名(rename ENOENT 会抛),`syncOnceWithRespawn` 当前零调用方(接线即触发)。tmp 名加 PID 后缀 + O_EXCL 自增 + 调用处 try/catch。
- **perf hook 微优化**(见附注):移除已 `@deprecated` 仍注册的 `track-read-budget.mjs`(`.claude/settings.json:105-113`);`PreToolUse` Bash 的 `while read -r f; do node check-frozen.js` 循环(`settings.json:88`)改单次调用传全部路径;`inject-plan-context.mjs:56` 顶层 IO 移到 subagent skip 判断之后。

---

## 五、建议执行顺序

1. **P1-2 hook 回退链**(最快、纯配置改动、堵住恶意仓库 RCE,零逻辑风险)。
2. **P1-1 状态锁**(封装 `writeStatusAtomic` 收口所有 status 写入,连带解决 P2-3c/e 的锁复用)。
3. **P2-1 + P2-2 MCP 工具参数注入**(git denylist + vitest 参数白名单,一起改)。
4. **P1-3 mjs/ts 双写**(收敛薄壳 + `check-bundle-sync` 断言,防止后续修复在两份代码间再漂移)。
5. **P2-4 收口单一实现**(frontmatter/token/status owner,配断言测试)。
6. **P2-3 cmux-mirror 并发群** + P3 项按维护窗口消化。

---

## 附注 · 审查方法论与剔除项(重要)

本次审查的每条 agent finding 都经主审**亲自读代码复核**,未过复核者剔除。剔除的性能维度 agent 报告:

- **"cmux 全量重读 + 无界 `state.seen` Set"(原标 P1)**:**证伪**。实读 `mirror.mjs:114,128-129` 用真实递增 `eventCursor`(从文件末尾起,不重读历史),文件中**根本不存在** `state.seen` Set,也无 `DEFAULT_INTERVAL=2000`。其引用的每处代码在实际文件中不存在。
- **"project-root findProjectRoot 向上查找循环 bug"(原标附带 bug)**:**证伪**。实读 `src/mcp/project-root.ts` 仅 34 行、是基于 `CLAUDE_PROJECT_DIR` env 的 `resolveProjectRoot`,**无 `findProjectRoot` 函数、无向上查找循环**。

该 agent 自身披露过"多次文件读取失败",其两条最严重发现均为幻觉。**教训**:多 agent 审查必须对每条发现独立复核,行号/文件引用对不上的一律不入报告。相比之下 logic agent 正确识别了 `events.mjs` 是增量 cursor,并进一步抓到 perf 漏掉的真实边缘缺陷(P2-3b 撕裂行丢事件)——这正是复核的价值。

**已核实为正确设计(无需改)**:`path-validator.ts`(realpath+relative 双检挡前缀攻击)、子进程几乎全走 `execFile` 数组模式(无 shell 注入面)、`ship-gates.ts` 的 P0/P1 阻断门禁(methodology=unavailable 阻断、P0>0 阻断、P1 需 fix commit 才放行)、`destructive-nonce.ts`(renameSync 原子消费)、`status-file-ext.ts` 全部为纯函数、JSONL entry 均有界截断。

---

*审查完毕。共 3 个 P1 + 4 个 P2 + 6 类 P3,全部附文件路径、失败场景、修复策略,可直接分派执行。最高杠杆两项:P1-2(一次配置改动堵 RCE)和 P1-1(收口原子状态写入面)。*

---

## 六、后续轮次处置记录 [2026-07-14]

分支 `forge/security-status-closure`。全部修复 TDD 驱动,`npm run check` 全绿(9121 测试)。

### 已修复(全部 P1 + 全部 P2 + 全部 P3)

| Finding | 状态 | 关键改动 |
|---|---|---|
| P1-1 状态锁 | ✅ | `writeStatusAtomic` 复用 `acquireLockSync`;删 `state.ts` 死锁函数;规则文档对齐真实常量 |
| P1-2 hook RCE | ✅ | 删 35/37 裸相对回退分支;`normalize-hook-paths.mjs` 接入 CI;勘误 P0 范围限定 |
| P1-3 mjs/ts 双写 | ✅ | 3 个明显重复改薄壳(agent-originality/dist-sync/agent-links);check-bundle-sync Layer 4 漂移断言(compact-inject token 公式) |
| P2-1 forge_git 注入 | ✅ | `validateGitArgs` denylist(`--no-index`/`--output`/`-c`/`--ext-diff`/`-O`) |
| P2-2 forge_exec 参数 | ✅ | runner-flag denylist(`--config`/`-c`/`--loader`/`--project`) |
| P2-3 并发群(5 子项) | ✅ | a 锁 O_EXCL+PID;b cursor lastIndexOf(\n);c event-writer 加锁+8KB 截断;d 单飞守卫;e 偷锁 mtime 复验 |
| P2-4 token 矛盾 | ✅ | `read-budgeted.ts` 改用 `tokenEstimate`(CJK 加权);`compact-inject` 经 Layer 4 断言对齐 |
| P2-4 frontmatter 收口 | ✅ | 5 个同关注点解析器合并到 `frontmatter.ts` 适配器 + spec 共享 helper;3 个不同域保留 |
| P3-4 push-server | ✅ | buffer 1MB 上限 + listen 前 unlink stale socket |
| P3-5 未脱敏 | ✅ | `error_message` 过 `redactSecrets()`(路径修正:`src/review-comment-bitbucket/observability.ts`) |
| P3-6 respawn 非原子 | ✅ | withLock(O_EXCL) 串行化 RMW + PID tmp 名 + 释放前 PID 复验 |
| P3-1 accept-driver 拆分 | ✅ | 拆 accept/{contract-fresh,pyramid,http-probe}.ts + barrel;14 测试零改动 |
| P3-2 barrel 循环 | ✅ | 共享类型下沉 session-types.ts + router-types.ts(leaf 模块) |
| P3-3 forge_read vm 移除 | ✅ | script 模式全删(vm/execReadScript/validateScript);仅留 structured ops |

### 延迟 / 跳过(P3,开发者决定)

- ~~**P3-1 accept-driver 拆分(1219L)**:**延迟**~~ → **✅ 已完成(后续轮次)**。拆为 `src/accept/{contract-fresh,pyramid,http-probe}.ts` + 主文件留 Runner 编排;accept-driver.ts 作 re-export barrel,14 个测试文件零改动。188 测试绿。
- ~~**P3-2 barrel 循环**:**跳过**~~ → **✅ 已完成(后续轮次)**。learn↔glossary、router↔{hint-rules,intents} 共享类型下沉到 `src/session-types.ts` + `src/router-types.ts`(leaf 模块,不 import 任何东西),消除 value 边循环。393 测试绿。
- ~~**P3-3 forge_read vm 移除**:**跳过**~~ → **✅ 已完成(后续轮次,用户确认硬移除)**。script 模式全删(execReadScript/validateScript/buildJavascriptSandboxScript/buildSandboxEnv/DANGEROUS_SCRIPT_PATTERNS + script/language schema 参数);Node `vm` 不再是信任边界。保留 structured operations(imports/contains/line_count/json_keys)。删 2 个纯 script-mode 测试,forge-read.test.ts 重写覆盖 structured ops。30 测试绿。

### P2-4 部分延迟

- token 公式统一(最高杠杆)已落地。
- ~~frontmatter 四套解析器收口~~ → **✅ 已完成**。5 个共享同一关注点的解析器(status-file-ext/execution-mode/spec-parser/spec-bugfix/spec-bundle-io)合并到权威 `frontmatter.ts` + 适配器 `parseFrontmatterPreservingLeading` + 共享 helper `extractSpecFrontmatterYaml`/`extractSpecField`。3 个不同域解析器(docs-governance Zod / glossary map / review yaml)确认为不同关注点,保留。192 测试绿。
- status 4-family(Loop/Execution/Pua/Package)codec 收敛:**延迟**。各 family 字段编码不同(带引号串/数字/逗号串),generic codec 收益纯整洁性、回归风险高(12 测试文件);已被点名的"自己的 parseFrontmatter"已随 frontmatter 收口移除,故剩余重复不阻塞。
