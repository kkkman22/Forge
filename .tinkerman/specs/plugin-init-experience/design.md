---
feature: plugin-init-experience
layout: design
created: 2026-05-18
---

# Design Document: Plugin Init Experience

## Overview

让通过 marketplace 安装的 plugin 用户也能用 `/forge init` 完成项目初始化，并在首次会话时主动引导。三层设计：

1. **Command 层**：`commands/forge.md` 子命令分发表新增 `init`，路由到 Bash 调用对应路径下的 `init.sh`。
2. **脚本层**：`init.sh` 增加 `${CLAUDE_PLUGIN_ROOT}` 检测分支，确保 plugin 模式下能找到资源根；纯函数 `resolveForgeRoot` 抽取到 `src/`，便于测试。
3. **Bootstrap 层**：新增 `scripts/bootstrap-check.mjs`，由 SessionStart hook 调用，非阻断地输出引导文本。

附加：SKILL Edge Cases 文案统一为 `/forge init`、README 与 CHANGELOG 同步、知识库沉淀。

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Command 层：commands/forge.md 子命令分发                       │
│ 用户输入 /forge init [args] →                                 │
│   通过 Bash 工具：                                              │
│     ${CLAUDE_PLUGIN_ROOT}/scripts/init.sh "$@"                │
│     || forge/scripts/init.sh "$@"                             │
│     || (诊断提示 + exit 1)                                     │
└──────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│ 脚本层：scripts/init.sh                                        │
│ detect_forge_root() 优先级：                                    │
│   1. ${CLAUDE_PLUGIN_ROOT}/agents/  ← 新增                     │
│   2. <script_dir>/../agents/                                   │
│   3. ~/.claude/skills/forge/agents/                            │
│   4. fail with diagnostic                                      │
│ 内部纯逻辑用 src/forge-root-resolver.ts (resolveForgeRoot)     │
│   shell 通过 node 子命令调用                                    │
└──────────────────────────────────────────────────────────────┘
                           ↑
┌──────────────────────────────────────────────────────────────┐
│ Bootstrap 层：scripts/bootstrap-check.mjs                      │
│ SessionStart hook 调用，shouldShowBootstrap() 决策：             │
│   存在 .tinkerman/config.md          → skip:already_initialized    │
│   存在 .tinkerman/.bootstrap-dismissed → skip:user_dismissed       │
│   缺 ${CLAUDE_PLUGIN_ROOT}        → skip:no_plugin_context     │
│   其余                              → show 引导文本             │
└──────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Component 1：`commands/forge.md` 子命令路由扩展

**位置**：`commands/forge.md` §1 子命令分发表 + §2 路由示例 + 一段新增的 init 调用块。

**修改要点**：

1. 在分发表新增一行：

   ```
   | `init` | (bash script) | 项目初始化（plugin/clone 通用） |
   ```

2. 在分发表后增加一段"特殊子命令：init"的处理说明：

   ```markdown
   ### 特殊子命令：`init`

   `/forge init` 不是 Skill，而是 Bash 脚本入口。当参数第一个词为 `init` 时，按以下顺序尝试调用：

   1. `${CLAUDE_PLUGIN_ROOT}/scripts/init.sh` —— plugin 模式
   2. `forge/scripts/init.sh` —— clone 模式
   3. 失败时输出诊断：

      ```
      ❌ 未找到 init.sh
      已尝试路径：
        ${CLAUDE_PLUGIN_ROOT}/scripts/init.sh
        forge/scripts/init.sh
      请通过 marketplace 安装 Forge plugin，或克隆 Forge 仓库到项目下：
        git clone https://github.com/kkkman22/Forge.git forge
      ```

   `/forge init` 透传所有命令行参数（如 `/forge init --pack pms` 等价于 `init.sh --pack pms`）。
   ```

3. §2 任务路由示例段增加一条 init 示例：

   ```
   - `/forge init` → 调用 init.sh，按 plugin / clone 模式自动选择路径
   - `/forge init --pack pms` → 调用 init.sh --pack pms（透传参数）
   ```

**设计权衡**：

