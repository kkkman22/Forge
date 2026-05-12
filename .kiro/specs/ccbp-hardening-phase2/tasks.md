# Implementation Plan

## Overview

按 design.md "剧本 A → H" 的顺序推进，但把基础设施任务前置。Task 0 做前置检查（Phase 1 必须完成），Task 1–3 是可独立并行的小组（`if:` 迁移、compaction 保护、agent frontmatter 补字段），Task 4 是 dispatcher 剩余事件收口，Task 5 是 rules 迁移，Task 6 是 CLAUDE.md 二轮瘦身（条件执行），Task 7 是 CC 版本门禁，Task 8 是 contract test 与文档收尾，Task 9 烟雾验证。每个子任务挂 `_Requirements: X.Y_`。

所有改动在 Phase 1 contract test + 本 spec 新增 contract test 双重保护下进行。

---

## Task 0: 前置检查（阻断性）

- [x] 0.1 验证 `ccbp-inspired-hardening` 所有 Task 1–13 已完成
  - 检查 `.claude/agents/forge-{plan,build,review,ship}.md` 存在
  - 检查 `.claude/rules/spec-editing.md` 存在
  - 检查 `.claude/hooks/scripts/dispatcher.sh` 存在且可执行
  - 检查 `.claude/agent-memory/<agent>/MEMORY.md` 4 个目录齐全
  - 若任一缺失，停止本 spec 执行
  - _Requirements: Phase 2 introduction_

- [x] 0.2 运行 Phase 1 的 contract test 确保绿
  - `npx vitest run` 全量通过
  - `npm run check` 通过
  - 记录当前 `hooks/hooks.json` 的 MD5 作为基线（方便后续 diff 对比）
  - _Requirements: 10.6_

- [x] 0.3 记录起点数据到 `.forge/runs/<date>-phase2-baseline.md`
  - `wc -l CLAUDE.md`
  - `grep -c 'if \[' hooks/hooks.json` 当前内联 if 数量
  - `claude --version` 运行环境版本
  - `.forge/status.md` 当前内容快照
  - _Requirements: 8.1, 10.5_

---

## Task 1: Hooks `if:` 条件过滤迁移（剧本 A）

- [x] 1.1 创建测量工具 `scripts/bash-spawn-counter.sh`
  - 一次性脚本：对指定 PID 的子进程用 `pgrep -P` 采样
  - 参数：`<duration-seconds> <output-file>`
  - 输出：每次采样的时间戳 + bash spawn count
  - 注释说明用法："挂在 /forge build 跑完的 10 分钟期间，结果落到 .forge/runs/"
  - _Requirements: 1.4_

- [x] 1.2 执行基线测量：Phase 2 改动前
  - 运行 `/forge build` 典型流程 10 分钟
  - 并行执行 `bash scripts/bash-spawn-counter.sh 600 .forge/runs/<date>-if-migration-before.txt`
  - 手工统计总 spawn 次数
  - _Requirements: 1.4_

- [x] 1.3 审计当前 `hooks/hooks.json` 的内联 if 模式
  - 创建 `.forge/docs/living/hooks-if-migration.md`
  - 每条带内联 `if [ -f ... ]` / `if [ -d ... ]` 的 hook 列出：
    - 当前 command（原文）
    - 推导出的 `if:` 字段值（如 `"Bash(git *)"` / `"Write(.forge/**)"`）
    - 迁移后的 command（去除内联判断后的版本）
    - 是否可完全迁移（某些判断超出 permission-rule 语法的只能保留）
  - _Requirements: 1.1_

- [x] 1.4 迁移可迁移的 hook 到 `if:` 字段
  - 按 1.3 审计表逐条修改 `hooks/hooks.json`
  - 每条修改保留对应的"原注释/说明"，方便回滚时参考
  - **不合并**多个 `if:` 条件（保持单条 hook 单条件，便于排错）
  - _Requirements: 1.2_

