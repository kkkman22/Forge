---
status: locked
feature: zcode-p1-base-integration
layout: design
created: 2026-07-09
tier: light
---

# Forge × ZCode P1 基础接入 — 技术设计

## 设计总览

P1 五项分两类 task：

| 项 | 类型 | 改什么 | 双平台影响 |
|---|---|---|---|
| R1 工作区配置生成 | **改动型** | init 流程新增 `--platform zcode` 分支 | 仅 ZCode 路径触发，Claude 透明 |
| R2 hook schema 裁剪 | **改动型** | mjs hook 输出前加平台裁剪 | Claude 侧输出不变（探测失败保守按 Claude） |
| R3 evolved-rules 注入 | **验证型** | 新增回归脚本 + 证据文档 | 零源码改动 |
| R4 模板变量展开 | **验证型** | 新增回归脚本 + 证据文档 | 零源码改动 |
| R5 agent 加载 | **验证型** | 新增回归脚本 + 证据文档 | 零源码改动 |
| R6 双平台透明 | **横切回归** | 聚合 R3-R5 + 透明断言 | 守护 Claude 侧不漂移 |

核心设计原则：**改动型 task 用平台分支隔离 ZCode 行为，验证型 task 零源码侵入只加可复跑证据。**

## R1: 工作区配置生成（--platform zcode）

### 触发与隔离

- init 现有 flag 解析循环新增 `--platform <name>` 标志，值校验仅接受 `zcode`（其他值 warn + 忽略，不阻断 init）。
- 仅当 `--platform zcode` 时进入"ZCode 配置生成"步骤；不传则完全跳过，Claude 侧路径一字节不变（R6.1 byte-equal 断言守护）。
- 该步骤插入在现有 Step 2（创建 `.forge/`）之后、Step 3 之前——因为 Stop hook 注入的 status.md 依赖 `.forge/` 已存在。

### 生成的配置内容

配置文件路径：`<project_root>/.zcode/config.json`。结构遵循 ZCode 工作区配置规范（`hooks.events.<Event>`，非插件文件的 `hooks.<Event>`）：

- 顶层 `hooks.enabled: true`（工作区配置型 hook 必须显式启用，见 zcode-guide pitfall #1）。
- `hooks.events.Stop` 注册一条 `type: command` hook，命令把 `.forge/status.md` 摘要作为 additionalContext 注入（compact 补偿，对齐 v2 §6.4/§9.5）。
- 命令字符串通过 `${CLAUDE_PLUGIN_ROOT}` 或 `${ZCODE_PROJECT_DIR}` 解析到 Forge 提供的脚本，fallback chain 与现有 hooks.json 风格一致（`${CLAUDE_PLUGIN_ROOT:-}/... || scripts/... || true`）。**不硬编码绝对路径**（R1 AC4）。

### 幂等与合并

- 若 `.zcode/config.json` 已存在：不覆盖，warn 提示"已存在，请手动合并 Stop hook 到 hooks.events.Stop"。与 init 现有 `.claude/settings.json` 合并策略一致（idempotent，R1 AC5）。
- 若存在但不含 `hooks.events.Stop`：可选合并（node 读-改-写，与现有 settings.json merge 风格一致）。P1 取保守策略——只 warn 不自动合并，避免破坏用户已有配置。

### 输出汇总

init 完成输出的"已创建"清单新增一行（仅 `--platform zcode` 时）：`.zcode/config.json — Stop 注入 status.md 摘要（compact 补偿）`。

### 为什么是 Stop 而非 SessionStart

v2 §6.4 明确工作区配置用于"补充插件 hook 覆盖不到的场景"。插件已在 SessionStart 注入 evolved-rules（R3 验证），工作区级再叠 SessionStart 会重复。Stop 是 PreCompact 不支持的补偿点（v2 §9.5 推荐组合 A），且 ZCode Stop 已实测可用。这是 P1 最小有用补偿，完整 compact 补偿（AGENTS.md prompt + UserPromptSubmit 周期注入）留给 P4。

## R2: hook stdout JSON 平台裁剪

### ZCode strict schema 白名单（实测核对）

依据 zcode-guide `diagnosing-hooks` §2 与 pitfall #8，ZCode 认可的 stdout JSON key：

| 事件 | 白名单 key |
|---|---|
| 通用 | `additionalContext` |
| PreToolUse | `decision`（allow/ask/deny）+ `systemMessage` + `additionalContext` |
| PostToolUse | `updatedToolOutput` |
| Stop | continuation 相关字段（`stopHookActive` 等） |

