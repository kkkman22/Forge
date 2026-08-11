---
feature: frozen-zone-structured-feedback
layout: design
created: 2026-05-12
---

# Design Document: Frozen Zone Structured Feedback

## Overview

本 spec 把 Forge 的冻结区保护从"`exit 2` 硬阻断"升级为"结构化反馈 middleware"。核心变更：

- `PreToolUse` hook 从退出码决策改为 JSON stdout 决策
- 新增 `PostToolUse` hook 作为 defence-in-depth 兜底
- Zone_Registry 从 `.tinkerman/config.md` 单一事实源动态解析
- 结构化审计日志写 `.tinkerman/runs/`

**变更范围**：
- 重写 `scripts/hook-check-frozen.sh`
- 新增 `scripts/hook-check-frozen-post.sh`
- 新增 `scripts/zone-registry.sh`（共享解析函数）
- 修改 `hooks/hooks.json`
- 修改 `templates/config.md`（新增 guarded 示例）
- 新增 `test/hook-check-frozen.test.sh`
- 修改 `skills/forge-status/SKILL.md`（展示 frozen 事件摘要）
- 修改 `CHANGELOG.md`、`README.md`、新增 ADR

**关键不变**：`.tinkerman/` 目录结构、现有 config.md 的 YAML schema、frozen 路径规则。

## Architecture

### 执行链对比

**当前（exit 2 硬阻断）**：
```
Claude → Write tool
         │
         ▼
    PreToolUse hook
         │
    exit 2 → CC 终止工具调用，模型只看到 "Tool execution blocked"
```

**目标（结构化 middleware）**：
```
Claude → Write tool
         │
         ▼
    PreToolUse hook
         │
         ├── parse .tinkerman/config.md → Zone_Registry
         │
         ├── path ∈ Frozen_Zone → JSON deny + Frozen_Diagnostic
         │     exit 0, systemMessage + additionalContext
         │
         ├── path ∈ Guarded_Zone → 检查是否 append-only
         │     violate → deny + Frozen_Diagnostic(guarded)
         │     pass → allow
         │
         └── path not protected → allow

         (if allow, CC executes tool)

         ▼
    PostToolUse hook
         │
         ├── re-check path against Zone_Registry
         │
         ├── match Frozen_Zone → updatedToolOutput (breach warning)
         │     写 .tinkerman/runs/<date>-frozen-events.jsonl
         │
         └── no match → pass through
```

### Zone_Registry 解析流程

```
.tinkerman/config.md
     │
     ▼
parse YAML frontmatter + body sections
     │
     ├── frozen[] ← body "冻结区" 列表 + config.md 自身
     ├── guarded[] ← body "受保护区" 列表 + 修饰符
     └── status_qualifiers ← "spec.md (status: locked)" 解析
     │
     ▼
Zone_Registry (in-memory)
     │
     ├── .tinkerman/specs/*/spec.md | frozen-spec | SPEC_LOCKED | requires status: locked
     ├── .tinkerman/plans/*.md | frozen-plan | PLAN_APPROVED | requires status: approved
     ├── .tinkerman/config.md | frozen-config | CONFIG_ROOT | unconditional
     ├── .tinkerman/progress/*.md | guarded | append-only
     ├── .tinkerman/reviews/*.md | guarded | no-overwrite
     └── ...
```

### 设计决策

1. **JSON decision 优先，exit 2 保留**：`exit 0 + JSON` 是主要路径，`exit 2` 作为灾难逃生（脚本 crash、config 丢失），避免 CC 因 hook 自己的 bug 整体失败。

2. **PreToolUse + PostToolUse 互为冗余**：大多数情况下 PreToolUse 就拦住了，PostToolUse 只处理理论上的漏洞（CC 未来变更、并发工具、hook bug）。PostToolUse 不回滚，只上报。

3. **config.md 单一事实源**：Zone_Registry 不在代码里硬编码，避免改规则需要发布新版本。性能上，每次 hook 调用都 parse 一次是可接受的（<50ms）。

4. **Guarded_Zone 的 superset 判定**：对 Write 工具，比对旧内容前缀是否是新内容的前缀。这是简化模型，不处理内容插入中间位置（那种情况应该用 Edit 工具）。

5. **Feature flag 渐进放量**：`FORGE_STRUCTURED_FROZEN=1` 默认开，用户可以 `=0` 回退。6 个月后移除 flag。

## Components and Interfaces

### Component 1: Zone_Registry 共享脚本

**文件**：`scripts/zone-registry.sh`

**导出函数**：
```bash
# parse_zone_registry
# Reads .tinkerman/config.md, outputs normalized rule lines on stdout.
# Output format: <glob>\t<category>\t<reason_code>\t<qualifier>
# Cached via process env var ZONE_REGISTRY_CACHE for single-turn reuse.
parse_zone_registry() { ... }

# classify_path <absolute-path>
# Echoes: "frozen-spec|frozen-plan|frozen-config|guarded-append|guarded-no-delete|none"
# followed by reason_code.
# Uses parse_zone_registry result.
classify_path() { ... }

# emit_frozen_diagnostic <path> <category> <reason_code>
# Echoes JSON object to stdout for consumption by hook.
emit_frozen_diagnostic() { ... }
```