- [x] 1.5 保留不能迁移的内联判断但优化
  - 对 1.3 标注"不可迁移"的条目（如 `if [ -f .forge/.sandbox-active.json ]`），把 command 内的判断换成最快的 `[ -f ... ]`
  - 禁止在这些判断中使用 `jq` / `find` 等慢命令
  - _Requirements: 1.3_

- [x] 1.6 dispatcher 层面的协同
  - 检查 `scripts/dispatcher.sh` 内部是否有 if 判断与 settings.json `if:` 重叠
  - 若有重叠，在 dispatcher 端删除（信任 settings 层）
  - 更新 `.claude/hooks/HOOKS-README.md`：新增 "if-filter 使用手册" 章节
    - 语法示例：`Bash(git *)` / `Write(.forge/**)` / `Edit(src/**)`
    - 何时该用 `if:`、何时该留在 command 里
    - 迁移完成状态表（哪些 hook 用了 `if:`）
  - _Requirements: 1.6_

- [x] 1.7 执行基线测量：Phase 2 改动后
  - 在同样的 `/forge build` 流程上运行 10 分钟
  - `bash scripts/bash-spawn-counter.sh 600 .forge/runs/<date>-if-migration-after.txt`
  - 计算 delta，写入 `.forge/runs/<date>-if-migration-baseline.md`（before + after + delta + 百分比）
  - 目标：减少 ≥20% spawn；未达标时记录原因（不阻断本任务完成）
  - _Requirements: 1.4_

- [x] 1.8 新增集成测试 `test/hooks-if-filter.integration.test.ts`
  - 模拟 stdin 喂入 `PreToolUse(Write src/foo.ts)` 事件
  - 断言 dispatcher **未被调用**（if 过滤生效）
  - 喂入 `PreToolUse(Write .forge/plans/foo.md)` 事件
  - 断言 dispatcher **被调用**
  - _Requirements: 1.5_

- [x] 1.9 Checkpoint：`npx vitest run`；`git diff hooks/hooks.json` 与审计表一致
  - _Requirements: 1.5, 10.6_

---

## Task 2: PreCompact / PostCompact 边界状态保护（剧本 B）

- [x] 2.1 创建 `scripts/hook-precompact.sh`
  - 脚本开头：`set -u; trap 'exit 0' ERR`（任何错误都 exit 0）
  - 读 stdin JSON，检查是否 PreCompact 事件
  - 用 `yq` 或 `awk` 从 `.forge/status.md` frontmatter 提取 `slug` / `phase` / `pr_number`
  - 读 `.forge/progress/<slug>.md` 最后 3 行
  - 构造 `.forge/.compact-snapshot.md`（Markdown 格式，人类可读）
  - 写入失败 → warning 到 `.forge/runs/<date>-compact-events.jsonl` → exit 0
  - **永不 exit 2**
  - chmod +x
  - _Requirements: 2.1, 2.3, 2.6_

- [x] 2.2 创建 `scripts/hook-postcompact.sh`
  - 脚本开头同 2.1 的防御
  - 读 `.forge/.compact-snapshot.md`，文件不存在则 exit 0 静默
  - 文件存在：
    - 把内容 `cat` 到 stdout（CC 会把 PostCompact 的 stdout 当作 compact 指令注入）
    - 删除文件（即使 cat 失败也要删，用 trap）
  - 写一行 JSONL 事件到 `.forge/runs/<date>-compact-events.jsonl`
  - chmod +x
  - _Requirements: 2.2, 2.4, 2.7_

- [x] 2.3 单元测试 `test/compact-hooks.test.sh`
  - 测试 2.1：mock `.forge/status.md` 有效 → snapshot 被正确写入
  - 测试 2.1：mock `.forge/status.md` 缺失 → 无 snapshot、exit 0、warning 写入
  - 测试 2.1：mock 脚本内部出错（故意插入 bad command）→ exit 0（trap 生效）
  - 测试 2.2：mock snapshot 存在 → stdout 正确、文件被删
  - 测试 2.2：mock snapshot 不存在 → exit 0 静默、无 stdout
  - _Requirements: 2.1–2.4, 2.6_

