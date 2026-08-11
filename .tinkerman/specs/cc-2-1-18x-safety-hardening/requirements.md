---
status: draft
feature: cc-2-1-18x-safety-hardening
layout: requirements
created: 2026-06-23
tier: standard
source: "Claude Code 2.1.181 / 2.1.183 / 2.1.186 changelog 调研"
---

# Requirements — Claude Code 2.1.18x 安全护栏借鉴

## Purpose

Claude Code 2.1.181 / 2.1.183 / 2.1.186 在"命令级安全护栏"与"subagent 编排防护"上补了一批课:破坏性 git 命令的内容级拦截、subagent spawn 前的权限预审、嵌套深度硬上限、knowledge 逼近上限预警。

Forge 的工程纪律(§2.2 分支隔离、§2.4 三击检测 + git rollback、frozen zone 三区保护、三层独立评审)已经在**流程级**覆盖了这些场景,但在**命令级 / 编排级**还留有盲区:防线偏"事后回滚"而非"事前阻断",subagent 的 forbidden 工具是静态 frontmatter 声明而非 spawn 时动态校验,嵌套 subagent 没有显式深度上限,knowledge 清理缺前置预警。

本 spec 把调研报告中 P1/P2/P3 三档共四点固化为一组"防护层增强",目标是:把 Forge 现有的"事后兜底"补成"事前阻断 + 事后兜底"双保险,且不与现有的 git 事务回滚 / 三击检测 / frozen zone 冲突。

**面向对象**:Forge 维护者与高自动化(autonomous)模式用户——他们在无人值守时最依赖事前护栏。

## Glossary

| Term | Definition |
|------|-----------|
| 破坏性命令 (destructive command) | 会不可逆地丢弃本地工作或改写历史的命令,如 `git reset --hard`、`git clean -fd`、`git stash drop` |
| shell 规范化 (shell normalization) | 规则匹配前对命令的预处理:剥除引号、解析 `env`/绝对路径前缀、识别 git 全局 flag 前置、展开 `bash -c`/`sh -c` 包裹;使 `env git reset --hard` 与 `git reset --hard` 归一为同一判定 |
| rollback nonce | Forge loop/事务回滚 skill 在执行回滚前生成的一次性随机值,写入受信文件 `.tinkerman/.rollback-nonce` + HMAC 校验;guard 校验后即焚(删除文件),确保单次有效且不可伪造 |
| HMAC | 基于 nonce + 项目密钥计算的消息认证码,确保 nonce 来自 Forge 自身而非伪造;校验时重算并比对 |
| spawn-time policy check | subagent 启动前按其 identity + 父链路的工具禁令做的一次动态校验(校验"是否允许 spawn 这个 subagent",而非预测它将调用哪些工具——后者是运行时 PreToolUse 的职责) |
| spawn 工具名集合 | CC 已知的 subagent spawn 工具名集合(`Agent`/`Task`/`dispatch_agent` 等);lineage 的 `disallowedTools` 含任一即表示该层级禁止再 spawn |
| subagent depth | 一个 subagent 链路里 agent 嵌套的层数,leader 为 0,直接子 agent 为 1;`depth < max_subagent_depth` 允许 spawn 子,`depth >= max_subagent_depth` 拒绝 |
| knowledge 逼近上限 | `.tinkerman/knowledge/solutions/` 文档数达到 `knowledge_limit` 的 90%(默认 18/20) |

## Current State

