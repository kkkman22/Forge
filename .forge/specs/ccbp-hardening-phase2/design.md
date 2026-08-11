---
feature: ccbp-hardening-phase2
layout: design
created: 2026-05-12
---

# Design Document: CCBP Hardening — Phase 2

## 一、Phase 1 → Phase 2 的交接地带

本 spec 是增量改造，不是重新设计。阅读本设计前应先读完 `ccbp-inspired-hardening/design.md`。本章只描述两个 spec 的**交接契约**——Phase 1 落下什么状态、Phase 2 从哪一点往上接。

### Phase 1 的产出（作为 Phase 2 的地基）

```
已就位：
  .claude/agents/forge-{plan,build,review,ship}.md      ← 4 个 agent 文件
  .claude/skills/forge-{plan,build,review,ship}/         ← skill 降级为 stub
  .claude/rules/spec-editing.md                           ← 1 条示例规则
  .claude/hooks/scripts/dispatcher.sh                     ← 仅处理 2 类事件
  .claude/hooks/HOOKS-README.md                           ← 27 事件清单 + 4 类型文档
  .claude/agent-memory/<agent>/                           ← 4 个目录 + 模板
  .claude/settings.local.json.example                     ← 个人覆盖示例
  .gitignore                                              ← 已加 settings.local.json
  CLAUDE.md                                               ← 已瘦身 ≤200 行，用 @path
  hooks/hooks.json                                        ← 大部分保持原样

留待 Phase 2：
  hooks/hooks.json 的内联 if [ -f ... ] 判断                ← Req 1
  compaction 边界状态保护                                    ← Req 2
  agent frontmatter hooks: / initialPrompt                   ← Req 3, 4
  agent frontmatter isolation: worktree                      ← Req 5
  Dispatcher 剩余 4 类事件                                    ← Req 6
  .claude/rules/ 的 3 条候选规则迁移                          ← Req 7
  CLAUDE.md 第二轮瘦身（条件执行）                            ← Req 8
  CC 最低版本门禁                                             ← Req 9
  Phase 2 的 contract test + 文档                             ← Req 10
```

### Phase 2 的承诺与边界

**承诺**：不破坏 Phase 1 建立的任何结构。4 个 agent 的 frontmatter **只新增**字段（`hooks:` / `initialPrompt` / `isolation`），不改动 `name` / `description` / `tools` / `model` 等既有字段。Dispatcher 只扩展 case 分支，不重写。

**边界**：
- 不升级更多 skill 为 agent（那是下一个 spec 的事）
- 不迁移 `.forge/features/` 里的规则到 `.claude/rules/`（留给后续）
- 不引入 plugin / agent teams / channels 等 Claude Code 新能力（各自已有独立 spec）
- 不对 `.forge/config.md` 做破坏性改动（只追加对 worktree 行为的说明）

---

## 二、变更剧本（Change Scenarios）

每个 Req 对应一个 "pre-change → change → post-change" 剧本。读完这一章就能判断 Phase 2 究竟改变了哪些可观察行为。

### 剧本 A — Hook 冷启动轻量化（Req 1）

**pre-change**（今天的 Forge）：

```bash
# 用户在非 .forge/ 区域写一行代码
$ echo "test" > src/foo.ts

# CC 触发 PreToolUse hook 给 Write
# hooks.json 里的条目：
{
  "matcher": "Write|Edit",
  "hooks": [{
    "type": "command",
    "command": "bash forge/scripts/hook-check-frozen.sh \"$TOOL_INPUT_FILE\" 2>/dev/null"
  }]
}
# ↑ 每次 Write 都 spawn bash + hook-check-frozen.sh
# hook-check-frozen 里再做 [ -f ... ] 判断 → 退出码 0
# 实际动作：一次 bash 进程生命周期，产生 0 动作
```

**change**（Phase 2 落地后）：

```bash
# hooks.json 里的条目变成：
{
  "matcher": "Write|Edit",
  "if": "Write(.forge/**)|Edit(.forge/**)",
  "hooks": [{
    "type": "command",
    "command": "bash forge/scripts/hook-check-frozen.sh \"$TOOL_INPUT_FILE\""
  }]
}
# ↑ if: 在 CC 层过滤，写入 src/foo.ts 时 hook 根本不会被 spawn
```

**post-change**（可测量）：

- 基线：10 分钟 `/forge build` 典型会话，spawn bash 约 180 次
- 目标：同样会话 spawn bash 约 120–130 次（减少 25–35%）
- 测量方法：`scripts/bash-spawn-counter.sh`（见 tasks Task 1.1），挂 20s 采样 × 30 次

### 剧本 B — compaction 之后 `/forge status` 仍然清晰（Req 2）