**Forge 当前输出的非白名单 key**（盘点结果）：
- `inject-evolved-rules.mjs`：`hookSpecificOutput.hookEventName`、`hookSpecificOutput.reloadSkills`、`hookSpecificOutput.sessionTitle`。✅ 已裁剪（T5）。
- `message-display-hook.mjs`：`hookSpecificOutput.updatedDisplay`。⚠️ **T6 复核后跳过**——该 hook 挂在 `MessageDisplay` 事件（Claude Code 专有，不在 ZCode 七事件内），在 ZCode 下从不运行，updatedDisplay 不会触发 ZCode schema warn。给它接裁剪是死代码，反而引入回归风险。保留现状，不动。
- 其余 hook（`stop-additional-context.mjs` 的 `hookSpecificOutput.additionalContext`、`config-changed-hook.mjs` 的顶层 `additionalContext`、posttooluse-inject-warnings 的 `updatedToolOutput`）**已在白名单内，无需裁剪**。

### 平台探测策略

- 探测信号：ZCode 在 plugin hook 下注入 `${ZCODE_PLUGIN_ROOT}` / `${ZCODE_PROJECT_DIR}` 等环境变量（zcode-guide §2 明确"also injected as environment variables"）。Claude Code 不注入这些。
- 判定：hook 启动时读环境变量，若存在任一 `ZCODE_*` plugin 变量 → 判为 ZCode 运行时；否则 → Claude Code。
- **失败安全**：探测失败（变量都不在）→ 保守按 Claude Code 输出全部字段（R2 AC3）。宁可 ZCode 侧留 warn，也不破坏 Claude 侧 reloadSkills/sessionTitle。

### 裁剪实现位置

- 裁剪逻辑集中在一处共享判定函数（放在现有 hook 公共库目录，与 `hook-stdin-router.mjs` 同层），导出"当前是否 ZCode 运行时"判定 + "按平台裁剪 hook 输出对象"两个能力。
- 每个受影响 hook 在 `process.stdout.write(JSON.stringify(output))` 前调用裁剪函数。不分散判定逻辑（R2 AC4）。
- 裁剪仅删非白名单 key，白名单 key 的值与结构不动（R2 AC5）。例如 inject-evolved-rules 裁剪后保留 `additionalContext`（白名单），删 `hookSpecificOutput`（含 reloadSkills/sessionTitle）。

### Claude 侧回归保护

- R2 AC6 要求回归断言保护 Claude 侧扩展字段不丢失。
- 回归脚本对每个受影响 hook 录两份基线快照：(a) ZCode 信号下的白名单子集输出，(b) Claude 信号下的完整输出（含 reloadSkills/sessionTitle/updatedDisplay）。每次跑回归比对两份快照。

### 为什么不直接删扩展字段

直接删会让 Claude Code 侧失去 reloadSkills（SessionStart 后重载 skill 清单）与 sessionTitle（会话标题显示），属 Claude 侧行为变更，违反双平台透明硬约束。运行时裁剪是唯一兼顾两侧的方案。

## R3: evolved-rules SessionStart 注入验证（验证型）

### 验证目标

确认 `inject-evolved-rules.mjs` 在 ZCode SessionStart 下触发并注入成功。前置结论（v2 §5.5/§6.2）：插件 SessionStart hook 自动启用，已实测触发。P1 把"已测"固化为"可复跑回归"。

### 回归脚本设计

- 脚本模拟 SessionStart hook stdin（含 subagent caller 信号为 false 的正常路径），分两种场景：
  1. 预置 `.forge/knowledge/evolved-rules.md`（含至少一条 `### R1:` + `**Content**:` 规则）→ 断言 stdout additionalContext 非空且含 Content 摘要。
  2. 不预置该文件 → 断言 hook 静默 exit 0 无 stdout。
- 脚本不依赖真实 ZCode 运行时——它直接调 hook 脚本并模拟 stdin/env。这是"hook 逻辑正确性"回归；"ZCode 真实触发"由证据文档的运行时快照证明。

### 证据文档

记录：实测命令、stdout 快照（两场景）、判定、运行日期、ZCode SessionStart 触发路径说明（插件 hook 自动启用无需 `hooks.enabled:true`，依据 zcode-guide §1）。

## R4: 模板变量展开验证（验证型）

### 验证目标

确认 `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PROJECT_DIR}` 在 ZCode plugin hook 下原样展开 + 注入环境变量。前置结论（v2 §7.3）：zcode-guide 原文已确认。P1 固化为回归。

### 回归脚本设计

两条断言路径：
1. **命令字符串展开**：构造一个只 echo `${CLAUDE_PLUGIN_ROOT}` 的临时 hook，在 ZCode 工作区配置里注册，触发 SessionStart，捕获 echo 输出 → 断言非字面 `${...}`、非空、是合法路径且指向 forge 插件 cache 目录。
2. **环境变量注入**：构造一个读 `process.env.CLAUDE_PLUGIN_ROOT` 并输出到 stdout 的 node hook，同样触发 → 断言 env 值非空且与命令展开值一致。