- 不让 `init` 走 Skill 路径，因为 init 是一次性 IO 密集型脚本，不适合 SKILL 形态。
- 三阶 fallback（plugin → clone → diagnostic）保持现有 `auto-resume.sh` 等脚本的双路径模式一致。

### Component 2：`init.sh` 检测 plugin 根

**位置**：`scripts/init.sh` `detect_forge_root()` 函数（约 100-130 行）

**修改后实现**：

```bash
detect_forge_root() {
  # 情况 0：plugin 模式（V2.5.0 marketplace 安装）
  if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]] && [[ -d "${CLAUDE_PLUGIN_ROOT}/agents" ]]; then
    echo "${CLAUDE_PLUGIN_ROOT}"
    return
  fi

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # 情况 1：脚本在 forge/scripts/ 下（开发模式或手动 clone）
  if [[ -d "${script_dir}/../agents" ]]; then
    (cd "${script_dir}/.." && pwd)
    return
  fi

  # 情况 2：全局安装到 ~/.claude/skills/forge
  if [[ -d "$HOME/.claude/skills/forge/agents" ]]; then
    echo "$HOME/.claude/skills/forge"
    return
  fi

  # 情况 3：找不到 Forge 库
  error "无法找到 Forge 库文件。请确认 Forge 已正确安装。"
  echo "  已检查路径：" >&2
  echo "    \${CLAUDE_PLUGIN_ROOT}=${CLAUDE_PLUGIN_ROOT:-<unset>}" >&2
  echo "    ${script_dir}/.." >&2
  echo "    \$HOME/.claude/skills/forge" >&2
  exit 1
}
```

**纯函数抽取**：`src/forge-root-resolver.ts`（新模块）

```typescript
export interface ResolveInput {
  pluginRoot: string | null;
  scriptDir: string;
  homeDir: string;
}

export interface FsProbe {
  isDir(path: string): boolean;
}

export type ResolveResult =
  | { kind: "plugin"; root: string }
  | { kind: "script-relative"; root: string }
  | { kind: "global"; root: string }
  | { kind: "not-found"; checked: string[] };

/**
 * 按 plugin > script-relative > global 顺序解析 Forge 根目录。
 * 纯函数：所有 IO 通过 FsProbe 注入。
 */
export function resolveForgeRoot(input: ResolveInput, fs: FsProbe): ResolveResult {
  const checked: string[] = [];

  if (input.pluginRoot && input.pluginRoot.length > 0) {
    const candidate = `${input.pluginRoot}/agents`;
    checked.push(input.pluginRoot);
    if (fs.isDir(candidate)) {
      return { kind: "plugin", root: input.pluginRoot };
    }
  }

  const scriptParent = normalizeJoin(input.scriptDir, "..");
  checked.push(scriptParent);
  if (fs.isDir(`${scriptParent}/agents`)) {
    return { kind: "script-relative", root: scriptParent };
  }

  const globalRoot = `${input.homeDir}/.claude/skills/forge`;
  checked.push(globalRoot);
  if (fs.isDir(`${globalRoot}/agents`)) {
    return { kind: "global", root: globalRoot };
  }

  return { kind: "not-found", checked };
}

function normalizeJoin(dir: string, segment: string): string {
  // 简单字符串拼接：消除 trailing slash 与 ".." 段的合并
  // 不依赖 node:path，便于跨 shell/JS 共享语义
  ...
}
```

**Shell 与 TS 的协同**：`init.sh` 不直接 import TS，但开发阶段 `npm run check` 会运行 `test/forge-root-resolver.test.ts` 验证纯函数行为；shell 函数 `detect_forge_root` 是同语义的简化实现，依赖 contract 测试守住一致性（见 §Testing Strategy）。

### Component 3：`scripts/bootstrap-check.mjs` 与纯函数

**位置**：`scripts/bootstrap-check.mjs`（新文件）

**完整实现**：