**pre-change**：

```
[用户已在 build 阶段干了 50 分钟]
Claude Code → 触发 auto-compaction
      → 把前 80% 历史压缩成 summary
      → summary 可能只提 "working on spec X"，但丢失具体 phase、progress 位置

[用户继续对话]
用户: "继续"
Claude: "我需要更多上下文，你在做什么？" ← 糟糕的体验
```

**change**（Phase 2 落地后）：

```
[compaction 即将开始]
CC → 触发 PreCompact hook
      → scripts/hook-precompact.sh 读 .forge/status.md
      → 写 .forge/.compact-snapshot.md:
           slug=my-feature
           phase=build
           progress_tail="- [x] 实现 X\n- [ ] 实现 Y\n- [ ] 测试 Y"
           pr_number=123
           timestamp=2026-05-12T10:00:00Z

[compaction 完成]
CC → 触发 PostCompact hook
      → scripts/hook-postcompact.sh 读 snapshot
      → stdout 输出 snapshot 内容（被 CC 注入到后续 context）
      → 删除 snapshot 文件

[用户继续对话]
用户: "继续"
Claude: "好的，你在 my-feature spec 的 build 阶段，上次停在
         '实现 Y'。我先跑一下现有测试再继续。" ← 正确的体验
```

**非目标**：不处理"用户手动 `/clear` 后继续"——`/clear` 是明确的"忘掉一切"信号，不该被 Forge 覆写。

### 剧本 C — agent 级 hook 在 agent 内自治（Req 3）

**pre-change**：`forge-build` 完成后想自动跑 `npm run check` 兜底，只能放到全局 `hooks/hooks.json` 的 Stop 事件里，但那会对所有 agent 生效（含 forge-plan、forge-review），产生误触。

**change**：

```yaml
# .claude/agents/forge-build.md  frontmatter
---
name: forge-build
description: ...
tools: [...]
model: sonnet
hooks:
  Stop:
    - type: command
      command: |
        bash -c '
          ci_cmd=$(yq ".ci_check_command // \"npm run check\"" .forge/config.md 2>/dev/null)
          $ci_cmd > /tmp/forge-build-ci.log 2>&1
          exit_code=$?
          if [ $exit_code -ne 0 ]; then
            echo "{\"continue\": false, \"stopReason\": \"CI 失败（退出码 $exit_code），请先修复：tail /tmp/forge-build-ci.log\"}"
            exit 0
          fi
          exit 0
        '
---
```

**post-change**：
- `/forge build` 结束时自动跑 CI，失败则阻止 agent 结束，把错误原因给模型
- `/forge plan` / `forge-review` / `forge-ship` 不受影响（它们的 Stop hook 各自在 agent 定义里单独声明，不共用）

### 剧本 D — `/forge plan` 不再需要调用方给长 prompt（Req 4）

**pre-change**：

```
用户: /forge plan my-feature

forge router → 调用 Agent(subagent_type="forge-plan", prompt="
  请读取 .forge/specs/my-feature/spec.md，
  总结范围，用 AskUserQuestion 澄清疑问，
  然后产出 plan...")
# ↑ 这段 prompt 在 router 里硬编码
```

**change**：

```yaml
# .claude/agents/forge-plan.md
---
name: forge-plan
initialPrompt: |
  If a slug was provided by the caller, read `.forge/specs/<slug>/spec.md` now.
  Summarize the understood scope as ≤5 bullets.
  Use AskUserQuestion to clarify any ambiguity before drafting the plan.
  If no slug was provided, ask the user which spec they want to plan.
---
```

```
用户: /forge plan my-feature

forge router → 调用 Agent(subagent_type="forge-plan", prompt="my-feature")
# ↑ router 只传 slug，kickoff 指令在 agent 自身
```

**post-change**：agent 定义文件成为 kickoff 行为的单一事实源，router 被简化。

### 剧本 E — `/forge build` 在 worktree 里跑（Req 5）

**pre-change**：用户在 main branch 上正在编辑文件（未 commit），同时运行 `/forge build`。build agent 读到 main 的脏状态，有两个问题：

1. 测试基线不干净（可能因为用户未保存的修改而红）
2. 如果 build 中途失败，用户的未保存修改和 build 产物混在一起，恢复困难

**change**：

```yaml
# .claude/agents/forge-build.md
---
name: forge-build
isolation: worktree
---
```

CC 会自动：
1. `git worktree add .claude-worktrees/forge-build-<session-id> origin/main`
2. agent 的所有 cwd 切到 worktree
3. agent 完成后 `git worktree remove`