- [x] 2.4 注册 hook 到 `.claude/settings.json`
  - 新增 PreCompact / PostCompact 条目，分别指向 2.1 / 2.2 脚本
  - timeout: 5s
  - 不加 `if:` 字段（这两个事件是全局的，不按路径过滤）
  - _Requirements: 2.1, 2.2_

- [x] 2.5 更新 `.gitignore`
  - 新增一行 `.forge/.compact-snapshot.md`
  - 验证 `git check-ignore .forge/.compact-snapshot.md` 返回路径
  - _Requirements: 2.5_

- [x] 2.6 手动 e2e 验证
  - 运行一个接近 context limit 的 `/forge build` 会话
  - 触发 compaction（或 `/compact` 手动触发）
  - 观察：compaction 后对话里出现 snapshot 内容
  - 观察：`.forge/.compact-snapshot.md` 被删除
  - 观察：`.forge/runs/<date>-compact-events.jsonl` 有两条事件（write + restore）
  - _Requirements: 2.1, 2.2, 2.7_

- [x] 2.7 Checkpoint
  - 确认两个脚本可执行权限正确
  - `npx vitest run test/compact-hooks.test.sh` 或等价 shell test 绿
  - _Requirements: 10.6_

---

## Task 3: Agent frontmatter 扩展（剧本 C / D / E）

> 本 Task 对三个 agent 定义文件做 frontmatter 字段追加。按 Phase 1 的字段顺序规则（alphabetical 或 logical grouping）插入新字段，不破坏现有结构。

- [x] 3.1 在 `.claude/agents/forge-build.md` 新增 `hooks:` + `isolation:`
  - `isolation: worktree` （单行）
  - `hooks:`
    ```yaml
    hooks:
      Stop:
        - type: command
          command: |
            bash -c '
              ci_cmd=$(yq ".ci_check_command // \"npm run check\"" .forge/config.md 2>/dev/null)
              $ci_cmd > /tmp/forge-build-ci.log 2>&1 || {
                echo "{\"continue\": false, \"stopReason\": \"CI 失败，请 tail /tmp/forge-build-ci.log 后修复\"}"
                exit 0
              }
              exit 0
            '
          timeout: 120
    ```
  - frontmatter body 不动
  - _Requirements: 3.1, 5.1_

- [x] 3.2 在 `.claude/agents/forge-ship.md` 新增 `hooks:`
  - `hooks:`
    ```yaml
    hooks:
      PreToolUse:
        - matcher: "Bash"
          if: "Bash(git push*)"
          type: command
          command: |
            bash -c '
              branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
              if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
                echo "❌ 禁止直接向 $branch 推送" >&2
                exit 2
              fi
              exit 0
            '
          timeout: 5
    ```
  - frontmatter body 不动
  - _Requirements: 3.2_

- [x] 3.3 在 `.claude/agents/forge-plan.md` 新增 `initialPrompt:`
  - ```yaml
    initialPrompt: |
      If a spec slug was provided by the caller (e.g. via prompt arg), read `.forge/specs/<slug>/spec.md` now.
      Summarize the understood scope as ≤5 bullet points.
      Use AskUserQuestion to clarify any ambiguity before drafting the plan.
      If no slug was provided, ask the user which spec they want to plan.
    ```
  - 长度控制在 500 char 以内
  - _Requirements: 4.1, 4.3_

- [x] 3.4 更新 `.claude/commands/forge.md` 的 plan 分支
  - 原 router 给 plan agent 传的"kickoff prompt"整段删除
  - 只传 slug 作为 prompt（或者完全不传，让 initialPrompt 自己问）
  - 其他子命令分支不动
  - _Requirements: 4.2_

- [x] 3.5 评估 `forge-review` / `forge-ship` 是否采纳 `initialPrompt`
  - forge-review：评估它的 kickoff 是否足够通用（可能需要根据是否有 PR 号给不同 prompt）→ 本 Task 决定**不采纳**，保持现状
  - forge-ship：评估同上 → 本 Task 决定**不采纳**
  - 在 `.forge/decisions/<date>-ccbp-hardening-phase2.md` ADR 里记录决策
  - _Requirements: 4.5_

