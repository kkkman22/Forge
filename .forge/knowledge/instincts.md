---
updated: "2026-05-24"
---

## 模式列表

### 正则 `.test()` 永远使用内联正则，不用全局正则

**Confidence_Score**: 0.85
**Tags**: regex, testing, bug-prevention
**来源**: ship-delivery-pure-functions

`/g` flag 正则的 `.test()` 方法会残留 `lastIndex`，导致同一字符串在连续调用中返回不同结果。永远用 `/pattern/.test(str)` 内联正则，或在调用前手动重置 `lastIndex = 0`。此 bug 在属性测试（fast-check 多次迭代）中最容易暴露。

### 外部命令使用纯函数构建器 + execFileSync

**Confidence_Score**: 0.8
**Tags**: security, command-injection, pure-function
**来源**: ship-delivery-pure-functions

构造外部命令（Git、Docker、SSH）时，使用纯函数返回 `{ executable, args }` 描述符，通过 `execFileSync(executable, args)` 执行。不在任何地方拼接命令字符串。入口处调用 `validate()` 做输入验证，使用 reject 策略（不 sanitize）。

### 安全验证需要多字符序列检查

**Confidence_Score**: 0.7
**Tags**: security, validation, input-checking
**来源**: ship-delivery-pure-functions

字符白名单无法拦截多字符攻击序列（如 `..`、`@{`、`.lock`）。输入验证必须同时包含字符级和序列级检查。对于 Git 分支名，还需检查首尾字符限制。

### Shell hook 安全三件套：case allowlist + tr 净化 + 读取前校验

**Confidence_Score**: 0.9
**Tags**: security, hooks, shell, allowlist, sanitization
**来源**: hooks-security-sanitization, ccbp-phase2-worktree-gitignore

Hook 脚本中：(1) 用 `case` 语句精确匹配 allowlist，不用 `grep -qE` 正则；(2) 外部输入用 `tr -cd 'a-zA-Z0-9_-'` 净化后再拼接路径/文件名；(3) `cat` 外部文件前检查 header 标识，无效则删除+exit 0。

### .claude/ 被 gitignore 时用 git add -f 跟踪

**Confidence_Score**: 0.85
**Tags**: git, gitignore, worktree, .claude
**来源**: ccbp-phase2-worktree-gitignore

`.claude/` 整体在 .gitignore 中排除。需要版本控制的文件（agents/、rules/、hooks/scripts/）必须 `git add -f`。忘记 -f 会导致 merge 时文件丢失。

### Agent tool 并行启动后必须用返回的 agentId 数量做 sanity check

**Confidence_Score**: 0.6
**Tags**: tool-quirks, agent-tool, subagent, parallel, task-output
**来源**: 2026-05-24 /forge review spec-check 内联返回观察

并行启动 N 个 subagent 时，Agent tool 有两种返回路径：(1) **异步路径** 返回 `Async agent launched successfully` + `agentId`，需后续 TaskOutput 拉取；(2) **内联路径** subagent 提前完成（如只读了文件就退出），结果直接塞进 tool result，**不返回 agentId**。

内联路径下 subagent 仍按 internal ID 在 `tasks/` 写 `*.output` 文件，但该 ID 未注册到 task registry。事后用 grep 找到的文件 ID 喂给 TaskOutput 一定得到 `No task found`。UI 偶尔会把 internal ID 双倍拼接展示（如 `<id><id>`），任何非标准 hex 长度的 ID 一律视为无效，不要传给 TaskOutput。

**防御步骤**：(a) 启动 N 个 subagent 后立即校验显式返回 agentId 数量；(b) 数量 < N 时直接采用内联 tool result 文本，**禁止**事后 grep `tasks/` 反向补 ID；(c) 仅对确认异步的 agentId 调 TaskOutput；(d) 内联内容明显不完整（只有读文件痕迹、无评审结论）时**重试**该 layer 而非接受残缺结果。

落点：`.claude/agents/forge-review.md` §Agent Tool ID Defense。

### 删除公开源文件必须三件套：package.json exports + barrel + CHANGELOG

**Confidence_Score**: 0.85
**Tags**: refactor, deletion, public-api, package.json
**来源**: code-slim-0612 P1-Wave1

