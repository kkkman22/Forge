---
audit: "Runtime Hook Audit — Subtraction Pass"
date: "2026-08-11"
basis: "ADR-0009 (Subtraction Strategy — Converge to External Brake + Organizational Memory)"
scope: "Runtime hooks that intercept the Agent lifecycle (PreToolUse / PostToolUse / SessionStart / Stop / SubagentStop / TaskCreated / compact / file-watch). CI/build 校验脚本（check-*/validate-*/lint-*）归第五刀，不在本次。"
verdict_legend:
  keep: "🟢 留 — 满足外部性（刹车/安全/风险/品味）"
  cut: "🔴 砍 — 可被模型吸收 / 纯 babysit / 运维非方法论"
  degrade: "🟡 退化 — 保留内容，砍复杂机制"
  dead: "⚫ 死代码 — 依赖已废弃路径"
---

# Runtime Hook Audit — Subtraction Pass

> 依据 **ADR-0009 Existence Test**：一个机制必须落在「纪律强制力 / 品味与范围偏好 / 风险判断 / 组织记忆」四类之一才保留；否则砍或退化。
> 图证：参考框架明列「会被吸收」6 项（主动提问 / 自动计划 / 任务拆解 / 生成重构 / 自动测试 / 基础验证）——Forge 正在用 hook 强做其中 4 项。

## 汇总

| 判定 | 数量 | 占比 | 说明 |
|------|------|------|------|
| 🟢 留 | 14 | 45% | 外部刹车 / 安全 / 冻结保护 / 基础设施 |
| 🔴 砍 | 12 | 39% | 可吸收 / babysit / 运维 |
| 🟡 退化 | 4 | 13% | 留内容砍机制 |
| ⚫ 死代码 | 1 | 3% | Agent Teams 残留 |
| **合计** | **31** | | 砍+退化 = **52%** |

**结论**：印证 ADR-0009 判断——runtime hook 过半可砍或退化。砍除后 Forge 的 runtime 拦截面从 31 收缩到 ~14（真正的外部刹车 + 安全 + 基础设施）。

---

## A. Stop hooks（会话结束拦截，5）

| Hook | 职责 | Existence 归类 | 判定 | 动作 / 理由 |
|------|------|----------------|------|-------------|
| `stop-phase-verify.mjs` | 验证 active phase 命令真跑过 + 桌面通知 | 纪律强制力（刹车） | 🟢 留 | ADR-0009 §保留#1 明确保留。反借口表核心。 |
| `stop-incomplete-tasks.mjs` | completion gate，检查 progress 未完成任务 | 可吸收（babysit） | 🔴 砍 | 模型变强会自检完整；防偷懒=图证「会被吸收」。退化为非阻断提示可选。 |
| `stop-pending-rules.mjs` | 检查 evolved-rules 的 PENDING 条目 | 组织记忆（弱） | 🟡 退化 | 规则内容留 evolved-rules.md；「拦截会话结束」机制砍——内容与机制分离。 |
| `stop-additional-context.mjs` | Stop/SubagentStop additionalContext 反馈 | 可吸收 | 🔴 砍 | 模型自己管 context；上下文窗口够大。 |
| `stop-failure-hook.mjs` | 记录 API 错误（rate limit / auth） | 运维（非方法论） | 🔴 砍 | 移交运行时 / tool-health 已有独立记录。 |

## B. Inject hooks（注入，2）

| Hook | 职责 | Existence 归类 | 判定 | 动作 / 理由 |
|------|------|----------------|------|-------------|
| `inject-evolved-rules.mjs` | SessionStart 注入 evolved-rules + spec-title（4KB 限制逻辑） | 组织记忆 | 🟡 退化 | **内容留**（evolved-rules 是 ADR-0009 §保留#4）；**机制简化**——4KB byte-limit / spec-title 提取等复杂逻辑砍，退化为「SessionStart 直接读文件头」。 |
| `inject-plan-context.mjs` | 注入 plan context 到 Claude Code hooks | 可吸收 | 🔴 砍 | plan mode 已是原生；上下文窗口够大无需落盘再注入。图证「自动计划」靶心。 |

## C. Lifecycle / dispatcher hooks（15）