- [x] 3.6 冲突审计：agent 级 hook vs 全局 hooks.json
  - 新建 `scripts/audit-hook-conflicts.mjs`：遍历所有 agent 文件的 `hooks:` 字段，对比全局 `hooks/hooks.json`，检测同 event+matcher 的重复
  - 本任务对 forge-build.Stop 和 forge-ship.PreToolUse 跑一遍
  - forge-build.Stop：若全局也有 Stop 跑 CI 的条目，全局加 `if:` 排除或删除
  - forge-ship.PreToolUse(Bash git push)：若全局也有，同样处理
  - _Requirements: 3.3_

- [x] 3.7 审计现有 `scripts/` 的 worktree 自建逻辑（forge-build isolation 的副作用）
  - grep `scripts/` 下所有 `.sh` / `.mjs` 出现 `git worktree` 的地方
  - 对每处判断：是否会与 forge-build agent 的自动 worktree 打架？
  - 对有冲突的逻辑：在脚本顶部加注释 "Deprecated by forge-build agent frontmatter isolation: worktree" + 加 feature flag 默认关闭
  - 对无冲突的逻辑（比如用户手动 /forge 某个子命令启动的 worktree）：保留
  - _Requirements: 5.2, 5.3_

- [x] 3.8 `.forge/config.md` 文档化新的 worktree 行为
  - 在"开放区（Open）— AI 可自由修改"章节后追加一段："forge-build agent 默认在独立 git worktree 中运行（由 Claude Code `isolation: worktree` 提供），代码改动在 worktree 内，`.forge/` 状态仍写入主 repo。"
  - 加一句提醒：若同时运行 dev server，注意热重载可能不会看到 worktree 里的改动
  - _Requirements: 5.6_

- [x] 3.9 `.forge/` 目录位置测试
  - 手动跑一次 `/forge build`（需要一个现成的 spec）
  - 观察：worktree 自动创建在 `.claude-worktrees/forge-build-<sid>/`
  - 观察：`.forge/progress/<slug>.md` 写入到**主 repo** 而不是 worktree
  - 若测试失败（`.forge/` 被写到 worktree 里），说明 Forge 脚本里有相对路径问题，本任务加修正
  - _Requirements: 5.4_

- [x] 3.10 Checkpoint
  - 三个 agent 文件的 frontmatter 可被 yq 解析
  - 冲突审计脚本产出无红色警告
  - _Requirements: 10.6_

---

## Task 4: Hooks Dispatcher 剩余事件迁移（剧本 F）

- [x] 4.1 扩展 `scripts/dispatcher.sh` 结构
  - 在顶部定义 6 个 handler 函数占位：
    ```bash
    handle_session_start()     { ... }  # 已有，从 Phase 1 保留
    handle_user_prompt_submit() { ... } # 已有
    handle_pretool()           { ... }  # 新增
    handle_posttool()          { ... }  # 新增
    handle_stop()              { ... }  # 新增
    handle_teammate_idle()     { ... }  # 新增
    ```
  - case 分支用**精确匹配**（不要模式匹配）
  - 每个函数显式 `return <code>`（不 fall through）
  - _Requirements: 6.1, 6.5_

- [x] 4.2 把 PreToolUse 当前内联逻辑迁入 `handle_pretool()`
  - 保持逻辑一致：
    - 调用 `scripts/hook-check-frozen.sh`（若存在）
    - 调用 `scripts/check-sandbox.js`（若存在）
    - 调用 `scripts/check-context-boundary.mjs`（若存在）
  - exit code 语义（对齐 CC 源码）：
    - 任一子脚本 return 2 → handle_pretool return 2（deny + stderr）
    - 任一子脚本 return 其他非 0 → handle_pretool return 该 code
    - 全部 0 → handle_pretool return 0
  - _Requirements: 6.2_

- [x] 4.3 把 PostToolUse 迁入 `handle_posttool()`
  - 保持现状的三项行为：
    - 提示"请记得更新 .forge/progress/"（若 `.forge/status` 存在）
    - cmux sync-once
    - rebuild-feature-dossier
  - return 0 即可（PostToolUse 不影响工具执行）
  - _Requirements: 6.1_