```javascript
#!/usr/bin/env node
// category: internal-only
// Forge bootstrap check — SessionStart hook
// 检测 plugin 已激活但项目未初始化的情况，输出非阻断引导。
import { existsSync } from "node:fs";

/**
 * @typedef {Object} BootstrapEnv
 * @property {string|undefined} pluginRoot
 * @property {string} cwd
 *
 * @typedef {(path: string) => boolean} FsExists
 *
 * @typedef {{kind: "show"} | {kind: "skip", reason: "already_initialized"|"user_dismissed"|"no_plugin_context"}} BootstrapDecision
 */

/**
 * @param {BootstrapEnv} env
 * @param {FsExists} fsExists
 * @returns {BootstrapDecision}
 */
export function shouldShowBootstrap(env, fsExists) {
  if (fsExists(`${env.cwd}/.tinkerman/config.md`)) {
    return { kind: "skip", reason: "already_initialized" };
  }
  if (fsExists(`${env.cwd}/.tinkerman/.bootstrap-dismissed`)) {
    return { kind: "skip", reason: "user_dismissed" };
  }
  if (!env.pluginRoot || env.pluginRoot.length === 0) {
    return { kind: "skip", reason: "no_plugin_context" };
  }
  return { kind: "show" };
}

const BOOTSTRAP_TEXT = `💡 Forge plugin 已激活，但当前项目尚未初始化。
   运行 \`/forge init\` 创建 .tinkerman/ 目录、配置项目宪法与 7 个 Subagent。
   若不打算在本项目使用 Forge，可创建空文件 \`.tinkerman/.bootstrap-dismissed\` 跳过此提示。`;

function main() {
  try {
    const decision = shouldShowBootstrap(
      { pluginRoot: process.env.CLAUDE_PLUGIN_ROOT, cwd: process.cwd() },
      existsSync,
    );
    if (decision.kind === "show") {
      process.stdout.write(BOOTSTRAP_TEXT + "\n");
    }
    process.exit(0);
  } catch {
    // 静默吞掉：与 SessionStart 钩子的"|| true"行为对齐
    process.exit(0);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

**SessionStart 钩子注册**：在 `.claude-plugin/plugin.json` `hooks.SessionStart` 数组追加一项：

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap-check.mjs\" 2>/dev/null || true",
      "timeout": 5
    }
  ]
}
```

**关键设计点**：

- 纯函数 `shouldShowBootstrap` 只依赖入参，便于单元测试。
- `main()` 包一层 try/catch 静默吞错，对齐其他 SessionStart hook 的容错策略。
- 不读 `.tinkerman/` 内任何受保护文件，避免触发冻结区误判。
- 引导文本控制在 4 行，不挤占 SessionStart 输出预算。

### Component 4：SKILL Edge Cases 文案统一

**位置**：13 个 instructions.md / edge-cases.md 文件（详见 Requirement 4 列表）

**改动模式**：将所有出现在 SKILL 提示文案中的 `forge init` 替换为 `/forge init`。注意**例外**：

- `templates/CLAUDE.md`、`templates/AGENTS.md`：保留"本文件由 `forge init` 自动生成"的历史出处描述（这是描述生成动作而非引导命令）。
- `scripts/init.sh` 内部注释：保留（描述脚本本身）。
- `README.md`：plugin 章节使用 `/forge init`，clone 章节保留 `bash forge/scripts/init.sh`（精确反映底层调用）。

**自动化检查**：`scripts/check-init-references.mjs`（新文件，可选）扫描 `skills/forge/lib/**/*.md`，发现独立 `forge init`（无前缀斜杠）字符串时报错。或更轻量的方式：在 `test/contract.test.ts` 增加一条断言。

### Component 5：`.claude-plugin/plugin.json` 钩子注册

**位置**：`.claude-plugin/plugin.json` `hooks.SessionStart`

**修改前**：

```json
"SessionStart": [
  { "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/scripts/auto-resume.sh\" 2>/dev/null || bash forge/scripts/auto-resume.sh 2>/dev/null || true", "timeout": 5 }] },
  { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/inject-evolved-rules.mjs\" 2>/dev/null || node forge/scripts/inject-evolved-rules.mjs 2>/dev/null || true", "timeout": 5 }] }
]
```

**修改后**：在末尾追加一项：

```json
{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap-check.mjs\" 2>/dev/null || node forge/scripts/bootstrap-check.mjs 2>/dev/null || true", "timeout": 5 }] }
```

**双路径**：与现有 SessionStart hook 保持一致——优先 `${CLAUDE_PLUGIN_ROOT}`，回退 `forge/`，最终 `|| true`。

### Component 6：README 与 CHANGELOG 同步

**位置**：

- `README.md` "快速开始 / Plugin 安装"段
- `docs/onboarding.md`（或最相关 onboarding 文档）
- `CHANGELOG.md` 顶部 unreleased 段

**README 增量**（示意）：

```markdown
## Plugin 安装（推荐）