| Hook | 职责 | Existence 归类 | 判定 | 动作 / 理由 |
|------|------|----------------|------|-------------|
| `hook-check-frozen.sh` | 冻结区保护 wrapper | 风险判断（刹车） | 🟢 留 | 防改 frozen / main 分支——外部刹车，模型不会自我设限。 |
| `hook-check-frozen-post.sh` | PostToolUse 冻结 defense-in-depth | 风险判断 | 🟢 留 | 同上，纵深防御。 |
| `hook-check-frozen-structured.sh` | 冻结结构化反馈 | 风险判断 | 🟢 留 | 同上。 |
| `hook-notify.sh` | 冻结拦截通知（cmux + log） | 风险判断（辅助） | 🟢 留 | 配合 frozen，轻量。 |
| `forge-prompt-guard.js` | PreToolUse Write/Edit .forge/ 保护（fail-open） | 风险判断（刹车） | 🟢 留 | 保护 .forge 状态文件——外部刹车。 |
| `forge-read-injection-scanner.js` | PostToolUse Read 扫描注入 / 压缩存活模式 | 风险判断（安全） | 🟢 留 | 真 prompt-injection 防御，模型权重里没有。 |
| `forge-hook-dispatch.mjs` | hook 总分发入口 | 基础设施 | 🟢 留 | 其余 hook 的入口契约，砍它则全断。 |
| `forge-sync-runtime.mjs` | 修复 hook shim | 基础设施 | 🟢 留 | 运行时自愈。 |
| `forge-phase-worker.mjs` | CLI/SDK phase worker 入口 | 基础设施（待评） | 🟢 留 | 保留，但 phase 概念是三级路由残留——**随 ADR-0009 第二刀（路由退化）重评**。 |
| `message-display-hook.mjs` | 输出 conciseness 强制（保 Forge marker） | 可吸收 | 🔴 砍 | 模型默认简洁 + caveman 类 skill 已管；conciseness 是「会被吸收」典型。 |
| `permission-denied-hook.mjs` | auto 拒绝时决定是否重试 | 运行时调度 | 🔴 砍 | 移交运行时，非方法论。 |
| `task-created-hook.mjs` | build 时读 plans 绑定新任务 | 可吸收 | 🔴 砍 | 模型自己绑任务上下文。 |
| `worktree-create-hook.mjs` | 记录 worktree 到 progress/worktrees.json | 组织记忆（弱） | 🔴 砍 | worktree 状态 git 自管，无需 Forge 镜像。 |
| `worktree-remove-hook.mjs` | 移除 worktree 记录 | 同上 | 🔴 砍 | 同上。 |
| `hook-task-completed.sh` | Agent Teams TaskCompleted gate | 死代码 | ⚫ 砍 | ADR-0007 明确 review/build/loop 永不迁移 Agent Teams——无 caller。 |

## D. Record hooks（记录，4）

| Hook | 职责 | Existence 归类 | 判定 | 动作 / 理由 |
|------|------|----------------|------|-------------|
| `record-help-baseline.mjs` | 记录 forge-loop --help 基线到 test fixture | 测试基础设施 | 🟢 留 | CLI flag 兼容测试用。 |
| `record-ipc-baseline.mjs` | IPC 基线 NDJSON fixture | 测试基础设施 | 🟢 留 | 同上。 |
| `record-evolved-rule-violation.mjs` | 扫 events 记录 evolved-rule 违规 | 可吸收（自我监控） | 🔴 砍 | 模型变强自合规；记录机制过重。 |
| `record-prompt-metrics.mjs` | prompt 指标记录 | 运维 | 🔴 砍 | 移交运行时。 |

## Z. 其他 PostToolUse / PreToolUse / guard（5）

| Hook | 职责 | Existence 归类 | 判定 | 动作 / 理由 |
|------|------|----------------|------|-------------|
| `check-destructive`（PreToolUse Bash） | destructive guard（git reset --hard / push --force / clean） | 纪律强制力（刹车） | 🟢 留 | 防不可逆操作——纯外部刹车，模型压力下会找理由跳过。 |
| `postooluse-inject-warnings.mjs` | frozen / context 边界违规警告（R15） | 风险判断 | 🟢 留 | 边界守护。 |
| `prompt-injection-scan.sh` | CI 扫描 prompt 注入 | 风险判断（安全） | 🟢 留 | 安全 CI 门禁。 |
| `posttooluse-status-reminder.mjs` | 提醒改完代码更新 progress | 可吸收 | 🔴 砍 | 模型自己更新状态；babysit。 |
| `phase-transition-guard.sh` | 阶段转换门禁 | 三级路由残留 | 🔴 砍 | 随 ADR-0009 第二刀（路由退化）一并砍。 |

---

## 范围外（本次不审，归其他刀）

- **第五刀 check 脚本链**：`E_check`（45）+ `F_validate`（10）+ `G_lint`（3）= 58 个 CI/build 校验脚本。多为「Forge 自身元数据一致性」（skill 引用 / agent 链接 / dist 同步 / skeleton）。保留 `typecheck` / `test` / `lint` 核心，其余逐项另审。
- **I_maint（16）**：bundle / migrate / mirror / sync 类，构建与一次性迁移，非 runtime 拦截。
- **H_install（5）**：安装脚本，不动。
- **Z_other（64）**：杂项 + lib，逐个另审。

## 执行建议

1. **第一批砍（零风险，死代码 + 纯 babysit）**：`hook-task-completed.sh`（⚫）、`stop-additional-context`、`stop-failure-hook`、`inject-plan-context`、`message-display-hook`、`permission-denied-hook`、`task-created-hook`、`worktree-create/remove-hook`、`record-evolved-rule-violation`、`record-prompt-metrics`、`posttooluse-status-reminder`。
2. **第二批退化（动机制不动内容）**：`inject-evolved-rules`、`stop-pending-rules`、`hook-postcompact`、`hook-precompact`。
3. **保留 14 个重审入口**：每次模型升级后重评 `forge-phase-worker` / `stop-incomplete-tasks` 是否已被原生吸收。
4. **每批砍除需独立 spec**：逐项验证无 caller（grep entry）、不破坏 frozen / ship-gate / 安全防御。