**post-change**：
- build agent 看到的是 `origin/main` 的干净状态
- 用户 main branch 上的未保存改动不受影响
- `.forge/` 目录仍然在主 repo 里（用户能看到 progress 实时更新）——因为 `.forge/` 不在 worktree 里

**要小心的地方**：
- build agent 写的代码在 worktree 里。完成后如果需要合并回 main，需要显式 commit + push 或 merge
- 现有 `scripts/` 里如果有自建 worktree 逻辑，会和 CC 的自动 worktree 打架（见下面剧本 G）

### 剧本 F — hooks dispatcher 完成剩余 4 类事件（Req 6）

**pre-change**（Phase 1 结束时）：

```json
// .claude/settings.json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{"command": "bash .claude/hooks/scripts/dispatcher.sh"}] }],
    "UserPromptSubmit": [{ "hooks": [{"command": "bash .claude/hooks/scripts/dispatcher.sh"}] }],
    "PreToolUse": [/* 还是内联 */],
    "PostToolUse": [/* 还是内联 */],
    "Stop": [/* 还是内联 */],
    "TeammateIdle": [/* 还是内联 */]
  }
}
```

**change**：

```json
{
  "hooks": {
    "SessionStart":     [{"hooks": [{"command": "bash .claude/hooks/scripts/dispatcher.sh"}]}],
    "UserPromptSubmit": [{"hooks": [{"command": "bash .claude/hooks/scripts/dispatcher.sh"}]}],
    "PreToolUse":       [{"if": "Bash(git *)|Write(.forge/**)|...",
                          "hooks": [{"command": "bash .claude/hooks/scripts/dispatcher.sh"}]}],
    "PostToolUse":      [{"if": "Write(.forge/**)|Edit(.forge/**)",
                          "hooks": [{"command": "bash .claude/hooks/scripts/dispatcher.sh"}]}],
    "Stop":             [{"hooks": [{"command": "bash .claude/hooks/scripts/dispatcher.sh"}]}],
    "TeammateIdle":     [{"hooks": [{"command": "bash .claude/hooks/scripts/dispatcher.sh"}]}]
  }
}
```

```bash
# dispatcher.sh 扩展为 6 个 handler 函数
handle_session_start() { ... }
handle_user_prompt_submit() { ... }
handle_pretool() { ... }          # 新增
handle_posttool() { ... }         # 新增
handle_stop() { ... }              # 新增
handle_teammate_idle() { ... }    # 新增

case "$EVENT" in
  SessionStart)      handle_session_start "$STDIN"; return $? ;;
  UserPromptSubmit)  handle_user_prompt_submit "$STDIN"; return $? ;;
  PreToolUse)        handle_pretool "$STDIN"; return $? ;;
  # ...
esac
```

**post-change**：所有 hook 逻辑都在一个脚本里（按事件分函数），改 hook 行为只改一个文件。

### 剧本 G — 新规则按路径自动进/出 context（Req 7）

**pre-change**：CLAUDE.md 里有一节"TypeScript 约定"（strict null、import 顺序等），无论用户是在写 `.md` 文档还是在调 `.forge/specs/`，这节都占 context。

**change**：

```
.claude/rules/forge-src.md:
  ---
  paths: ["forge/src/**", "src/**"]
  ---
  # TypeScript Conventions
  - strict null checks are enforced via tsconfig
  - import order: std lib → 3rd party → ./ relative
  - test files co-located as `<name>.test.ts`
  ...

.claude/rules/skill-editing.md:
  ---
  paths: [".claude/skills/**/SKILL.md", "skills/**/SKILL.md"]
  ---
  # Skill Frontmatter Rules
  - required: name, description
  - field name is `allowed-tools` (hyphenated), NOT `allowedTools`
  ...

.claude/rules/branch-protection.md:
  ---
  paths: ["**/*.ts", "**/*.md"]
  ---
  # Branch Protection
  - never commit to main / master directly
  - branch naming: forge/<slug> or feature/<slug>
  - use /forge ship for push workflow
  ...
```

CLAUDE.md 中对应内容要么删除，要么用 `@path` 引用：

```markdown
<!-- 被 Req 7.4 删除或替换 -->
~~## TypeScript Conventions~~
~~- strict null checks are enforced...~~

<!-- 可选替换（按路径自动加载，不需要手动引用） -->
See `.claude/rules/forge-src.md` for TypeScript-specific conventions (auto-loaded when editing src/).
```

**post-change**：
- 编辑 README.md 时：`forge-src.md` 不进 context，`branch-protection.md` 进 context（因为 paths 含 `**/*.md`）
- 编辑 `src/foo.ts` 时：`forge-src.md` + `branch-protection.md` 都进 context
- 编辑 `.forge/specs/foo.md` 时：`spec-editing.md` + `branch-protection.md` 进 context

