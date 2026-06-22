---
description: "Use when user runs `/forge init`, project has no .forge/ directory, or plugin is installed but project not yet initialized"
updated: 2026-06-22
dispatch_mode: inline
allowed_tools:
  - Bash
  - Read
  - AskUserQuestion
---

# /forge init — 项目初始化

> **触发方式**：用户输入 `/forge init [--pack <name>]` 或 `/forge init --recipe <name>`
> **职责**：完成项目初始化（创建 `.forge/` 目录、复制 agent 角色、生成 CLAUDE.md 项目宪法）
> **实现**：所有文件操作由 `init.sh` 完成；本 SKILL 负责定位脚本并按运行环境选择采集方式

### `--recipe <name>` — 测试栈脚手架（ADR-0006 Req6）

`/forge init --recipe <name>` 向**用户项目本地**生成组件测试栈配置（MSW/vitest），
**Forge 包零依赖增量**（守 R6.5）。可用 recipe：`vue3-vitest-msw`、`react-vitest-msw`。

- 生成后**不自动 install**，只打印 `<pkg manager> add -D <deps>` 指令（由用户执行）。
- 自动探测包管理器（pnpm-lock.yaml / yarn.lock / package-lock.json / packageManager 字段）。
- 已存在的文件**跳过并报告冲突**，提示手动合并（不静默覆盖）。
- 未知 recipe → 非零退出 + 列出可用 recipe。

详见各 recipe 目录的 `README.md`（测试哲学、handler 复用边界、数据驱动分支范式、自定义请求层适配）。

---

## 1. 执行逻辑（两条路径）

`init.sh` 自 v3.7 起支持完整参数化：`--name` / `--stack` / `--security` /
`--ci-command` / `--no-ultrareview` / `--bday-cutoff` / `--bday-tz`，配合
`--non-interactive` 跳过所有 `read`。由此分两条采集路径。

### Step 1.0 — 定位 init.sh

按以下优先级尝试定位脚本：

1. **Plugin 模式**：`"${CLAUDE_PLUGIN_ROOT}/scripts/init.sh"`
2. **Clone 模式**：`forge/scripts/init.sh`（项目根目录下）
3. **失败诊断**：两者都不存在时输出错误信息并停止：

```
❌ 未找到 init.sh
已尝试路径：
  ${CLAUDE_PLUGIN_ROOT}/scripts/init.sh
  forge/scripts/init.sh
请通过 marketplace 安装 Forge plugin，或克隆 Forge 仓库到项目下：
  git clone https://github.com/kkkman22/Forge.git forge
```

若用户原样传入 `--recipe` 或 `--help` → **直接透传给 init.sh**，不走下面的采集流程
（recipe 模式在 init.sh 内早退，无需任何项目配置输入）。

### 路径 A — Claude Code 内（默认走 AskUserQuestion）

Claude Code 的 Bash 工具 stdin 不是 TTY，裸 `read` 会卡住或拿到空值。因此在 CC 内
**默认**通过 `AskUserQuestion` 逐项采集配置，再把答案拼成 flags 传给 init.sh。

每次一个问题（house 风格，见 `lib/charter/references/subcommands.md`；YAML 块样式
见 `lib/ship/references/delivery-options.md:5-20`）。**已有 `--pack <name>`、
`--recipe <name>` 等用户显式参数时照常透传，不重复询问。**

**Q1 — 项目名称**

```
AskUserQuestion:
  question: "项目名称（Forge 会创建 .forge/ 和 CLAUDE.md）"
  header: "Init"
  options:
    - label: "<basename>（自动检测）"   # Recommended — put first
      description: "使用当前目录名作为项目名"
    - label: "自定义"
      description: "输入其它名称"
  multiSelect: false
```
- 选自动检测 → `--name "<basename>"`
- 选自定义 → 用户在 Other 中输入，`--name "<input>"`

**Q2 — 技术栈**

```
AskUserQuestion:
  question: "技术栈（用于生成 CLAUDE.md 项目宪法）"
  header: "Init"
  options:
    - label: "TypeScript + React + Node.js"   # Recommended
    - label: "TypeScript + Vue + Node.js"
    - label: "Python + FastAPI"
    - label: "自定义"
  multiSelect: false
```
- 前 3 项 → `--stack "TypeScript, React, Node.js"` / `"TypeScript, Vue, Node.js"` / `"Python, FastAPI"`
- 自定义 → `--stack "<用户输入>"`（逗号分隔）

**Q3 — 安全级别**

```
AskUserQuestion:
  question: "安全级别（影响 review 的 security-check 严格度）"
  header: "Init"
  options:
    - label: "标准（Level 1）"   # Recommended — 常规 Web 应用
    - label: "高（Level 2）"     # 涉及支付、个人信息
    - label: "最高（Level 3）"   # 金融、医疗、政府系统
  multiSelect: false
```
- → `--security 1` / `2` / `3`

**Q4 — CI AI 评审**

```
AskUserQuestion:
  question: "是否安装 CI AI 评审（claude ultrareview）？"
  header: "Init"
  options:
    - label: "跳过（推荐，稍后可手动加）"   # Recommended — put first
      description: "不安装 .github/workflows/ultrareview.yml"
    - label: "启用"
      description: "安装 workflow，但需要在 GitHub Secrets 手动配 ANTHROPIC_API_KEY"
  multiSelect: false
```
- 选跳过 → 加 `--no-ultrareview`
- 选启用 → 不加该 flag（init.sh 会复制 yml）