- `src/sandbox-policy.ts:17-25` re-export 了 `checkCommandPolicy` / `checkFilesystemPolicy` 等纯函数,被 `src/check-sandbox.ts`(PreToolUse hook)调用,但只覆盖**文件系统/网络/命令 profile**,没有对 git / 基础设施命令做内容级(参数级)拦截。
- `src/check-sandbox.ts:113-179` 的 `checkSandboxAccess` 返回 `{ allowed: boolean; reason: string }`,**无** verdict 枚举,多个子检查通过短路串联(任一 deny 即 deny)。
- `src/execution-mode.ts:29-42` 定义了 `ConfirmationPoint`,autonomous 模式在各确认点套用 `AUTONOMOUS_PRESETS`,但**没有**"破坏性操作确认点"——destructive action 不在 `ConfirmationPoint` 枚举里。
- `agents/*.md` frontmatter 声明 `disallowedTools` 为**工具名列表**(如 `[Bash, Write, Edit, Agent]`,`Agent` 表示禁止再 spawn 子 agent;有契约测试 `test/contract/skill-disallowed-tools.test.ts`),但 dispatch 路径(`src/forge-dispatcher.ts` / `src/forge/agents-dispatcher.ts`)**没有** spawn 时校验父链路是否禁止 spawn 的环节。
- `config.md` 有 `max_parallel_agents: 6`,`src/config-store.ts:131-183` 解析它,但**没有** `max_subagent_depth` 字段,grep 全仓库未发现嵌套深度上限的显式常量。
- `skills/forge/lib/learn/instructions.md:588` 与 `references/maintenance-invariants.md:7` 记录 solutions 上限 20,清理规则是"超限后按 confidence 从低到高删除",但**没有**"逼近上限(90%)时主动提醒"的触发点。
- `skills/forge/lib/loop/instructions.md:105` 显示 Forge loop 的事务回滚**依赖 `git reset --hard`**——任何 destructive guard **必须**让 Forge 自身的回滚畅通,否则会阻断熔断/三击检测后的恢复机制,形成"护栏 DoS 自己"。
- Forge 现有回滚路径**不使用** `git commit --amend`(grep 全仓库无命中),故本 spec 首版不覆盖 amend 判定,避免无据设计。

**v1 已实现代码的缺陷(2026-06-23 review 发现,本 v2 修订针对修复)**:
- `src/destructive-guard.ts:140` 的 `tokenize` 用空白 split,无视引号/`$()`/换行/全局 flag/绝对路径/`env`/`bash -c`,导致 `git reset --hard=1`、`env git reset --hard`、`git --no-pager reset --hard` 等构造绕过规则。
- bypass 通道走裸 env token(`FORGE_ROLLBACK_IN_PROGRESS` / `FORGE_ALLOW_DESTRUCTIVE`):① 全仓库无任何代码/skill 设置它(loop 回滚会被护栏 DoS);② env 无完整性校验,写 `~/.zshenv` 即可永久伪造禁用;③ `FORGE_ALLOW_DESTRUCTIVE` 文档称 per-command 实为 per-session。
- `src/check-sandbox.ts:179` 只读 env 不读 config.md,`destructive_guard: off` 不传导到 hook。
- `src/forge/agents-dispatcher.ts` 的 `dispatch()` 无生产 caller(checkSpawnPolicy 是孤儿),lineage/depth 由 caller 自报且缺失即 skip;spawn 工具名只锁单一字符串 `"Agent"`。
- `hooks/hooks.json` 把 destructive guard 挂在 `.tinkerman/.sandbox-active.json` 条件分支下,默认非 sandbox 模式 guard 不运行。
- R3-AC1 边界语义实现 `depth>=maxDepth` 与 spec Evidence 不一致;R3-AC4 tool-health 写入未实现。

## Requirements

### R1: 破坏性命令内容级拦截(destructive-command guard)

**User Story:** 作为 Forge 用户,我希望在无人请求丢弃本地工作时,`git reset --hard` / `git clean -fd` / `git stash drop` / `* destroy` 这类破坏性命令被事前阻断,以免一次误执行毁掉未提交的工作;同时 Forge loop 的事务回滚(依赖 `git reset --hard`)不受影响,且护栏的 bypass 通道不可被伪造。

**v3 修订背景(2026-06-23 第二轮 review)**:v1 用空白 split 漏引号/env/路径/bash -c;v2 加规范化引擎修了这些,但规则仍用精确等值匹配,被 shell 元字符(`;` `&` `|` `$()` 嵌入引号)逃逸——`git reset --hard;` 这种自然写法因 `--hard;` !== `--hard` 而放行。根因:试图"全识别"破坏性命令是攻防不对称的无底洞(shell 语法组合爆炸),且 design 的"解析失败→allow"对不可逆操作方向错误。**v3 放弃全识别,改为白名单裸命令 + fail-closed**:只精确放行可识别的"简单裸命令"形态,任何含 shell 元字符或无法归一的复杂形态一律 deny(提示用户确认或签发 nonce)。bypass 通道(nonce+HMAC)保留并加固(secret 改不可观测源、原子即焚、文件锁防并发)。

#### Acceptance Criteria