### 剧本 H — 旧版 CC 启动即拦（Req 9）

**pre-change**：用户用 CC 2.0.50 跑 `/forge init`，一路成功。但跑到 `/forge build` 的 Stop hook 时，因为 `hookSpecificOutput.updatedToolOutput` 在旧版不对所有工具生效，一些兜底逻辑静默失效。

**change**：

```bash
# scripts/init.sh 开头
check_cc_version() {
  local min_version="2.1.121"
  local current=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  [ -z "$current" ] && {
    echo "⚠ 无法检测 Claude Code 版本，建议升级到 >= $min_version"
    return 0
  }
  if ! printf '%s\n%s\n' "$min_version" "$current" | sort -V -C; then
    echo "❌ Claude Code 版本过低：$current < $min_version"
    echo "   请升级：https://code.claude.com/docs/en/install"
    return 1
  fi
  return 0
}

check_cc_version || exit 1
```

**post-change**：旧版 CC 用户在 init 阶段就被挡住，而不是在后续某个看似随机的 hook 里发现问题。

---

## 三、Blueprint Delta

只展示"Phase 1 → Phase 2"的**文件级差异**，不重复 Phase 1 的蓝图。

### 新增文件

| 路径 | 来源 | 用途 |
|---|---|---|
| `scripts/hook-precompact.sh` | 新写 | PreCompact hook 处理器 |
| `scripts/hook-postcompact.sh` | 新写 | PostCompact hook 处理器 |
| `scripts/bash-spawn-counter.sh` | 新写 | Req 1 的基线测量工具（一次性使用） |
| `.claude/rules/forge-src.md` | 从 CLAUDE.md 提取 | TypeScript 约定 |
| `.claude/rules/skill-editing.md` | 从 CLAUDE.md / SKILL.md 提取 | skill frontmatter 约定 |
| `.claude/rules/branch-protection.md` | 从 CLAUDE.md 提取 | branch 命名和保护 |
| `.forge/runs/<date>-if-migration-baseline.md` | 执行时生成 | Req 1 的 before/after 测量 |
| `.forge/runs/<date>-claude-md-baseline.md` | 执行时生成 | Req 8 的行数测量 |
| `.forge/runs/<date>-compact-events.jsonl` | 运行时滚动 | compaction hook 事件日志 |
| `.forge/decisions/<date>-ccbp-hardening-phase2.md` | ADR | 本 spec 的决策记录 |
| `test/phase2.contract.test.ts` | 新写 | Phase 2 专属 contract test |

### 修改文件（只列 Phase 2 的 delta）

| 路径 | Phase 2 的改动 |
|---|---|
| `hooks/hooks.json` | 所有条件性 hook 迁移到 `if:` 字段 |
| `.claude/settings.json` | `hooks.{PreToolUse,PostToolUse,Stop,TeammateIdle}` 合并为 dispatcher 单条目 |
| `.claude/hooks/scripts/dispatcher.sh` | 扩展为 6 个 handler 函数 |
| `.claude/hooks/HOOKS-README.md` | 补充"事件迁移完成状态表"和 `if:` 用法示例 |
| `.claude/agents/forge-plan.md` | 新增 `initialPrompt` frontmatter |
| `.claude/agents/forge-build.md` | 新增 `hooks: {Stop: ...}` + `isolation: worktree` frontmatter |
| `.claude/agents/forge-ship.md` | 新增 `hooks: {PreToolUse: ...}` frontmatter |
| `.claude/commands/forge.md` | router 的 plan 分支改为不传 kickoff prompt |
| `CLAUDE.md` | 删除或用 `@path` 引用迁到 rules 的内容 |
| `scripts/init.sh` | 开头加 `check_cc_version()` 校验 |
| `README.md` | 前置条件/集成/安全三节更新 |
| `CHANGELOG.md` | Phase 2 unreleased 条目 |
| `.gitignore` | 加 `.forge/.compact-snapshot.md` |

### 文件数净变化

- 新增：**约 11 个**
- 修改：**约 12 个**
- 删除：**0 个**

---

## 四、风险地图

每条 Req 的主要风险 + 降险手段 + 回滚路径。

### 风险 A — `if:` 语法不匹配（Req 1）

**现象**：`if: "Bash(git *)"` 写错为 `if: "Bash('git *')"` 导致 hook 永远不触发，冻结区保护失效但无告警。

**降险**：
1. Task 1.5 引入 hook 行为验证测试：模拟一次 `Bash("git push")` 调用 stdin，断言 dispatcher 被调到
2. contract test 断言每条 `if:` 的正则能被 Claude Code 源码 `permission-rule` parser 接受（静态校验）

