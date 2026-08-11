---
feature: local-ci-parity
layout: design
created: 2026-05-16
---

# Design Document: Local CI Parity

## Overview

消除"本地与 GitHub CI 命令不一致"导致的推送失败循环。三层防御：

1. **配置层**：补齐 `.forge/config.md` frontmatter 的 `ci_check_command` 字段（解锁冻结区一次性修复）。
2. **SKILL 层**：`forge-test` Layer 3 增加漂移检测，缺字段且能推断时，警告 + 强制回退到 `npm run check`，禁止 AI 自拼三件套。
3. **Git 层**：可选的 `.githooks/pre-push` 在推送 main 时强制本地跑一次 `npm run check`。

附加：`forge init` 检测到 `package.json scripts.check` 时主动建议。

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1：.forge/config.md frontmatter（一次性修复）        │
│ ci_check_command: "npm run check"                       │
└─────────────────────────────────────────────────────────┘
                       ↓ SKILL 读取
┌─────────────────────────────────────────────────────────┐
│ Layer 2：forge-test Layer 3 漂移检测（每次 /forge test）   │
│ detectCiCommandDrift(fm, pkg) → DriftResult             │
│   ├─ has_ci_command          → 跑配置命令                │
│   ├─ drift_with_npm_check    → 警告 + 跑 npm run check   │
│   ├─ no_check_no_field       → 逐项回退（旧行为）         │
│   └─ malformed_package_json  → 逐项回退 + 提示            │
└─────────────────────────────────────────────────────────┘
                       ↓ ship 后或 push 前
┌─────────────────────────────────────────────────────────┐
│ Layer 3：.githooks/pre-push（仅 push 到 main）            │
│ 收到 ref=refs/heads/main → npm run check → 失败阻断       │
└─────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Component 1：frontmatter 字段更新

**位置**：`.forge/config.md`（**冻结区**，需用户解锁）

**变更**：

```yaml
---
project: "Forge"
stack:
  - "TypeScript"
  - "JavaScript"
  - "Shell"
security_level: 1
knowledge_limit: 20
max_parallel_agents: 6
findings_retention_days: 30
post_push_verify_enabled: true
ci_check_command: "npm run check"   # 新增
---
```

**Body 同步**：保留现有 "## CI 检查命令" 段落（已经存在，无须修改）。

### Component 2：`detectCiCommandDrift` 纯函数

**位置**：`src/ci-command-drift.ts`（新模块）

**类型定义**：

```typescript
export type DriftResult =
  | { kind: "has_ci_command"; command: string }
  | { kind: "drift_with_npm_check"; suggestedCommand: "npm run check"; warning: string }
  | { kind: "no_check_no_field" }
  | { kind: "malformed_package_json"; reason: string };

export interface FrontmatterInput {
  ci_check_command?: string;
  // 其他字段无关
}

/**
 * 探测 ci_check_command 漂移情况。
 *
 * @param frontmatter - 已解析的 .forge/config.md frontmatter（任意来源）
 * @param packageJsonRaw - package.json 文件原始字符串内容；不存在则传 null
 * @returns DriftResult 区分四种情形
 */
export function detectCiCommandDrift(
  frontmatter: FrontmatterInput,
  packageJsonRaw: string | null,
): DriftResult;
```

**判定矩阵**：

| frontmatter `ci_check_command` | `package.json scripts.check` | 返回 |
|---|---|---|
| 非空 | 任意 | `has_ci_command` |
| 空/缺失 | 存在且非空 | `drift_with_npm_check` |
| 空/缺失 | 不存在 | `no_check_no_field` |
| 空/缺失 | `package.json` 解析失败 | `malformed_package_json` |

**警告文本**（`drift_with_npm_check.warning`）：

```
⚠️ CI 命令漂移检测
  .forge/config.md frontmatter 未声明 ci_check_command，
  但检测到 package.json 中存在 "scripts.check": "npm run check"。
  本次自动使用 `npm run check` 执行 Layer 3，建议补齐 frontmatter：

      ci_check_command: "npm run check"

  补齐后，未来 /forge test、/forge ship Post-Push Verify、本地 pre-push hook
  将使用统一命令，避免再次出现"本地绿、CI 红"。
```

### Component 3：`forge-test` SKILL Layer 3 集成

**位置**：`skills/forge-test/SKILL.md` §2 Layer 3

**修改要点**（在 "CI 检查命令优先级" 段落里展开）：