删除公开源文件时，三处必须同步检查：(1) `package.json` `exports` 条目是否引用该文件路径——有则一并删除；(2) barrel `src/index.ts` 是否 re-export 该模块——有则移除；(3) `CHANGELOG.md` `[Unreleased] ### Removed` 登记。漏任何一项均会导致 P0（dangling subpath / 404 解析 / 用户不知情）。Review L4 adversarial 最容易捕获此类问题。

### check-dist-sync.mjs 读 git 索引非工作树——rm 后须 git add

**Confidence_Score**: 0.8
**Tags**: tool-quirks, dist-sync, git, refactor
**来源**: code-slim-0612 P1-Wave1

`check-dist-sync.mjs` 使用 `git ls-files` 读 git 索引而非工作树。`rm` 删除文件后索引仍跟踪旧路径 → 误报 drift。删除文件后必须 `git add <path>` 暂存删除使索引更新，dist-sync 才能正确通过。此外 dist 模型双轨：`dist/src/*` gitignored / `dist/test/*` tracked，跨任务未运行 dist:resync 会导致 tracked dist 滞后。

### 删除模块前必须验证三重边界：barrel re-export + skill 引用 + 调用链深度

**Confidence_Score**: 0.85
**Tags**: refactor, dead-code, barrel, skill-references, call-chain
**来源**: code-slim-0612 P2-Wave2

判断模块是否可安全删除需验证三重边界：(1) **Barrel re-export**：grep `src/index.ts` 是否 re-export 该模块——如果是，删除会改变公共 API（违反 INV-1）；(2) **Skill/instructions 引用**：grep `skills/` 是否有 `instructions.md` 引用该模块——skill 行为依赖代码存在但无显式 import；(3) **调用链深度**：零直接 caller 不够，需追踪二级调用（A→B→C，B 零外部 caller 但 C 被 scripts/ 调用 → B 非死代码）。错误案例：Explore agent 报 renderer-registry.ts 死代码，实际被 ssot-loader.ts 调用，而 ssot-loader 被 scripts/ 使用。

### decide 阶段的 scope/ROI 估计是乐观上限——R10 验证必然收敛

**Confidence_Score**: 0.85
**Tags**: refactor, scope-estimation, decide, verification
**来源**: code-slim-0612（T3/T5/T6 三例同型）

decide 阶段产出的"可精简空间"估计（如"12 个合并候选"、"N 个死模块"）是**乐观上限**，经 R10（grep import + entry + 调用链双向核验）后必然收敛。code-slim-0612 六任务中 T3（ghost API，0 安全）、T5（skill 引用，0 安全）、T6（12→1 真合并）三例均大幅缩水至 0 或接近 0。**规则**：不信任 decide 的 LOC/候选数估计；plan 前必须跑 R10 实测；预期 scope 收敛而非扩张；当实测远小于估计时，诚实缩范围（保守跳过）优于硬凑改动。

### 同仓库并发会话冲突的检测信号与恢复

**Confidence_Score**: 0.8
**Tags**: git, concurrency, collision, recovery, blocking
**来源**: code-slim-0612 T6（外部会话 6fbe3f8a 并发 reset 分支）

当另一进程/会话并发操作同一 git 工作树时，HEAD/分支会在你的命令之间移动、commit 被 reset/替换、ancestry 漂移、暂存区被清空。**检测信号**（任一即高度可疑）：(1) `git merge-base --is-ancestor <c> HEAD` 在两次查询间结果翻转；(2) `git reflog` 出现非本会话发起的 `commit`/`reset`/`checkout`，且时间戳在你的会话期间；(3) 你刚 commit 的 SHA 片刻后 "not in HEAD"；(4) 暂存区莫名清空；(5) 已删除文件"复活"（分支被 rebase 到删除前的基）。**恢复铁律**：立即 `git diff > /tmp/work.patch` 存 patch → **停止一切 git 写操作**（任何 commit/race 都可能丢失或孤儿化）→ 让用户停掉另一会话 → 重新建立 ground truth（重读 branch/HEAD/ancestry，勿沿用旧假设）→ 在正确分支 `git apply` patch → 重新 verify + commit。**禁止**：在 reflog 仍在动时继续提交；用 `git stash drop stash@{0}` 按 index 删 stash（list 会漂移，易误删——应先核对 message）。