**回滚**：`hooks/hooks.json` 有 git 历史，一条命令 `git checkout HEAD~ hooks/hooks.json`。因为 `if:` 变更是纯配置，无需协同其他文件回滚。

### 风险 B — PreCompact hook 自身出错阻塞 compaction（Req 2）

**现象**：`hook-precompact.sh` 里某行出 bug 导致 `exit 2`，CC 以为是"阻塞 compaction 信号"，会话进入死循环（context 满但 compact 被拒）。

**降险**：
1. 脚本开头显式：`trap 'exit 0' ERR`（任何未捕获错误强制 0 退出）
2. Req 2.6 明确要求 PreCompact 永不 exit 2
3. Task 2.3 的测试场景：mock 脚本内部出错，验证最终 exit code 为 0

**回滚**：删除 `scripts/hook-precompact.sh` + `scripts/hook-postcompact.sh`，从 `hooks/hooks.json` 删 PreCompact/PostCompact 条目。无需其他协同。

### 风险 C — agent hooks frontmatter 与全局 hooks.json 双触发（Req 3）

**现象**：`forge-build.md` 的 frontmatter 里声明了 Stop hook 跑 CI；同时全局 `hooks/hooks.json` 的 Stop 条目也跑 CI（Phase 1 遗留）。CI 被跑两次，耗时翻倍。

**降险**：
1. Task 3.3 有一个"冲突审计"子任务：遍历每个 agent 的 `hooks:` 声明，对每条 event+matcher 组合检查是否 global `hooks/hooks.json` 也有匹配项
2. 对齐时保留 agent-specific，全局条目加 `if:` 排除已被 agent 覆盖的场景

**回滚**：删除 agent frontmatter 的 `hooks:` 字段，恢复全局 hooks.json 的相应条目。contract test 要同步降级。

### 风险 D — worktree 隔离破坏用户的 dev server（Req 5）

**现象**：用户的 `npm run dev` 正在 main branch 监听 `src/**`，`/forge build` 在 worktree 里写 `src/foo.ts`，dev server 看不到。用户困惑：为什么我的热重载没触发？

**降险**：
1. Req 5.6 要求 `.forge/config.md` 文档化新行为
2. `README.md` 的"安全与信任"或"工作流"章节加一段 "如果你同时运行 dev server，注意 forge-build 在独立 worktree 里工作，改动需要 merge 后才可见"
3. Task 5.4 手动验证场景包含 dev server 并发

**回滚**：移除 `forge-build.md` 的 `isolation: worktree` 字段。worktree 自动清理，无需手动干预。

### 风险 E — dispatcher case 分支顺序错误导致事件被错误路由（Req 6）

**现象**：dispatcher 的 case 里 `PreToolUse)` 在 `PreCompact)` 之前，但某版 CC 发出的事件名是 `"PreToolUse"`（正确）。如果某天 CC 新增 `"PreToolUseLite"` 等变体，可能因为字符串前缀匹配错误路由。

**降险**：
1. 所有 case 用精确匹配（`case "$EVENT" in PreToolUse) ... ;;`），不用模式（`PreTool*)`）
2. Req 6.5 的函数拆分天然避免了分支穿透

**回滚**：dispatcher.sh 版本化。`git checkout HEAD~ .claude/hooks/scripts/dispatcher.sh`。

### 风险 F — 新规则的 paths 过于宽松导致每个文件都加载（Req 7）

**现象**：`branch-protection.md` 的 `paths: ["**/*.ts", "**/*.md"]` 其实是对"大多数编辑都生效"的有意设计，但如果有人进一步加 `paths: ["**/*"]`，规则就变成全局规则，失去懒加载意义。

**降险**：
1. Task 7.8 的 contract test 断言：每条 rule 的 paths 数组不含 `"**/*"` 或 `"**"`（防止意外全局化）
2. 设计文档明确：`branch-protection.md` 是"广义匹配"的极限案例，不应再有更宽松的规则

**回滚**：修改 paths 或直接删除 rule 文件。

### 风险 G — CC 版本校验阻止有效用户（Req 9）

**现象**：`claude --version` 在某些环境下（如 proxy / corporate）输出被改写，版本号解析失败，check_cc_version 报"无法检测"但默认 allow。或者反过来：输出正常但 `sort -V` 在旧 macOS 的 BSD sort 里有坑，导致误判。

**降险**：
1. Req 9.5 + 9.6 明确：解析失败走 "warn but allow"
2. Task 9.1 的单元测试覆盖：`""`、`"2.1.121"`、`"2.1.121-beta.1"`、`"claude 2.1.121 (darwin)"` 等多种输出
3. 使用 `sort -V` 时显式设 `LC_ALL=C`