- 新增"漂移检测"子段落：调用 `detectCiCommandDrift(frontmatter, packageJsonRaw)`，按 `kind` 分支：
  - `has_ci_command` → 维持现有行为，使用 `forge_exec` 执行配置命令
  - `drift_with_npm_check` → 输出 `warning` 文本（不阻断）→ 使用 `forge_exec` 执行 `npm run check` → 在结果末尾追加 `[ci-drift-detected]` 标记到 `.forge/findings/<topic>-ci-drift.md`（一次性记录，重复触发时若 finding 已存在则跳过追加）
  - `no_check_no_field` → 走原有逐项回退（清单项 1-4 分别执行）
  - `malformed_package_json` → 输出 `reason` 警告 → 逐项回退

**Plus**：所有四种分支均不阻断 ship；漂移仅是质量信号。

### Component 4：`.githooks/pre-push`

**位置**：`.githooks/pre-push`（新文件，可执行权限 `0755`）

**完整脚本**：

```bash
#!/usr/bin/env bash
# Forge pre-push hook — 推送 main 时强制跑完整 CI 检查
# 安装：git config core.hooksPath .githooks
# 跳过：git push --no-verify（git 内置）
set -euo pipefail

remote="${1:-}"
url="${2:-}"
guard_branch="${FORGE_PRE_PUSH_BRANCH:-refs/heads/main}"

# stdin 格式：<local_ref> <local_sha> <remote_ref> <remote_sha>
target_main=0
while read -r local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "$guard_branch" ]; then
    target_main=1
    break
  fi
done

if [ "$target_main" -eq 0 ]; then
  exit 0
fi

echo "[pre-push] target=$guard_branch detected (remote=$remote)"
echo "[pre-push] running: npm run check"

if ! npm run check; then
  echo ""
  echo "❌ pre-push 阻断：npm run check 未通过"
  echo "   修复后重试，或临时跳过：git push --no-verify"
  exit 1
fi

echo "✅ pre-push 通过"
```

**关键设计点**：

- 仅在目标 ref 为 `refs/heads/main` 时拦截；功能分支 push 不增加摩擦。
- `FORGE_PRE_PUSH_BRANCH` 环境变量允许个别开发者重定向（例如发布分支 `release/*`）。
- 失败信息明确指引 `--no-verify` 应急通道（避免开发者被卡住）。
- 不依赖 Forge SKILL，纯 shell。
- 工作树干净性由 `npm run check` 内部命令决定，hook 不额外检查。

### Component 5：`forge init` 智能默认

**位置**：`scripts/init.sh` 第 ~223 行 `ci_check_command` 提示段

**修改点**：

1. 提示之前调用 helper：`detected_default=$(node scripts/suggest-ci-command.mjs 2>/dev/null || echo "")`。
2. 提示文案变为：

```
echo "  CI 检查命令（ci_check_command）："
echo "    运行所有 CI 检查的单条命令（如 npm run check）。"
if [ -n "$detected_default" ]; then
  echo "    检测到 package.json 中已定义：$detected_default"
  read -r -p "  请输入 CI 检查命令 [$detected_default]: " ci_check_cmd
  ci_check_cmd="${ci_check_cmd:-$detected_default}"
else
  read -r -p "  请输入 CI 检查命令（留空则使用 verify_commands）: " ci_check_cmd
fi
```

3. 新增 `scripts/suggest-ci-command.mjs`（纯函数 + CLI wrapper）：

```javascript
// scripts/suggest-ci-command.mjs
import { readFileSync, existsSync } from "node:fs";

/**
 * 从 package.json 内容推断 CI 命令建议。
 * @param {string|null} packageJsonRaw
 * @returns {string|null}
 */
export function suggestCiCommand(packageJsonRaw) {
  if (packageJsonRaw === null) return null;
  try {
    const pkg = JSON.parse(packageJsonRaw);
    if (pkg && typeof pkg === "object" && pkg.scripts && typeof pkg.scripts.check === "string" && pkg.scripts.check.length > 0) {
      return "npm run check";
    }
    return null;
  } catch {
    return null;
  }
}

// CLI：cwd 下读 package.json，输出建议或退出 1
if (import.meta.url === `file://${process.argv[1]}`) {
  const path = "./package.json";
  const raw = existsSync(path) ? readFileSync(path, "utf-8") : null;
  const result = suggestCiCommand(raw);
  if (result) {
    process.stdout.write(result);
    process.exit(0);
  }
  process.exit(1);
}
```

`init.sh` 通过 stderr 静默 + 退出码处理"未检测到"情形。

## Data Models

### `.forge/findings/<topic>-ci-drift.md`（漂移记录，仅在 SKILL 检测到 `drift_with_npm_check` 时产出）

```yaml
---
topic: "<topic>"
detected_at: "YYYY-MM-DD HH:mm:ss"
kind: "drift_with_npm_check"
package_json_check: "npm run check"
recommendation: "add ci_check_command to .forge/config.md frontmatter"
---