1. `/plugin install forge --marketplace https://github.com/kkkman22/Forge`
2. 在你的项目根目录运行：`/forge init`
3. 按提示填写项目名 / 技术栈 / 安全级别
4. 输入 `/forge` 描述任务，开始第一个开发循环。
```

**CHANGELOG 增量**（示意）：

```markdown
## [Unreleased]

### Added
- `/forge init` 子命令：plugin 用户可像调用其他 SKILL 一样初始化项目，无需手动定位 init.sh。
- SessionStart bootstrap 引导：plugin 已激活但项目未初始化时，自动提示运行 /forge init。
- `init.sh` 检测 `${CLAUDE_PLUGIN_ROOT}` 环境变量，正确解析 plugin 模式资源根。

### Changed
- 12 个 SKILL 的 Edge Cases 文案：`forge init` → `/forge init`，与新入口对齐。
```

## Data Models

### `BootstrapDecision`

```typescript
type BootstrapDecision =
  | { kind: "show" }
  | { kind: "skip"; reason: "already_initialized" | "user_dismissed" | "no_plugin_context" };
```

### `ResolveResult`

```typescript
type ResolveResult =
  | { kind: "plugin"; root: string }
  | { kind: "script-relative"; root: string }
  | { kind: "global"; root: string }
  | { kind: "not-found"; checked: string[] };