1. **白名单裸命令精确匹配 + shell 元字符 fail-closed(v3 核心)**:THE guard SHALL 采用"白名单 + fail-closed"策略,而非全识别:
   - (a) **白名单放行形态**:guard 只对归一化后的**简单裸命令**精确匹配破坏性规则。归一化仅做最小处理:剥 `env` 前缀、绝对路径取 basename(这两类是 agent 常见无歧义写法)。白名单破坏性命令:`git reset --hard [<ref>]`、`git checkout -- <path>`、`git clean -fd[x]`、`git stash drop [<ref>]`、`<infra> destroy [<stack>]`。
   - (b) **shell 元字符 fail-closed**:WHEN 命令含任何 shell 元字符(`;` `&` `|` `` ` `` `$()` `>` `<` `()` `&&` `||` `\\`)或嵌入/拼接引号(`--'hard'`、`--h"ar"d`)或 `bash -c`/`sh -c` 包裹时,THE guard SHALL **deny**(不 allow),诊断提示"destructive guard 不支持该命令形态,请用裸命令或签发 nonce"。**禁止**对无法归一的复杂形态放行。
   - (c) **可识别裸命令全 deny**:以下白名单形态 SHALL 全部 deny(无 bypass 时):`git reset --hard`、`git reset --hard HEAD~1`、`env git reset --hard`、`/usr/bin/git reset --hard`、`git checkout -- src/file.ts`、`git clean -fd`、`git stash drop`、`tofu destroy`(缺 stack)、`terraform apply -destroy`(无 target)。
   - **Verify-By**: vitest:unit
   - **Evidence**: `test/destructive-guard.property.test.ts` (c) 白名单形态全 deny;(b) 元字符构造(`git reset --hard;`、`git reset --hard&&ls`、`git reset --'hard'`、`$(git reset --hard)`、`bash -c 'git reset --hard'`)全 deny(非逃逸);property test 随机非破坏性命令断言 allow(假阳性不变量)。
2. **bypass = nonce + HMAC(防伪造)**:THE guard SHALL 通过受信 nonce 文件 `.tinkerman/.rollback-nonce` 实现 bypass,而非裸 env 布尔。Forge loop/事务回滚 skill 在执行回滚**前**生成一次性 nonce(写入 `.tinkerman/.rollback-nonce` + 计算 HMAC),guard 校验 nonce 文件存在且 HMAC 合法后放行,**校验后即焚**(删除 nonce 文件,确保单次有效)。env `FORGE_ROLLBACK_NONCE=<nonce>` 仅传递 nonce 值,不作为可信判定来源。
   - **Verify-By**: vitest:unit
   - **Evidence**: (a) nonce 文件存在 + HMAC 合法 → allow + `bypassReason: "rollback-active"`;(b) 仅 env 有 nonce 但文件缺失 → deny;(c) 放行后 nonce 文件被删除(二次校验 deny)。
3. **user-single-allow = nonce(防 per-session 泄漏)**:THE 用户单次放行 SHALL 同样走 nonce 机制——用户授权时生成 nonce 写 `.tinkerman/.allow-destructive-nonce`,guard 校验后即焚。**禁止**仅凭 env 非空即放行(消除"per-command 实为 per-session"漏洞)。
   - **Verify-By**: vitest:unit
   - **Evidence**: nonce 文件存在 → allow + `bypassReason: "user-single-allow"`;放行后即焚;无 nonce 文件 → deny。
3a. **nonce 加固(防推导/重放/竞态,v3)**:THE nonce 机制 SHALL 满足三项加固:
   - (a) **secret 不可观测**:HMAC secret SHALL **不**来自仓库内可读/可改的文件属性(如 config.md mtime——失控 agent 能 stat 重算)。secret SHALL 来自进程启动时注入或一次性随机生成的 `.tinkerman/.guard-secret`(0600 权限,首次自动生成后不再变);`FORGE_DESTRUCTIVE_SECRET` env 仍可作为显式覆盖。
   - (b) **原子即焚**:nonce 消费 SHALL 用原子操作(如 `rename` 到 `.consumed/` 目录)而非 `unlinkSync` + catch;即焚失败 SHALL 视为未消费(return false,拒绝本次 bypass),不可吞错放行。
   - (c) **并发安全**:nonce 消费 SHALL 防并发双消费(TOCTOU)——用原子 `rename`(失败=已被消费→return false)或 `O_EXCL` lock 文件互斥。
   - **Verify-By**: vitest:unit
   - **Evidence**: (a) secret 不含 config mtime;改 config.md mtime 后旧 nonce 仍有效;(b) rename 即焚,模拟 rename 失败 → return false;(c) 并发两进程消费同一 nonce → 仅一个 rollbackActive=true。
4. **infra destroy 规则扩展**:THE guard SHALL 覆盖 `terraform destroy` / `tofu destroy` / `pulumi destroy` / `cdk destroy` / `<tool> apply -destroy`(destroy 经 apply 路径)未指明 stack 时 deny;stack 指明形式包括 `-target`、`--target`、`--stack`、`-stack`。rollback nonce 对 infra destroy **不**生效。
   - **Verify-By**: vitest:unit
   - **Evidence**: `tofu destroy` 缺 stack → deny;`pulumi destroy --stack foo` → allow;`terraform apply -destroy`(无 target)→ deny;rollback nonce 对 infra 不豁免。
5. **config.md off 传导**:THE guard SHALL 读 `.tinkerman/config.md` 的 `destructive_guard` 字段(经共享 `extractScalarField` helper),`off` 时对所有命令放行。check-sandbox hook 入口 SHALL 读 config.md(不仅读 env)。`forge-doctor` SHALL 对 off 输出 P1 告警。
   - **Verify-By**: vitest:unit
   - **Evidence**: config.md `destructive_guard: off` → hook 放行(不依赖 env);`forge-doctor --json` 含 `destructive_guard: { enabled: false, warning: "P1 ..." }`。
6. **默认非 sandbox 声明**:THE 文档 SHALL 明确声明——destructive guard 仅在 `--sandbox` 模式(PreToolUse hook 激活)下生效;默认配置下 guard 不在攻击路径。`forge-doctor` SHALL 报告 guard 是否实际激活(检测 `.tinkerman/.sandbox-active.json` 存在性)。
   - **Verify-By**: vitest:unit
   - **Evidence**: doctor 在 sandbox 未激活时输出 `destructiveGuard: { status: "unknown", message: "guard inactive (sandbox not enabled)" }`;文档 `docs/claude-code-compatibility.md` 含此声明。
7. THE guard SHALL NOT 改变 `check-sandbox.ts` 对非破坏性命令的现有判定;guard 接入采用短路 deny 语义。
   - **Verify-By**: vitest:unit
   - **Evidence**: 现有 sandbox-policy 测试套件全绿(回归);组合用例(sandbox allow + destructive deny → 整体 deny)。
8. **doctor 感知 bypass env**:THE `forge-doctor` SHALL 报告 `FORGE_ROLLBACK_NONCE` / `FORGE_ALLOW_DESTRUCTIVE` env 是否被设置(检测潜在伪造),被设置时标 `warn`。
   - **Verify-By**: vitest:unit
   - **Evidence**: env 被设置 + nonce 文件缺失 → doctor 输出 warn"bypass env set without matching nonce file"。

### R2: Subagent spawn-time 权限预审

**User Story:** 作为 Forge 维护者,我希望 subagent 在真正启动前,按其 identity + 父链路的工具禁令做一次校验,堵住"被禁 spawn 子 agent 的层级仍然 spawn 出子 agent"的漏洞——尤其是 review 三层(spec/quality/security 的 `disallowedTools` 均含 `Agent`)在 dispatch 时若漏判,会出现被禁的子 agent 再 spawn 子 agent。

**v2 修订背景(2026-06-23 review)**:v1 的 `checkSpawnPolicy` 是孤儿函数——`dispatch()` 无生产 caller,lineage/depth 由 caller 自报且缺失即跳过(fail-open)。v2 明确接入点与可信源。

**设计澄清**(对齐 CC `Agent(type)` deny 语义):spawn-time 能校验的是"是否允许 spawn 这个 subagent"(按 identity / 父链路禁令),**不是**预测该 subagent 将来会调用哪些工具——后者由运行时 PreToolUse + 各 agent 自己的 `disallowedTools` frontmatter 负责。本 R2 只覆盖前者。

#### Acceptance Criteria

1. **接入真实 dispatch 路径**:THE spawn-policy SHALL 在实际的 subagent spawn 路径上生效。鉴于 review/decide 经 SDK Agent 工具自然语言 spawn(不经过 `src/forge-dispatcher.ts` 的 `dispatch()`),THE 实现 SHALL 二选一:(a) 把 lineage/depth 校验接入真实 dispatch 调用方,或 (b) 明确将 R2 定性为"`dispatch()` 函数契约",并在 spec/design/SKILL 指令中一致声明"经 `dispatch()` 的 spawn 才受保护",修正引用不存在文件的 SKILL 指令路径。
   - **Verify-By**: vitest:unit
   - **Evidence**: 选项 a 则有集成测试证明真实 dispatch 带 lineage;选项 b 则 spec/design/SKILL 一致声明 + 删除对不存在 `workflow-dispatcher.ts` 的引用。
2. **lineage 可信源**:THE lineage SHALL 从受信源(leader/父 agent 的 frontmatter `disallowedTools`,经解析得到)派生,**禁止**由 dispatch caller 自报未校验的 lineage。caller 缺失 lineage 时 SHALL fail-secure(block)而非 skip。
   - **Verify-By**: vitest:unit
   - **Evidence**: lineage 从 frontmatter 解析(非 caller 自填);缺失 lineage → block(非 skip);构造空 lineage 绕过 → block。
3. WHEN 父链路任一级的 `disallowedTools` 含 spawn 工具名集合(`Agent`/`Task`/`dispatch_agent` 等 CC 已知 spawn 工具名)时,THE dispatcher SHALL 阻断 spawn 并返回 `status: "blocked"` + 命中的层级与规则 `spawn-tool-forbidden`。spawn 工具名集合 SHALL 可随 CC 演进维护(常量集合,非单一字符串)。
   - **Verify-By**: vitest:unit
   - **Evidence**: 构造父级(spec-check,disallowedTools 含 Agent)尝试 spawn 子 → blocked + `spawn-tool-forbidden`;规则覆盖 `Task` 等别名。
4. WHEN 父链路无 spawn 工具禁令、子 agent identity 合法时,THE dispatcher SHALL 放行 spawn。
   - **Verify-By**: vitest:unit
   - **Evidence**: explore(disallowedTools 仅 Write/Edit)spawn 子 → allow。
5. WHEN `checkSpawnPolicy` 不可用或抛错时,THE dispatcher SHALL fail-open(记录 tool-health 事件后放行),**不阻断 review/decide 主流程**(可用性优先)。该 fail-open 分支 SHALL 有测试覆盖(含 tool-health 写入断言)。
   - **Verify-By**: vitest:unit
   - **Evidence**: mock `checkSpawnPolicy` 抛错 → dispatch 继续;`tool-health.md` 记 spawn-policy-error(测试断言写入)。
6. THE 现有 `test/contract/skill-disallowed-tools.test.ts` 契约 SHALL 继续通过。
   - **Verify-By**: bash:contract
   - **Evidence**: `npm run check` 含该契约测试,全绿。

### R3: 嵌套 subagent 深度硬上限

**User Story:** 作为 Forge 维护者,我希望 subagent 再 spawn subagent 时有显式深度上限,防止 decide 两轮 critic 交叉、review 三层嵌套时出现递归爆炸或 token 失控。

#### Acceptance Criteria

1. **边界语义**:THE depth 上限语义为——`depth < max_subagent_depth` 时允许 spawn 子 agent(子将在 depth+1 层,仍 ≤ maxDepth);`depth >= max_subagent_depth` 时拒绝。即 maxDepth=5 时:depth=4 允许(子=5,达上限)、depth=5 拒绝(子=6,超限)。THE dispatcher SHALL 在拒绝时返回 `status: "max-depth-exceeded"` 诊断。
   - **Verify-By**: vitest:unit
   - **Evidence**: maxDepth=5 → depth=4 允许、depth=5 拒绝;maxDepth=3 → depth=3 拒绝。
2. THE depth 上限 SHALL 可经 `config.md` 的 `max_subagent_depth` 配置(正整数,默认 5,范围 1-10)。
   - **Verify-By**: vitest:unit
   - **Evidence**: `config-store.ts` 解析该字段;设为 3 时 depth=3 拒绝。
3. THE depth 上下文 SHALL 随 dispatch 透传(depth 不依赖全局可变状态)。
   - **Verify-By**: vitest:unit
   - **Evidence**: 并发两个独立 dispatch 链路互不污染 depth 计数。
4. **tool-health 写入**:WHEN 深度超限被拒时,THE dispatcher SHALL 记一条 tool-health 事件(`event: "max-depth-exceeded"`,含 depth 与 maxDepth),便于事后排查。
   - **Verify-By**: vitest:unit
   - **Evidence**: depth 超限 → dispatcher 返回 failed + tool-health 日志含 `max-depth-exceeded`(测试断言写入)。

### R4: knowledge 逼近上限预警

**User Story:** 作为 Forge 用户,我希望 `/forge learn` 写入前,当知识库文档数逼近 `knowledge_limit` 的 90% 时得到提醒,以便主动清理或提升 instincts,而不是等超限后被动清理。

#### Acceptance Criteria

1. WHEN `/forge learn` 即将写入且 `.tinkerman/knowledge/solutions/` 文档数 ≥ `ceil(knowledge_limit * 0.9)` 时,THE learn skill SHALL 在结构化输出中输出一条 `[knowledge-near-limit]` 提醒,列出当前数量 / 上限 / 建议动作。
   - **Verify-By**: vitest:unit
   - **Evidence**: mock 18/20 → 断言输出含 `[knowledge-near-limit]` 与建议字段。
2. WHEN 文档数 < 阈值时,THE learn skill SHALL NOT 输出该提醒(零噪声)。
   - **Verify-By**: vitest:unit
   - **Evidence**: 10/20 → 无提醒字段。
3. THE 提醒 SHALL NOT 阻断写入(预警非阻断,与现有"超限才清理"语义一致)。
   - **Verify-By**: vitest:unit
   - **Evidence**: 18/20 时写入仍成功。
4. WHEN `knowledge_limit` 被配置为非默认值时,THE 阈值 SHALL 按新值重新计算(90% 比例不变)。
   - **Verify-By**: vitest:unit
   - **Evidence**: `knowledge_limit: 10` → 9 即触发提醒。

## Non-Functional Requirements

- **NFR-1 (性能)**: destructive guard 的判定延迟 ≤ 5ms(纯函数,无 I/O);spawn-time check 延迟 ≤ 10ms。所有 guard 为纯函数,符合 Forge "SKILL 层做 I/O,src 层做纯逻辑"分层。
- **NFR-2 (可用性)**: 所有新增 guard 遵循 Forge 既有 fail-open 哲学(可用性优先):guard 自身故障不阻断主流程,降级为 tool-health 日志。仅 destructive guard(R1)在用户未关闭时是 fail-secure(deny),因为它保护的是不可逆操作。
- **NFR-3 (可观测)**: 每次 guard 触发(deny / blocked / max-depth / near-limit)都产出可追溯的诊断字段与 tool-health 事件,供 `forge-doctor` 聚合。
- **NFR-4 (向后兼容)**: 不破坏现有 sandbox-policy 测试、skill-disallowed-tools 契约、execution-mode 语义;新增配置字段有默认值,旧 config.md 无需改动即可工作。

## Out of Scope

- **不实现** Claude Code 的 Agent Teams / tmux teammate / iTerm2 mode 任何功能——ROADMAP 已有 Tier 1/2/3 审慎判断,本 spec 不动摇"review/build 永不回迁 Teams"的 ADR。
- **不实现** retry watchdog / stream-stall hint / TUI 交互改进——这些是 CC 的 CLI 层,Forge 委托原生 + Headroom,不在 skill 编排层。
- **不实现** `/config key=value` 直接设值——Forge 的 config.md 属 frozen zone,设计哲学就是不可随意改。
- **不替换** Forge 现有的 git 事务回滚、三击检测、熔断器——本 spec 是它们的事前补充,不是替代。
- **不覆盖** MCP OAuth / AWS credential / Bedrock 缓存等平台认证——委托原生。

## Charter 合规性

 Forge 当前无 `charter.md` active,本节跳过。若未来 charter 引入安全 invariant,destructive guard(R1)与 spawn-time check(R2)应对齐 `security_level: 1` 约束。

## 反漂移声明

- **主目标信号**: 把 Forge 的安全防线从"事后兜底"升级为"事前阻断 + 事后兜底"双保险,聚焦命令级与编排级盲区。
- **非目标信号**: 本 spec **不**重写 Forge 的流程级纪律(分支隔离、TDD、三层评审、frozen zone),**不**引入 Agent Teams,**不**做 CLI/TUI 层功能。
- **验证材料角色**: 本 requirements.md 是 build 与 review 的唯一真理源;design.md 的接口与 tasks.md 的 DoD 必须与本文件每条 AC 一一对应。