## CI 命令漂移
（同 SKILL 警告文本）
```

### `.forge/knowledge/known-failures.md` 追加条目（Requirement 5）

```markdown
### 模式：frontmatter 字段在仓库 config.md 缺失但模板存在
- **置信度**：0.8
- **检测信号**：GH CI 失败列表里包含本地从未运行的命令（如 dist-sync、check-doc-structure）
- **根因**：模板 `templates/config.md` 有字段，但 `forge init` 未补齐到本仓库 `.forge/config.md` frontmatter
- **验证命令**：`grep ci_check_command .forge/config.md` —— 无输出 = 漂移
- **修复**：补齐 frontmatter；若 SKILL 已升级，自动检测 + 警告
- **Source**：`.forge/specs/local-ci-parity/`
```

## Correctness Properties

### Property 1: 漂移分类完备性

`detectCiCommandDrift` 对任意 `(frontmatter, packageJsonRaw)` 输入返回的 `kind` 字段属于 `{has_ci_command, drift_with_npm_check, no_check_no_field, malformed_package_json}`。

**Validates: Requirements 2.5**

### Property 2: has_ci_command 优先

*For any* frontmatter where `ci_check_command` 非空字符串，无论 `packageJsonRaw` 内容，结果 `kind === "has_ci_command"` 且 `command === frontmatter.ci_check_command`。

**Validates: Requirements 1.3, 2.5**

### Property 3: malformed 不抛错

*For any* `packageJsonRaw` 字符串，调用 `detectCiCommandDrift(emptyFm, packageJsonRaw)` 不抛异常；JSON 解析失败时返回 `kind === "malformed_package_json"`。

**Validates: Requirements 2.5**

### Property 4: suggestCiCommand 与 detectCiCommandDrift 联动

`suggestCiCommand(raw) === "npm run check"` 当且仅当 `detectCiCommandDrift({}, raw).kind === "drift_with_npm_check"`。

**Validates: Requirements 4.5, 2.1**

### Property 5: pre-push 选择性拦截

`pre-push` 脚本仅在 stdin 包含 `refs/heads/main` 时执行 `npm run check`；推送 `refs/heads/feature-x` 时退出码 0 且不调用 `npm`。

**Validates: Requirements 3.2, 3.4**

## Error Handling

| 失败场景 | 处理方式 | 用户可见输出 |
|---|---|---|
| `package.json` 解析失败 | `detectCiCommandDrift` 返回 `malformed_package_json`，SKILL 输出 reason 警告并降级到逐项回退 | `⚠️ package.json 解析失败：<reason>，使用逐项回退` |
| `npm run check` 在 hook 中超时（默认无超时） | 信任 npm 自身超时；若用户中断（Ctrl+C），hook 退出非 0 码，git push 自动放弃 | npm 自身输出 |
| `.githooks/pre-push` 缺执行权限 | git 直接报错，无须 hook 自身处理 | git 原始错误 |
| `forge_exec` 不可用（MCP 未连接） | `forge-test` SKILL 已有回退到 `scripts/run-with-trim.sh` 或直接执行的逻辑，本 spec 不改变此回退 | 沿用现有 SKILL 提示 |
| `findings/<topic>-ci-drift.md` 写入失败（磁盘满 / 权限） | 仅记录到 stderr，不阻断 SKILL 主流程 | `⚠️ 漂移记录写入失败：<errno>` |
| 解锁冻结区后 frontmatter YAML 语法错误 | `parseConfigGraceful` 返回 warning + 默认值；`npm run check` 中的 `lint-evolved-rules` 等会失败，给出明确 line number | 标准 YAML 解析错误 |

## Testing Strategy

### Unit Tests

`test/ci-command-drift.test.ts`（新文件）：

| Case | Input | Expected `kind` |
|---|---|---|
| 1 | `{ci_check_command: "npm run check"}`, any pkg | `has_ci_command` |
| 2 | `{}`, `{"scripts":{"check":"npm run check"}}` | `drift_with_npm_check` |
| 3 | `{}`, `{}` | `no_check_no_field` |
| 4 | `{}`, `null` | `no_check_no_field` |
| 5 | `{}`, `"{ broken json"` | `malformed_package_json` |
| 6 | `{ci_check_command: ""}`, valid pkg with check | `drift_with_npm_check`（空字符串视为缺失） |
| 7 | `{ci_check_command: "  "}`, valid pkg with check | `drift_with_npm_check`（仅空白视为缺失） |

`test/suggest-ci-command.test.ts`（新文件）：

| Case | Input | Expected |
|---|---|---|
| 1 | `'{"scripts":{"check":"npm run check"}}'` | `"npm run check"` |
| 2 | `'{"scripts":{}}'` | `null` |
| 3 | `null` | `null` |
| 4 | `"not json"` | `null` |

### Property Tests

`test/ci-command-drift.property.test.ts`（新文件）：

- Property 1（完备性）：fast-check 生成任意 `frontmatter.ci_check_command`（含 `null`、`undefined`、空、非空字符串）+ 任意 `packageJsonRaw` 字符串（含合法/非法 JSON），断言 `kind` 在四值之内。
- Property 2（优先）：fast-check 生成非空 `ci_check_command`，断言结果 `kind === "has_ci_command"`。
- Property 3（无抛错）：fast-check 任意 string + 任意 frontmatter，包裹 try-catch 断言 `expect.toNotThrow()`。

### Integration Tests

`test/forge-test-layer3-drift.integration.test.ts`（新文件）：

- 在 tmp 目录构造 `.forge/config.md`（无 `ci_check_command`）+ `package.json`（含 `scripts.check`）。
- mock `forge_exec` 调用，断言 SKILL 调度逻辑选择 `npm run check` 而非三件套。
- 断言 `.forge/findings/<topic>-ci-drift.md` 被创建一次，重复 build 不重复创建。

`test/pre-push-hook.integration.test.ts`（新文件，可选 / 桌面环境跳过）：

- 在 tmp git repo 复制 `.githooks/pre-push`，`git config core.hooksPath`。
- 模拟 push 到 `feature-branch` → hook 退出 0、不跑 `npm run check`（通过桩代替）。
- 模拟 push 到 `main` → hook 调用桩 `npm run check`，根据桩退出码断言 hook 退出码。

### Contract Tests

`test/contract.test.ts`（扩展现有）：

- 断言 `forge-test` SKILL.md §Layer 3 文本里出现 "漂移检测" 段落。
- 断言 `.forge/config.md` frontmatter 解析后含 `ci_check_command` 字段（一旦本仓库补齐，contract 守住不再回退）。
- 断言 `.githooks/pre-push` 存在且可执行。

## Risk and Mitigation

| 风险 | 影响 | 缓解 |
|---|---|---|
| `npm run check` 过慢（~3-5min）让 pre-push 摩擦大 | 开发者全 `--no-verify` 绕过 | hook 仅作用于 main 分支；功能分支 push 不拦截；文档说明 `--no-verify` 应急通道 |
| 漂移警告每次 `/forge test` 都触发，噪音大 | 用户忽略警告 | findings 文件作为去重标记，已记录则不再追加；警告本身在用户补齐 frontmatter 后立即消失 |
| 解锁冻结区改 `.forge/config.md` 引发其他副作用 | 状态文件保护被绕过 | 仅修改 frontmatter 一行；diff 在 PR 中可视；通过 `npm run check` 本身验证一致性 |
| `package.json scripts.check` 在某些项目里指向其他命令（非 `npm run check` 别名） | suggest 误报 | suggest 函数仅在键存在时返回 `"npm run check"`，不解析具体脚本；用户可在交互提示里覆盖 |
| `pre-push` 在 Windows 路径或非 bash 环境失败 | 跨平台兼容 | `#!/usr/bin/env bash` + 仅依赖 POSIX 命令；Windows 用户可改用 husky 或跳过 hook（文档说明） |
| 修改 `forge-test` SKILL 触发 `dist/` 同步检查失败 | CI 自身失败 | build 阶段执行 `bash scripts/build-dist.sh` 同步；contract 测试覆盖 |

## Out of Scope

- 不修改 GitHub workflow（`ci.yml` 保持不变）。
- 不替换 Post-Push Verify（仍作为最后兜底）。
- 不引入 husky / lint-staged 等额外依赖。
- 不为非 Forge 仓库批量改 config.md，仅修复本仓库。
- 不实现"自动补齐 frontmatter"的能力（避免 SKILL 在 build 中静默修改冻结区）。