**Q5 — CI 检查命令（可选）**

先跑 `node scripts/suggest-ci-command.mjs`（在用户项目根，而非 Forge 根）探测；
探测到 `npm run check` 之类：

```
AskUserQuestion:
  question: "CI 检查命令（build/test 阶段会原样调用）"
  header: "Init"
  options:
    - label: "<探测值>（推荐）"
      description: "从 package.json 推断"
    - label: "自定义"
      description: "手动输入一条命令"
    - label: "跳过"
      description: "留空，build/test 将按 verify_commands 逐条执行"
  multiSelect: false
```
- → `--ci-command "<值>"`，或省略该 flag（跳过时 init.sh 会写成空字符串）

**Q6 / Q7 — PMS business-day（仅当 `--pack pms` 存在时追加）**

```
AskUserQuestion:
  question: "PMS 营业日切日时间（0-23）"
  header: "Init"
  options:
    - label: "4（推荐）"
    - label: "自定义"
  multiSelect: false
```
- → `--bday-cutoff <n>`

```
AskUserQuestion:
  question: "PMS 时区（IANA）"
  header: "Init"
  options:
    - label: "Asia/Shanghai（推荐）"
    - label: "自定义"
  multiSelect: false
```
- → `--bday-tz "<zone>"`

**组装并执行**

```bash
bash "${INIT_PATH}" \
  --non-interactive \
  --name "<Q1>" --stack "<Q2>" --security "<Q3>" \
  $([[ "$Q4" == skip ]] && echo --no-ultrareview) \
  --ci-command "<Q5>" \
  ${PACK:+--pack "$PACK" --bday-cutoff "<Q6>" --bday-tz "<Q7>"}
```

- 所有 `read` 被 `--non-interactive` 跳过；答案完全由 flags 驱动。
- `init.sh` 会自行处理 `.forge/` 已存在的覆盖确认（`--non-interactive` 下自动继续）。

### 路径 B — 终端直跑（保留 shell 交互体验）

用户在自己的终端 `bash scripts/init.sh [args]`（或 `bash "${INIT_PATH}/init.sh"`），
stdin 是 TTY，走 `read -rp` 原生交互。**本 SKILL 在 CC 内不使用这条路径**，但文档里
需要告知用户它存在（见下方「无 Bash 工具权限」分支）。

---

## 2. 分发步骤

1. 检测 `${CLAUDE_PLUGIN_ROOT}` 环境变量是否已设置
2. 若已设置，检查 `"${CLAUDE_PLUGIN_ROOT}/scripts/init.sh"` 是否存在
3. 若存在 → 记为 `INIT_PATH`，进入路径 A 采集（或透传 `--recipe`/`--help`）
4. 若不存在或变量未设置，检查 `forge/scripts/init.sh` 是否存在
5. 若存在 → 记为 `INIT_PATH`，同上
6. 两者都不存在 → 输出 §1.Step 1.0 的诊断信息并停止

---

## 3. Edge Cases

| 条件 | 处理 |
|------|------|
| `.forge/` 已存在 | init.sh 自身在 `--non-interactive` 下自动继续覆盖；非交互式终端下仍会 `read` 确认，本 SKILL 不额外拦截 |
| `--help` 参数 | 透传给 init.sh，显示帮助后退出（不走路径 A 采集） |
| `--recipe <name>` | 透传给 init.sh（加 `--non-interactive`），不走路径 A 采集；recipe 模式早退 |
| init.sh 非零退出 | 输出 init.sh 的 stderr，不额外处理；若为参数错误（如 `--security 4`）提示用户修正后重跑 |
| 无 Bash 工具权限 | 先完成路径 A 的 AskUserQuestion 采集，再把组装好的完整命令（含 `--non-interactive` 和所有 flags）打印给用户，请其在终端执行 |
| Bash 工具 stdin 非 TTY | 这是 CC 内常态。直接走路径 A（AskUserQuestion → flags），不要尝试裸 `bash init.sh` 不带 flags |

---

## 4. 注意事项

- **路径 A 的不变量**：每次至少传 `--non-interactive` + `--name` + `--stack` + `--security`。
  缺任何一个，init.sh 会因为没有 TTY 的 stdin 而卡在对应 `read`。
- **路径 B 的不变量**：终端用户可只跑 `bash scripts/init.sh`，走 `read` 交互——
  init.sh 在「无 flag 且 `NON_INTERACTIVE=0`」时行为与历史版本逐字节一致，兼容
  `yes "" \| bash init.sh --non-interactive` 这类脚本化调用。
- 本 SKILL 不直接修改任何文件，所有文件操作由 init.sh 完成。

## 5. Charter 创建选项

init.sh 完成后，询问用户是否创建项目宪章（默认 Yes）：
- **选择创建**：调用 `/forge charter init` 的精简版，只问 3 个问题（核心问题、主要技术选型、1–3 条 invariants），生成 `.forge/charter.md`，`status: draft`
- **选择跳过**：正常完成，不阻断
- 提示用户后续可通过 `/forge charter update` 将 charter 激活为 `status: active`