**回滚**：从 init.sh 移除 `check_cc_version` 调用。

---

## 五、序列图（关键流程的时序）

### 时序 1：compaction 前后的 snapshot 流（Req 2）

```
CC                   PreCompact hook      .forge/status.md   snapshot file   PostCompact hook
 |                        |                     |                |                 |
 |-- approach limit ----->|                     |                |                 |
 |                        |-- read slug/phase ->|                |                 |
 |                        |<-- data ------------|                |                 |
 |                        |-- write ----------------------->     |                 |
 |<-- exit 0 --------------|                                      |                 |
 |                                                                |                 |
 |-- compact context (internal) ---                               |                 |
 |                                                                |                 |
 |-- post-compact dispatch -------------------------------------->|                 |
 |                                              |                 |-- read -------->|
 |                                              |                 |<-- content -----|
 |                                              |                 |-- delete ------>|
 |<-- stdout (snapshot content, injected to context) --------------|                 |
```

**关键点**：
- PreCompact 只读不写 status.md（避免和主线程冲突）
- PostCompact 用 stdout 注入上下文（源码 `hooksConfigManager.ts` 的 PostCompact 语义是"stdout 作为自定义 compact 指令"）
- 文件删除放在 PostCompact 的最后一步，即使 stdout 注入失败也要删（避免下次 compaction 读到陈旧快照）

### 时序 2：forge-build 的 worktree 生命周期（Req 5）

```
user             forge router        CC Agent tool       worktree dir        main repo
 |                    |                   |                  |                   |
 |-- /forge build --->|                   |                  |                   |
 |                    |-- Agent(sub:forge-build, prompt)---->|                   |
 |                    |                                      |                   |
 |                    |                                     CC sees:            |
 |                    |                                     isolation: worktree |
 |                    |                                      |                   |
 |                    |                                      |-- git worktree add .claude-worktrees/...
 |                    |                                      |           ------->|
 |                    |                                      |                   |
 |                    |                                     agent runs, cwd = worktree
 |                    |                                      |                   |
 |                    |                                     writes to            |
 |                    |                                     src/ (worktree)      |
 |                    |                                      |                   |
 |                    |                                     writes to            |
 |                    |                                     .forge/progress/      |
 |                    |                                     (— via abs path —>)  |
 |                    |                                      |                  writes lands here
 |                    |                                      |                   |
 |                    |                                     agent finishes       |
 |                    |                                      |                   |
 |                    |                                      |-- git worktree remove
 |                    |<-- agent result --------------------|                   |
 |<-- result ---------|                                                           |
```

**关键点**：
- `.forge/progress/` 写入用**绝对路径**（或相对于项目根），不是相对于 cwd——这是 Forge 已有的约定，不需要改
- worktree 自动清理由 CC 保证，Forge 不需要处理
- 如果 agent 在 worktree 里 commit 了代码，合并回 main 是用户的责任（手动 merge / PR）

### 时序 3：dispatcher 的事件路由（Req 6）

```
CC emits event          settings.json if: filter       dispatcher.sh       event handler
     |                           |                          |                     |
PreToolUse(Write src/x.ts)       |                          |                     |
     |                           |                          |                     |
     |-- dispatch -------------->|                          |                     |
     |                           |                          |                     |
     |                           |-- evaluate if:           |                     |
     |                           |   "Write(.forge/**)|..."  |                     |
     |                           |   Write(src/x.ts)         |                     |
     |                           |   NO MATCH               |                     |
     |<-- skipped -------------- |                          |                     |
     |                                                      |                     |
PreToolUse(Write .forge/progress/foo.md)                    |                     |
     |                           |                          |                     |
     |-- dispatch -------------->|                          |                     |
     |                           |-- match -> invoke ------>|                     |
     |                           |                          |-- EVENT=PreToolUse  |
     |                           |                          |-- handle_pretool -->|
     |                           |                          |                     |-- check frozen
     |                           |                          |                     |-- ...
     |                           |                          |<-- exit code -------|
     |<-- result -----------------------------------------|                     |
```

---

## 六、验收画布（Acceptance Canvas）

把每个 Req 的 AC 映射到具体的"验证手段 + 观察点"。这是 tasks.md 的"测试子任务"的设计依据。