- [x] 4.4 把 Stop 迁入 `handle_stop()`
  - 保持现状的五项行为：
    - progress 未完成提示 / 建议 learn
    - persistent-loop
    - pending 规则提醒
    - record-evolved-rule-violation
    - flag-stale-evolved-rules
    - cmux sync-once
  - exit code 语义：
    - 若要阻止 session 结束（目前 Forge 场景不需要）→ return 2
    - 一般情况 → return 0
  - _Requirements: 6.3_

- [x] 4.5 把 TeammateIdle 迁入 `handle_teammate_idle()`
  - 保持现状的一项行为：根据 phase 判断 teammate 是否应该继续工作的提示
  - return 0
  - _Requirements: 6.1_

- [x] 4.6 更新 `.claude/settings.json`
  - PreToolUse / PostToolUse / Stop / TeammateIdle 各自合并为一条 dispatcher 调用
  - PreToolUse 和 PostToolUse 条目的 `if:` 字段从 Task 1 迁移结果继承（如 `"Write(.forge/**)|Edit(.forge/**)|Bash(git *)"` 的组合）
  - 保留 hooks.json 中对 `$TOOL_INPUT_FILE` / `$TOOL_NAME` 的访问语义（dispatcher 从 stdin JSON 自己解析）
  - _Requirements: 6.6_

- [x] 4.7 `.claude/hooks/HOOKS-README.md` 补充
  - 新增"事件迁移完成状态表"：列出 6 个事件都已走 dispatcher
  - 补充每个 handler 函数的职责和 exit code 语义
  - _Requirements: 6.1, 6.7_

- [x] 4.8 新增 contract test 子项
  - 断言 dispatcher.sh 存在 `handle_session_start`、`handle_user_prompt_submit`、`handle_pretool`、`handle_posttool`、`handle_stop`、`handle_teammate_idle` 六个函数（grep `^handle_.*()` ）
  - _Requirements: 6.7_

- [x] 4.9 手动 e2e 验证
  - 启动一个新 session → 验证 SessionStart handler 正常输出上下文
  - 提交 prompt → 验证 UserPromptSubmit handler 注入 plan/progress
  - 尝试写入 frozen 区（如 `.forge/specs/foo/spec.md`）→ 验证 PreToolUse handler 阻断
  - 成功写入 `.forge/progress/foo.md` → 验证 PostToolUse handler 输出提示
  - 结束 session → 验证 Stop handler 输出未完成提示
  - _Requirements: 6.1–6.3_

- [x] 4.10 Checkpoint
  - `bash -n scripts/dispatcher.sh` 语法检查通过
  - e2e 全部通过
  - _Requirements: 10.6_

---

## Task 5: `.claude/rules/` 完整迁移（剧本 G）

- [x] 5.1 创建 `.claude/rules/forge-src.md`
  - frontmatter：
    ```yaml
    ---
    paths:
      - "forge/src/**"
      - "src/**"
    ---
    ```
  - body：从 CLAUDE.md 提取 TypeScript/JS 相关约定
    - strict null checks
    - `.forge/config.md` 的 config 读取模式
    - import 顺序（std → 3rd party → relative）
    - 测试同目录（`<name>.test.ts`）
  - 提取方式：**原文搬运**，不改字句
  - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [x] 5.2 创建 `.claude/rules/skill-editing.md`
  - frontmatter：
    ```yaml
    ---
    paths:
      - ".claude/skills/**/SKILL.md"
      - "skills/**/SKILL.md"
    ---
    ```
  - body：从现有 SKILL.md / CLAUDE.md 提取
    - 必填 frontmatter：`name`、`description`
    - 字段名是 `allowed-tools`（连字符），不是 `allowedTools`
    - SKILL.md ≤150 行约定
    - 渐进披露拆分规则
  - _Requirements: 7.1, 7.2, 7.3, 7.6_