**config.md body 解析约定**：

```markdown
<HARD-GATE name="frozen-zone-protection">

以下文件一旦进入锁定/批准状态，AI 在 build 阶段**不得修改**：

- `.tinkerman/specs/*/spec.md`（status: locked）
- `.tinkerman/plans/*.md`（status: approved）
- `.tinkerman/config.md`

</HARD-GATE>
```

解析规则：
- 扫描 `<HARD-GATE name="frozen-zone-protection">` 到 `</HARD-GATE>`
- 匹配 `- \`<path>\`` 行，提取 path 和可选 `(status: ...)` 条件
- 同理解析"受保护区"章节（`guarded` 规则）

### Component 2: PreToolUse hook 脚本

**文件**：`scripts/hook-check-frozen.sh`

**接口**：
```bash
# stdin: JSON hook event from CC
# stdout: either legacy empty (exit 2) or JSON decision (exit 0)
```

**核心流程**（伪代码）：
```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Parse hook event from stdin
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# 2. Feature flag check
if [ "${FORGE_STRUCTURED_FROZEN:-1}" = "0" ]; then
  legacy_check_and_exit2 "$FILE_PATH"
  exit 0
fi

# 3. Only apply to write-class tools
case "$TOOL_NAME" in
  Write|Edit|MultiEdit|NotebookEdit) ;;
  Bash) handle_bash "$INPUT"; exit $? ;;
  *) exit 0 ;;
esac

# 4. Source shared zone registry
source "$(dirname "$0")/zone-registry.sh"

# 5. Classify
result=$(classify_path "$FILE_PATH")
category="${result%% *}"
reason_code="${result#* }"

# 6. Decide
case "$category" in
  frozen-*)
    diagnostic=$(emit_frozen_diagnostic "$FILE_PATH" "$category" "$reason_code")
    system_message=$(echo "$diagnostic" | jq -r '.message_md')
    additional_context=$(echo "$diagnostic" | jq -r '.suggested_alternative_path // ""')
    jq -n --arg sm "$system_message" --arg ac "$additional_context" \
      '{decision: "deny", systemMessage: $sm, additionalContext: $ac}'
    log_event "deny" "$FILE_PATH" "$category" "$reason_code"
    exit 0
    ;;
  guarded-*)
    if guarded_append_check "$FILE_PATH" "$INPUT" "$category"; then
      exit 0   # allow
    else
      # similar deny path but with guarded reason
      ...
      exit 0
    fi
    ;;
  none)
    exit 0
    ;;
esac
```

### Component 3: PostToolUse hook 脚本

**文件**：`scripts/hook-check-frozen-post.sh`

**接口**：
```bash
# stdin: JSON hook event (with tool_response)
# stdout: JSON hook_specific_output with updatedToolOutput (if breach detected)
```

**流程**：
```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
TOOL_SUCCESS=$(echo "$INPUT" | jq -r '.tool_response.success // false')

# Only re-check if tool succeeded
[ "$TOOL_SUCCESS" = "true" ] || exit 0

source "$(dirname "$0")/zone-registry.sh"
result=$(classify_path "$FILE_PATH")
category="${result%% *}"
reason_code="${result#* }"

case "$category" in
  frozen-*)
    # Defence-in-depth breach detected
    diagnostic=$(emit_frozen_diagnostic "$FILE_PATH" "$category" "$reason_code")
    warning=$(printf "⚠ Post-hoc frozen-zone violation detected\n\n%s" "$(echo "$diagnostic" | jq -r '.message_md')")
    jq -n --arg w "$warning" '{hookSpecificOutput: {updatedToolOutput: $w}}'
    log_event "breach" "$FILE_PATH" "$category" "$reason_code"
    ;;
  *)
    exit 0
    ;;
esac
```

### Component 4: hooks.json 更新

**文件**：`hooks/hooks.json`

**修改位置**：`PreToolUse` 数组的 check-frozen 条目改用 `if` 过滤。新增 `PostToolUse` 条目。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "if": "Write(.tinkerman/**)|Edit(.tinkerman/**)|MultiEdit(.tinkerman/**)",
        "hooks": [
          {
            "type": "command",
            "command": "bash scripts/hook-check-frozen.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "if": "Write(.tinkerman/**)|Edit(.tinkerman/**)|MultiEdit(.tinkerman/**)",
        "hooks": [
          {
            "type": "command",
            "command": "bash scripts/hook-check-frozen-post.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**`if` 字段的收益**：避免对写 `src/` / `test/` 等非受保护路径的工具调用触发 hook spawn（当前每次 Write/Edit 都进 hook）。

### Component 5: 审计日志

**文件**：`.tinkerman/runs/<YYYY-MM-DD>-frozen-events.jsonl`

**单行格式**：
```json
{"timestamp":"2026-05-12T08:00:00Z","session_id":"abc","tool_name":"Write","path":".tinkerman/specs/foo/spec.md","category":"frozen-spec","reason_code":"SPEC_LOCKED","decision":"pre","outcome":"denied"}
```

**轮转**：单个 `.jsonl` 超过 10 MB 时 rename 为 `.jsonl.1`。`findings_retention_days` 过期后删除。

### Component 6: `/forge status` 集成

**文件**：`skills/forge-status/SKILL.md`

**新增指令**（在现有 status 输出末尾追加）：

```markdown
## Frozen-zone 活动（最近 7 天）

运行 `bash scripts/summarize-frozen-events.sh --days=7`，读取 `.tinkerman/runs/*-frozen-events.jsonl`：

- 总命中：N
- 按 category 分组计数
- 指向完整日志 `.tinkerman/runs/`

格式示例：
```
Frozen-zone: 12 hits in last 7 days
  frozen-spec: 8 (all denied pre-tool)
  guarded-progress: 3 (2 denied, 1 allowed append)
  frozen-config: 1 (denied)
  See .tinkerman/runs/ for full log.
```
```

## Data Models

### Frozen_Diagnostic JSON schema

```json
{
  "path": "string (absolute or project-relative)",
  "category": "frozen-spec | frozen-plan | frozen-config | guarded-append-only | guarded-no-overwrite",
  "reason_code": "SPEC_LOCKED | PLAN_APPROVED | CONFIG_ROOT | ZONE_OVERRIDE_MISSING | GUARDED_APPEND_VIOLATION | GUARDED_OVERWRITE_VIOLATION",
  "reason_text": "string (human-readable, ≤200 chars)",
  "suggested_alternative_path": "string | null",
  "unlock_instruction": "string",
  "message_md": "string (rendered Markdown for systemMessage)"
}
```

### Frozen_Events.jsonl schema

| 字段 | 类型 | 必填 |
|---|---|---|
| `timestamp` | ISO 8601 UTC | 是 |
| `session_id` | string | 是（若 CC 提供，否则 `"unknown"`） |
| `tool_name` | string | 是 |
| `path` | string | 是 |
| `category` | enum | 是 |
| `reason_code` | enum | 是 |
| `decision` | `"pre" \| "post"` | 是 |
| `outcome` | `"denied" \| "allowed" \| "breached"` | 是 |
| `qualifier_result` | string | 否（status 判定详情） |

## Error Handling

| 场景 | hook 行为 |
|---|---|
| `.tinkerman/config.md` 缺失 | warning to stderr，使用 hard-coded default rules，继续 |
| `.tinkerman/config.md` 解析失败 | 同上，`reason_code = ZONE_OVERRIDE_MISSING` |
| `jq` 未安装 | exit 2（灾难逃生），stderr 提示安装 |
| `status:` 限定符需要读 spec frontmatter，但文件也被锁 | 默认按冻结处理（保守） |
| `status:` 读取超 100ms | fallback 到无 status 限定符的匹配 |
| Guarded append superset 检查失败（无法读旧文件） | 保守拒绝，记录 |
| Hook 子进程 crash | CC 视为 exit 2，工具被阻断；stderr 供 debug |
| Logging 文件被锁 | 跳过 log，不阻断决策 |

## Testing Strategy

1. **shell 测试** `test/hook-check-frozen.test.sh`：
   - mock stdin JSON 喂给脚本
   - 对每种 category 各一个测试用例
   - 测试 `status: locked` 与 `status: draft` 的差异
   - 测试 config.md 缺失时降级
   - 测试 Guarded append 允许 / 覆盖拒绝
   - 测试 feature flag `=0` 走 legacy 路径

2. **集成测试** `test/hook-check-frozen.integration.test.ts`：
   - 启动一个模拟的 CC 环境（喂 hooks.json），真跑一次 hook
   - 验证 JSON stdout 格式
   - 验证 log 文件写入

3. **Contract test** `test/contract.test.ts` 扩展：
   - `scripts/hook-check-frozen.sh` 存在且可执行
   - `scripts/zone-registry.sh` 存在
   - `hooks/hooks.json` 包含 PreToolUse + PostToolUse 条目
   - `.tinkerman/config.md` 包含 `<HARD-GATE name="frozen-zone-protection">` 块

4. **手动 e2e**：
   - 在干净 session 中设置 `FORGE_STRUCTURED_FROZEN=1`，尝试编辑 locked spec
   - 验证 CC 输出包含 Frozen_Diagnostic
   - 临时改 `.tinkerman/config.md` 加一个自定义 frozen 规则，验证即时生效
   - 设置 `FORGE_STRUCTURED_FROZEN=0`，验证 legacy 行为
   - 在旧版 CC（<2.1.121）上验证 PostToolUse 自动降级为 no-op