| Req | 验证手段 | 观察点 / 断言 |
|---|---|---|
| 1.1 | 静态审计 | `.forge/docs/living/hooks-if-migration.md` 包含当前 hooks.json 每条内联 if 的迁移计划 |
| 1.2–1.3 | diff 检查 | `hooks/hooks.json` 中内联 `if [` / `if [ -f` 数量 `<=` 迁移后预期值 |
| 1.4 | 脚本基线 | `scripts/bash-spawn-counter.sh` 测量，before/after 落地到 `.forge/runs/` |
| 1.5 | 集成测试 | mock stdin 喂 PreToolUse 事件，观察 dispatcher 被调用次数 |
| 1.6 | 文档 | `HOOKS-README.md` 已更新 if-filter 使用说明 |
| 2.1 | 单元 + 集成 | PreCompact hook 读 mock status.md，断言 snapshot 内容正确 |
| 2.2 | 单元 + 集成 | PostCompact hook 读 snapshot，stdout 输出 + 删除文件 |
| 2.3 | 单元 | status.md 缺失时 PreCompact exit 0，无 snapshot |
| 2.4 | 单元 | PostCompact 无 snapshot 时 exit 0 静默 |
| 2.5 | 静态 | `.gitignore` 包含 `.forge/.compact-snapshot.md` |
| 2.6 | 代码审计 | `hook-precompact.sh` 无 `exit 2` / `return 2` 语句 |
| 2.7 | 运行时 | `.forge/runs/<date>-compact-events.jsonl` 格式符合 schema |
| 3.1–3.2 | contract test | `forge-build.md` / `forge-ship.md` frontmatter 含 `hooks:` 字段且路径解析 |
| 3.3 | 冲突审计脚本 | `scripts/audit-hook-conflicts.mjs` 检测无重复 |
| 3.4 | contract test | 同 3.1 |
| 3.5 | schema 校验 | agent frontmatter `hooks:` 字段通过 Claude Code schema（Zod 解析不报错） |
| 3.6 | 文档 | 设计文档记录任何不能 frontmatter 化的 hook 的原因 |
| 4.1 | contract test | `forge-plan.md` frontmatter 含 `initialPrompt`，长度 50–500 |
| 4.2 | 手动 e2e | `/forge plan my-feature` 不传 kickoff prompt，observe agent 先读 spec |
| 4.3 | 单元 | initialPrompt 内容在"无 slug"场景下不崩溃（grep 检查包含 "If no slug" 分支） |
| 4.4 | contract test | 同 4.1 |
| 4.5 | 文档 | design 决策表说明 forge-review / forge-ship 是否采纳 initialPrompt |
| 5.1 | contract test | `forge-build.md` 含 `isolation: "worktree"` |
| 5.2 | 手动 e2e + 审计 | 运行一次 /forge build，观察 worktree 自动创建和清理；审计现有 scripts/ 的 worktree 逻辑 |
| 5.3 | 代码审计 | `scripts/*.sh` 中的 worktree 自建逻辑被标注或移除 |
| 5.4 | 手动 e2e | 测试 `.forge/progress/` 落在主 repo，不是 worktree |
| 5.5 | contract test | 其他 3 个 agent 均无 `isolation` 字段 |
| 5.6 | 文档 | `.forge/config.md` 的"开放区"补充 worktree 说明 |
| 6.1–6.3 | 代码审计 | dispatcher.sh 的 case 分支覆盖 6 个事件，exit code 符合源码语义 |
| 6.4 | 代码审计 | dispatcher 内部无 if-filter 逻辑，信任 settings.json 层 |
| 6.5 | 代码审计 | handler 函数明确 return，无 fall-through |
| 6.6 | diff 检查 | settings.json hooks 节每个 event 恰好一条 dispatcher 条目（除文档化例外） |
| 6.7 | contract test | dispatcher.sh 含所有 6 个 `handle_*` 函数 |
| 7.1 | 文件存在 | 3 个 rule 文件都创建 |
| 7.2 | 静态解析 | 每条 rule 的 paths 字段用 `yq` 解析为字符串或数组 |
| 7.3 | diff 审计 | 每条 rule 的正文与迁出来源的原文本匹配（至少 80% 行 overlap） |
| 7.4 | 行数测量 | CLAUDE.md 迁移后行数不增加 |
| 7.5–7.7 | 内容审计 | grep rule 文件包含预期的关键词（strict null checks, branch naming, allowed-tools） |
| 7.8 | contract test | rule 文件存在 + paths 合法 + CLAUDE.md 不重复对应段落 |
| 8.1 | 脚本 | `wc -l CLAUDE.md` 输出 >= Req 7 完成后记录到 runs |
| 8.2–8.3 | 条件执行 | 行数 ≤200 则跳过，否则进一步迁移 |
| 8.4 | 内容审计 | 任何被移出的段落能在新位置找到（grep 原始关键词） |
| 8.5 | 静态 | `@path` 引用都在 leaf text node（regex 检查不在代码块内） |
| 9.1 | 单元测试 | `check_cc_version` 函数对各种 `claude --version` 输入的行为 |
| 9.2 | 文档 | README 前置条件章节含版本声明 |
| 9.3 | CHANGELOG | entry 含版本说明 |
| 9.4 | 手动 | 在低于 2.1.138 但高于 2.1.121 的 CC 上运行 `/forge status`，观察 warning |
| 9.5–9.6 | 单元测试 | 降级/解析失败场景 |
| 10.1 | 自动 | test/phase2.contract.test.ts 断言清单 |
| 10.2–10.5 | 文档审阅 | CHANGELOG / README / ADR / handover note 齐全 |
| 10.6 | CI | npm run check + vitest 绿 |