- [x] 5.3 创建 `.claude/rules/branch-protection.md`
  - frontmatter：
    ```yaml
    ---
    paths:
      - "**/*.ts"
      - "**/*.md"
    ---
    ```
  - body：从 CLAUDE.md 提取
    - 禁止直接 commit 到 main / master
    - 分支命名：`forge/<slug>` 或 `feature/<slug>`
    - push 走 `/forge ship`
    - 每文件一次 commit（引用 CLAUDE.md Git Commit Rules）
  - _Requirements: 7.1, 7.2, 7.3, 7.7_

- [x] 5.4 CLAUDE.md 清理对应段落
  - 对 5.1–5.3 迁出的内容：
    - 若段落完全被 rule 覆盖 → 从 CLAUDE.md 删除（不加 `@path`，因为 paths 自动匹配就会加载）
    - 若段落部分被覆盖 → 保留全局相关部分，删除路径专属部分
  - CLAUDE.md 顶部可选加一段注释："更多路径专属规则见 `.claude/rules/`（自动按 paths 匹配加载）"
  - _Requirements: 7.4_

- [x] 5.5 contract test 断言
  - 3 个 rule 文件存在
  - 每个 rule 的 YAML frontmatter 有 `paths:` 字段，类型为 list 或 string
  - paths 值不为 `"**"` 或 `"**/*"`（防止意外全局化）
  - 每个 rule body 非空（≥5 行）
  - _Requirements: 7.8_

- [x] 5.6 Checkpoint
  - 手动编辑 `src/foo.ts`，通过 `InstructionsLoaded` hook（若已启用）或 debug 日志观察 `forge-src.md` + `branch-protection.md` 被加载
  - 手动编辑 README.md，观察 `branch-protection.md` 加载，`forge-src.md` 不加载
  - _Requirements: 10.6_

---

## Task 6: CLAUDE.md 第二轮瘦身（条件执行）

- [x] 6.1 测量当前行数
  - `wc -l CLAUDE.md > .forge/runs/<date>-claude-md-baseline.md`
  - 记录数字到 baseline
  - _Requirements: 8.1_

- [x] 6.2 判断是否需要进一步瘦身
  - 若 ≤200：跳过 Task 6.3–6.5，直接进 6.6
  - 若 >200：进入 6.3
  - _Requirements: 8.3_

- [x] 6.3 （条件执行）识别额外的"可迁出"段落
  - 在 baseline 文件里列出超出部分的行号和主题
  - 对每个主题判断：
    - 路径专属 → 新增 rule 文件到 `.claude/rules/`
    - 长文档 → 迁到 `.forge/docs/living/<topic>.md`
    - 全局核心 → 保留（不该被进一步瘦身）
  - _Requirements: 8.2_

- [x] 6.4 （条件执行）执行迁移
  - 按 6.3 决定迁到目标位置
  - CLAUDE.md 中被迁出的段落：
    - 改为 `@.claude/rules/...` 或 `@.forge/docs/living/...` 引用（leaf text node，不在代码块）
    - 或直接删除（如果 paths 已经能覆盖）
  - _Requirements: 8.2, 8.4, 8.5_

- [x] 6.5 （条件执行）复核行数
  - 重新 `wc -l CLAUDE.md` 确认 ≤200
  - 更新 baseline 记录
  - _Requirements: 8.2_