注意：这条回归**必须在真实 ZCode 运行时跑**（不能纯模拟），因为变量展开是 ZCode host 行为。脚本设计为"可手动触发 + 记录结果到证据文档"，CI 跑模拟部分（脚本逻辑），手动跑真实展开部分并归档快照。

### 证据文档

记录：zcode-guide `diagnosing-hooks` §2 关于 plugin hook 模板变量展开的原文引用、两条路径的实测值快照、判定。

## R5: agent 加载验证（验证型）

### 验证目标

确认 24 个 agent 角色在 ZCode 下可加载，且不依赖 `CLAUDE_AGENTS_DIR`（非 ZCode 标准变量）。

### 关键事实核对（设计修正）

v2 §7.3 提"`CLAUDE_AGENTS_DIR` 6 处需 cwd 回退验证"。**实测核查发现**：`check-agent-links.mjs` 里的 `CLAUDE_AGENTS_DIR` 是**本地 const**（`join(ROOT, ".claude", "agents")`，ROOT 由 `import.meta.dirname` 推导），**不是环境变量读取**。`forge-sync-runtime.mjs` 不引用 agents。即 v2 所述"6 处"指 const 命名，而非 `process.env.CLAUDE_AGENTS_DIR` 读取——**该变量根本不在 scripts/ 里被作为 env 读取**。因此 R5 的真实风险不是"env 变量缺失"，而是"ZCode 是否识别插件的 `agents` 目录字段并加载"。

### 回归脚本设计

- 枚举 Forge 插件 agents 目录全部 `.md`（排除 README），断言数量 == 24。
- 断言每个文件含 frontmatter（`---` 起始）与至少 name/description 字段（ZCode agent 加载前置）。
- 不依赖 `CLAUDE_AGENTS_DIR` env——脚本用 `import.meta.dirname` 推导插件根（与 hook 脚本同一机制）。

### 证据文档

记录：zcode-guide plugin manifest `agents` 字段说明（`zcode-configuration-guide` §"Plugins"：`agents` 是 plugin component field，可为目录名/数组/inline）、24 角色清单、加载机制判定（ZCode 经插件 `agents` 字段发现，不经 env 变量）。

## R6: 双平台透明回归（横切）

### 聚合入口

一个 `zcode-p1-verify` 聚合脚本（或 init 的 `--verify-zcode-p1` 子模式），依次跑：
1. R3/R4/R5 三个回归脚本。
2. R6.1：在临时目录跑两次 init（一次带 `--platform zcode`，一次不带），diff 两次产物除 `.zcode/` 外应完全一致。
3. R6.2：对 R2 受影响 hook，在 Claude 信号下跑断言输出 == 基线快照。

### 失败诊断

聚合脚本失败时打印哪一项回归失败 + 该项的判据，便于定位是 ZCode 适配回归还是 Claude 侧透明性回归。

## 双平台兼容策略（汇总）

1. **分支隔离**：所有 ZCode 专属行为（init 的 `--platform zcode`、hook 的平台裁剪）都在显式平台判定后进入，默认路径走 Claude Code 原逻辑。
2. **失败安全**：平台探测失败时保守按 Claude Code 行为（R2 AC3），宁可 ZCode 侧功能降级也不破坏 Claude 侧。
3. **共享真相源不变**：skills/commands/agents/hooks.json/.claude-plugin 文件本身不改结构（v2 §7.1），ZCode 不支持的事件静默跳过是设计预期。
4. **回归守护**：R6 聚合回归固化 Claude 侧基线，任何让 Claude 侧漂移的改动会被 byte-equal / 快照比对拦截。

## 风险与应对

| 风险 | 应对 |
|---|---|
| 平台探测信号误判（ZCode 某版本不注入 `ZCODE_*`） | 失败安全按 Claude 输出；证据文档记录探测信号清单，版本升级时复核 |
| R4 真实展开回归需手动跑，CI 覆盖不全 | CI 跑模拟部分，手动展开快照归档到证据文档，发版前人工复核 |
| Stop hook 注入 status.md 在无 `.forge/` 项目报错 | Stop 命令加 `2>/dev/null \|\| true` 容错（与现有 hooks.json 风格一致）|
| init 现有 Step 编号因新增步骤错位 | 新增步骤不占现有 Step 编号，作为 Step 2 的子步骤或独立"Step Z"标注 |

## 非目标（重申）

- 不改 mjs 为 .sh、不建 platform-paths shim、不复活 v2 撤销项。
- 不动 plan/build/review/ship 治理逻辑。
- 不做完整 compact 补偿（P4）。