---

## 七、设计决策（Decision Log）

本 spec 执行过程中的关键决策，供 ADR 起草参考。

### D1 — 为什么不把 PreCompact snapshot 写进 `.forge/status.md` 本身？

**选择**：独立文件 `.forge/.compact-snapshot.md`（git-ignored）

**理由**：
- `.forge/status.md` 是"受保护区"的开放子集，任何写入都会在 git diff 中出现
- compaction 是高频事件，每次都改 status.md 会产生大量无意义 diff
- 独立文件明确语义：这是**临时运行时状态**，不进 git

**权衡**：多一个文件路径需要 gitignore 管理。接受。

### D2 — 为什么不让 PreCompact 阻塞 compaction？

**选择**：Req 2.6 明确永不 `exit 2`

**理由**：
- compaction 阻塞 = 会话卡死（context 满又无法压缩）
- Forge 的 compaction 保护是"尽最大努力恢复 context"，不是"保证完整性"
- 如果真有需要阻塞 compaction 的场景（比如 in-flight critical operation），那是另一个 spec 的职责

### D3 — 为什么只对 `forge-build` 启用 `isolation: worktree`？

**选择**：仅 Req 5.1，其他 agent 不启用

**理由**：
- `forge-plan`：产出 plan 文件到 `.forge/plans/`，不需要隔离代码状态
- `forge-review`：只读，不写代码
- `forge-ship`：需要访问主 repo 的 git 状态（branch、tags、push remote），worktree 会让 `git push` 推到奇怪的地方

### D4 — 为什么 dispatcher 不再自己做 `if:` 过滤？

**选择**：Req 6.4 明确信任 settings.json 层的 `if:`

**理由**：
- 官方 `if:` 在 CC 进程内评估，比 dispatcher 内的 shell 判断快得多
- 双重 filter 会产生 "if 规则不一致" 的隐患
- dispatcher 的职责收窄为"按事件名路由 + 事件处理"，不做过滤

### D5 — 为什么 agent 的 `hooks:` frontmatter 需要保留全局 hooks.json？

**选择**：Req 3.3 / 3.6 允许某些 hook 留在全局

**理由**：
- 不是所有 hook 都能清晰归到单一 agent（例如 UserPromptSubmit 是全局的）
- 强行把所有 hook frontmatter 化会让 agent 文件臃肿
- "谁拥有行为，谁定义 hook" 的原则足够，不需要一刀切

### D6 — 为什么 `branch-protection.md` 的 paths 是广义匹配？

**选择**：Req 7.1 给出 `paths: ["**/*.ts", "**/*.md"]`

**理由**：
- 分支保护规则本来就应该对 "大多数编辑" 生效
- "只在特定路径生效的 branch-protection" 概念本身就是错误的
- 这是规则设计的有意选择，不是 paths 机制的滥用
- Task 7.8 的 contract test 阻止进一步放宽到 `**/*`

---

## 八、与后续 Spec 的接口

本 spec 结束后，还有哪些已知留白，分别指向哪个后续 spec？

| 留白 | 后续 spec |
|---|---|
| 更多 agent 升级（forge-decide、forge-spec 等） | 独立新 spec，视使用情况决定 |
| `.forge/features/` 规则迁到 `.claude/rules/` | 独立的"rules 全量迁移"spec |
| PostToolUse `updatedToolOutput` 重构 frozen-zone | `frozen-zone-structured-feedback`（已起草） |
| Agent Teams PoC | `forge-decide-agent-teams`（已起草） |
| Plugin 化分发 | `plugin-distribution`（已起草） |
| ultrareview CI 集成 | `ultrareview-ci-integration`（已起草） |
| 归档流程纳入 `claude project purge` | `archive-transcript-purge`（已起草） |
| `/forge resume --from-pr` | `forge-resume-from-pr`（已起草） |

Phase 2 是"收尾 + 低风险新能力"的组合，它**不承担**探索性工作（如 agent teams、plugin），也**不承担**大幅行为改写（如 frozen-zone 重构）。这些都是独立 spec 的职责。