```

### 新增文件 / 不存在的文件

- `.tinkerman/.bootstrap-dismissed`：用户主动创建的空文件，告诉 bootstrap-check 不再提示。
- `scripts/bootstrap-check.mjs`：bootstrap 检测脚本（plugin 与 clone 都引用，clone 模式下作为 `forge/scripts/bootstrap-check.mjs` 存在）。
- `src/forge-root-resolver.ts`：纯函数模块。
- `test/forge-root-resolver.test.ts` + `test/forge-root-resolver.property.test.ts`：单元 + property 测试。
- `test/bootstrap-check.test.ts` + `test/bootstrap-check.property.test.ts`：单元 + property 测试。

## Correctness Properties

### Property 1: resolveForgeRoot 优先级稳定

*For any* `input`，若 `pluginRoot` 非空且 `<pluginRoot>/agents` 存在，则结果一定是 `{kind: "plugin"}`，与其他路径是否存在无关。

**Validates: Requirements 2.2, 2.5**

### Property 2: resolveForgeRoot 完备性

*For any* `(input, fsProbe)` 组合，`resolveForgeRoot` 返回的 `kind` 一定属于 `{plugin, script-relative, global, not-found}`，永不抛错。

**Validates: Requirements 2.5**

### Property 3: shouldShowBootstrap 跳过原因互斥

*For any* `(env, fsExists)`，若结果是 `skip`，则 `reason` 唯一对应一个先决条件——`already_initialized` 蕴含 `.tinkerman/config.md` 存在；`user_dismissed` 蕴含 `.bootstrap-dismissed` 存在且 `config.md` 不存在；`no_plugin_context` 蕴含两文件都不存在且 `pluginRoot` 为空。

**Validates: Requirements 3.2, 3.3, 3.4, 3.5**

### Property 4: shouldShowBootstrap show 触发条件

`shouldShowBootstrap(env, fs).kind === "show"` 当且仅当 `.tinkerman/config.md` 不存在 AND `.tinkerman/.bootstrap-dismissed` 不存在 AND `env.pluginRoot` 非空字符串。

**Validates: Requirements 3.3**

### Property 5: bootstrap 静默不抛错

`bootstrap-check.mjs main()` 在任意环境下退出码 0；任意 `existsSync` 抛错或 `process.env` 读取失败的情况下也不抛 unhandled rejection。

**Validates: Requirements 3.6**

## Error Handling

| 失败场景 | 处理方式 | 用户可见输出 |
|---|---|---|
| plugin 与 clone 路径都不存在的 init.sh | Command 输出三阶诊断后 exit 1 | 列出已尝试路径与建议安装方式 |
| `${CLAUDE_PLUGIN_ROOT}` 设置但 `agents/` 缺失 | `init.sh detect_forge_root` 跳到 case 1 检测 script-relative；最终若都缺则错误退出 | 标准 `error` 输出 |
| bootstrap-check `existsSync` 抛错（权限） | try/catch 静默退出 0 | 无输出 |
| `.tinkerman/.bootstrap-dismissed` 是目录（非文件） | `existsSync` 返回 true，跳过提示 | 与"用户已忽略"等价 |
| 用户在 readonly 文件系统运行 plugin | bootstrap-check 仅读不写，不受影响；`/forge init` 失败时由 init.sh 自身错误处理 | init.sh 现有提示 |
| init.sh 透传非法参数（如 `--pack nonexistent`） | init.sh 现有 `--pack` 校验已处理 | init.sh `❌ Pack` 错误信息 |
| Command 调用 Bash 时 `${CLAUDE_PLUGIN_ROOT}` 含空格或特殊字符 | 双引号包裹路径；引用 `init.sh` 时不解释参数 | 无 |

## Testing Strategy

### Unit Tests

`test/forge-root-resolver.test.ts`（新文件）：

| Case | Input | Expected `kind` |
|---|---|---|
| 1 | pluginRoot=`/plg`, agents 存在 | `plugin` |
| 2 | pluginRoot=`/plg`, agents 不存在；scriptDir=`/x/scripts`，`/x/agents` 存在 | `script-relative`，root=`/x` |
| 3 | pluginRoot 为空；scriptDir 路径无 agents；homeDir=`/h`，`/h/.claude/skills/forge/agents` 存在 | `global` |
| 4 | 三者均不存在 | `not-found`，checked.length === 3 |
| 5 | pluginRoot 为空字符串（""） | 视为 null，跳过 plugin 检测 |

`test/bootstrap-check.test.ts`（新文件）：

| Case | Env / FS | Expected |
|---|---|---|
| 1 | `.tinkerman/config.md` 存在 | `skip:already_initialized` |
| 2 | 仅 `.tinkerman/.bootstrap-dismissed` 存在 | `skip:user_dismissed` |
| 3 | `pluginRoot` 为空；两文件均不存在 | `skip:no_plugin_context` |
| 4 | `pluginRoot=/x`；两文件均不存在 | `show` |
| 5 | `.tinkerman/config.md` 与 `.bootstrap-dismissed` 同时存在 | `skip:already_initialized`（优先级最高） |

### Property Tests

`test/forge-root-resolver.property.test.ts`（新文件）：

- Property 1（plugin 优先）：fast-check 任意 input.pluginRoot 非空 + 任意 fsProbe（保证 `${pluginRoot}/agents` 存在），断言 `kind === "plugin"`。
- Property 2（完备性）：fast-check 任意 input + fsProbe，断言 `kind` 属于四元集合且不抛错。
- Property 3（fallback 顺序）：fast-check 构造 `pluginRoot` 缺 agents 的场景，断言不会跳过 script-relative 直接到 global。

`test/bootstrap-check.property.test.ts`（新文件）：

- Property 4（show 触发）：fast-check 任意 env + fsExists 路径回答，断言 show ⇔ `config.md` 不存在 AND `.bootstrap-dismissed` 不存在 AND `pluginRoot` 非空。
- Property 5（不抛错）：包裹 try/catch，断言任意 env / fsExists 输入不抛异常。

### Integration Tests

`test/forge-init-command.integration.test.ts`（新文件）：

- 场景 A：tmp 目录设置 `${CLAUDE_PLUGIN_ROOT}` 指向桩 plugin 根（含 `agents/` 与 `scripts/init.sh`），断言 `/forge init` 路由调用桩 init.sh 并接收预期参数。
- 场景 B：tmp 目录无 plugin root，但有 `forge/scripts/init.sh`，断言路由回退到 clone 模式。
- 场景 C：两者皆无，断言路由输出诊断信息且非零退出码。
- 场景 D：透传参数 `/forge init --pack pms`，断言桩 init.sh 收到 `--pack pms`。

`test/bootstrap-hook.integration.test.ts`（新文件，可选）：

- 在 tmp 项目目录下，对 `${CLAUDE_PLUGIN_ROOT}` 设置桩，运行 `node scripts/bootstrap-check.mjs`，断言：
  - 无 `.tinkerman/` 时 stdout 含 "Forge plugin 已激活"
  - 有 `.tinkerman/config.md` 时 stdout 为空
  - 有 `.tinkerman/.bootstrap-dismissed` 时 stdout 为空
- 模拟 `existsSync` 抛错（chmod 0），断言退出码 0 且无堆栈泄漏。

### Contract Tests

`test/contract.test.ts`（扩展现有）：

1. 断言 `commands/forge.md` 子命令分发表含 `init` 行。
2. 断言 `commands/forge.md` 含"特殊子命令：`init`"段落。
3. 断言 `.claude-plugin/plugin.json` `hooks.SessionStart` 至少包含一个引用 `bootstrap-check.mjs` 的命令。
4. 断言 13 个 SKILL instructions / edge-cases 文件中不再含独立 `forge init`（仅允许 `/forge init`）。
5. 断言 `scripts/bootstrap-check.mjs` 与 `scripts/init.sh` 都在 `dist-plugin/scripts/` 下被构建脚本复制。

## Risk and Mitigation

| 风险 | 影响 | 缓解 |
|---|---|---|
| SessionStart hook 增加，启动延迟变长 | 用户感知卡顿 | timeout 5s + 静默退出，单条 hook 总耗时通常 <100ms；可选未来增加性能基线测试 |
| 用户在已初始化项目误删 `.tinkerman/config.md`，bootstrap 误报"未初始化" | 误导用户运行 init 覆盖剩余文件 | init.sh 已有"重新初始化将覆盖"二次确认；不修改该交互 |
| plugin 与 clone 双路径维护漂移 | 命令在某种安装模式下失败 | contract 测试守住两条路径都被复制；CI 包含 plugin 模式与 clone 模式的 smoke 测试 |
| `${CLAUDE_PLUGIN_ROOT}` 在某些 CC 版本未导出 | 整套 plugin 路径失效 | `init.sh` fallback 顺序保证至少 script-relative / global 仍可用；bootstrap-check 自动跳过 |
| `/forge init` 子命令在路由表里被错误引导到 Skill | Bash 调用路径不生效 | 在 commands/forge.md "特殊子命令：`init`" 段落用显式调用块，避免分发器误判 |
| `bootstrap-check.mjs` 在 Windows / 非 POSIX 环境路径分隔不一致 | 引导文本路径误读 | 使用 `process.cwd()` 与 `node:path`（已计划）拼接；contract 测试覆盖跨平台路径 |

## Out of Scope

- 不实现 `--non-interactive` / `--auto` init（保留为未来 issue）。
- 不修改 init.sh 的交互问题集（保持向后兼容）。
- 不为 README 重写 plugin 安装章节，仅追加"下一步"提示。
- 不为"用户已忽略"提供 UI 关闭按钮（CC plugin 系统目前不支持 hook 输出可交互按钮）。
- 不为 npm 包、GitHub Release zip 等其他未来分发渠道实现等价路径，仅在知识库记录类似缺口的检测信号供后续 spec 借鉴。
- 不引入新的依赖（不使用 inquirer / prompts 等库）。