- [x] 6.6 @path 引用合法性检查
  - 写一个小脚本扫描 CLAUDE.md：
    - 所有 `@` 开头的路径引用不在 \`\`\` 代码块内
    - 所有引用的目标文件存在
  - 集成到 contract test
  - _Requirements: 8.5_

- [x] 6.7 Checkpoint
  - `wc -l CLAUDE.md` ≤200
  - 所有 `@path` 引用有效
  - _Requirements: 8.1, 8.4, 8.5_

---

## Task 7: CC 最低版本门禁（剧本 H）

- [x] 7.1 在 `scripts/init.sh` 顶部加 `check_cc_version()` 函数
  - 解析 `claude --version` 输出
  - 用 `sort -V` 比较当前版本与最低版本 `2.1.121`
  - `LC_ALL=C` 固定 locale 避免 sort 行为差异
  - 无法解析时 warn but allow
  - 低于最低版本时：清楚的错误消息 + 升级链接 + exit 1
  - 推荐版本 `2.1.138`：仅 warn
  - _Requirements: 9.1, 9.5, 9.6_

- [x] 7.2 单元测试 `test/check-cc-version.test.sh`
  - 输入 `""`（claude 不可用）→ warn but allow
  - 输入 `"2.1.120"` → error + exit 1
  - 输入 `"2.1.121"` → allow
  - 输入 `"2.1.138"` → allow 无 warning
  - 输入 `"2.1.200"` → allow 无 warning
  - 输入 `"2.1.121-beta.1"` → allow
  - 输入 `"claude 2.1.121 (darwin)"` → allow（正则抽取版本号）
  - 输入 `"garbage"` → warn but allow
  - _Requirements: 9.6_

- [x] 7.3 在 `skills/forge-status/SKILL.md` 加版本检查
  - status skill 运行时调用 check_cc_version（或重用其函数）
  - 低于推荐版本时输出 warning 但不阻断
  - _Requirements: 9.4_

- [x] 7.4 `README.md` 更新"前置条件"章节
  - 明确 `Claude Code 最低版本：2.1.121`
  - 明确 `推荐版本：≥2.1.138`
  - 链接到 Claude Code 安装文档
  - _Requirements: 9.2_

- [x] 7.5 `CHANGELOG.md` 记录版本要求
  - 在 Phase 2 条目里明确：`[CHANGED]` CC 最低版本提升到 2.1.121
  - 列出需要 2.1.121+ 的特性
  - _Requirements: 9.3_

- [x] 7.6 Checkpoint
  - init.sh 在低版本 mock 环境下正确报错
  - init.sh 在当前环境下通过
  - _Requirements: 10.6_

---

## Task 8: Contract Test 与文档收尾

- [x] 8.1 新建 `test/phase2.contract.test.ts`
  - 断言 `hooks/hooks.json` 含至少 N 条 `if:` 字段（N 从 Task 1.3 审计表得出）
  - 断言 `scripts/hook-precompact.sh` + `scripts/hook-postcompact.sh` 存在且可执行（`fs.accessSync(path, X_OK)`）
  - 断言 `.claude/agents/forge-build.md` frontmatter 含 `hooks:` 和 `isolation: "worktree"`
  - 断言 `.claude/agents/forge-ship.md` frontmatter 含 `hooks:`
  - 断言 `.claude/agents/forge-plan.md` frontmatter 含 `initialPrompt`（长度 50–500）
  - 断言 3 个 rule 文件存在、paths 合法、body 非空
  - 断言 dispatcher.sh 含 6 个 `handle_*` 函数
  - 断言 `.gitignore` 含 `.forge/.compact-snapshot.md`
  - _Requirements: 10.1_

- [x] 8.2 `CHANGELOG.md` 新增 Phase 2 条目
  - `[CHANGED]` hooks `if:` 迁移
  - `[ADDED]` PreCompact/PostCompact 保护
  - `[CHANGED]` agent frontmatter 增强（hooks / initialPrompt）
  - `[ADDED]` forge-build worktree 隔离
  - `[ADDED]` 3 条新懒加载规则
  - `[CHANGED]` CC 最低版本 2.1.121
  - `[CHANGED]` dispatcher 收口 6 类事件
  - _Requirements: 10.2_

- [x] 8.3 `README.md` 三处更新
  - "前置条件" — 7.4 已做
  - "Claude Code 集成" — 说明 agent frontmatter 改进（hooks / initialPrompt / isolation）
  - "安全与信任" — 提到 compaction 边界保护
  - _Requirements: 10.3_

- [x] 8.4 创建 ADR `.forge/decisions/<date>-ccbp-hardening-phase2.md`
  - Context：Phase 1 完成后的留白 + 6 个月内 CC 新能力
  - Decision：本 spec 采纳的 9 条 requirement
  - Alternatives：为什么不做更多（延后到独立 spec 的清单）
  - Consequences：CC 版本锁定、worktree 学习成本等
  - Rollback plan：每条 Req 的独立回滚路径（引用 design §4 风险地图）
  - _Requirements: 10.4_

- [x] 8.5 Phase 1 → Phase 2 交接 note
  - 在 `.kiro/specs/ccbp-inspired-hardening/` 目录添加一个 `HANDOVER-TO-PHASE2.md`（简短）
  - 列出 Phase 1 哪些 Req/Task 被 Phase 2 承接
  - 列出 Phase 2 完成了哪些、哪些仍然 open（若有延后）
  - _Requirements: 10.5_

- [x] 8.6 运行全量测试
  - `npx vitest run`
  - `npm run check`
  - 修复任何失败
  - _Requirements: 10.6_

---

## Task 9: 端到端烟雾测试与清理

- [x] 9.1 端到端测试场景 A：典型 build 流程
  - 新建一个 test spec（或复用现有）
  - 运行 `/forge plan my-test-spec` → 验证 initialPrompt 生效
  - 运行 `/forge build my-test-spec` → 验证 worktree 自动创建 / 清理
  - 观察 build 完成时 Stop hook 跑 CI
  - _Requirements: 4.2, 5.2_

- [x] 9.2 端到端测试场景 B：compaction 保护
  - 在 9.1 的会话基础上，继续聊天直到 context 接近上限
  - 触发 compaction
  - 观察 snapshot 内容被注入到后续 context
  - 问 Claude："你当前在做什么？" → 验证回答清晰
  - _Requirements: 2.1, 2.2_

- [x] 9.3 端到端测试场景 C：分支保护
  - 在 main branch 上运行 `/forge ship` → 验证 PreToolUse hook 拦截 git push
  - 切到 `feature/test` branch → 验证 push 通过
  - _Requirements: 3.2_

- [x] 9.4 端到端测试场景 D：懒加载规则
  - 编辑 `src/foo.ts`：验证 `forge-src.md` 加载
  - 编辑 README.md：验证 `branch-protection.md` 加载，`forge-src.md` 不加载
  - _Requirements: 7.1_

- [x] 9.5 端到端测试场景 E：Hook 冷启动改善
  - 重新跑一次 Task 1.7 的基线对比
  - 确认 spawn count 的 delta 稳定
  - _Requirements: 1.4_

- [x] 9.6 清理临时文件
  - 删除烟雾测试创建的 test spec
  - 确认 `.forge/runs/` 里的 baseline 文件按 `findings_retention_days` 可回收
  - _Requirements: 10.6_

- [x] 9.7 最终 Checkpoint
  - `npx vitest run` + `npm run check` + `npm run build` 全绿
  - `git status` 干净
  - ADR 已 commit
  - CHANGELOG Phase 2 条目已 commit
  - _Requirements: 10.6_

---

## Task 执行顺序建议

```
Task 0 (前置检查 + baseline 测量)          ← 必须最先
  ↓
Task 1 (if: 迁移)                          ← 独立，可并行
Task 2 (compaction 保护)                    ← 独立，可并行
Task 3 (agent frontmatter)                  ← 独立，可并行
  ↓
Task 4 (dispatcher 剩余事件)               ← 依赖 Task 1 的 if: 迁移结果
Task 5 (rules 迁移)                         ← 独立，可与 4 并行
  ↓
Task 6 (CLAUDE.md 二轮瘦身，条件)          ← 依赖 Task 5（rule 迁移可能降低行数）
Task 7 (CC 版本门禁)                        ← 独立，可与 6 并行
  ↓
Task 8 (contract test + 文档)              ← 依赖 Task 1–7 全部完成
  ↓
Task 9 (e2e 烟雾测试)                       ← 最后
```

**关键风险点**：
- Task 3.7 审计 `scripts/` 的 worktree 自建逻辑可能发现比预期更多冲突，需要独立 cycle 处理
- Task 6 是否执行取决于 Task 5 之后的 CLAUDE.md 行数，可能跳过
- Task 9.2 的 compaction 场景难以自动化，必须手动验证
