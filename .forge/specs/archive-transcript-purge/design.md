---
feature: archive-transcript-purge
layout: design
created: 2026-05-12
---

# Design Document: Archive Transcript Purge

## Overview

本 spec 把 `claude project purge` 集成到 Forge 的归档流程，作为归档的可选最后一步。核心设计：**两次独立确认 + 完整审计追踪 + 严格边界保护**。

**变更范围**：
- 修改归档入口脚本（检查实际文件名：`scripts/archive-spec.sh` 或等价）
- 修改/新增 `skills/forge-archive/SKILL.md`（若现在归档是通过 skill 触发）
- 修改 `README.md`、`CHANGELOG.md`
- 新增 `.forge/decisions/<date>-cc-purge-integration.md` ADR
- 新增 `test/archive-purge.test.sh` 或等价测试

**不涉及**：`.forge/archive/` 目录结构、归档的文件移动逻辑、spec 完成判定规则。

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│            Forge_Archive_Command invoked                    │
│            (e.g. "/forge archive <slug>" or                 │
│             scripts/archive-spec.sh <slug>)                  │
└──────────────────────────┬─────────────────────────────────┘
                           │
          ┌────────────────▼──────────────────┐
          │ Phase 1: File-level archive       │
          │  - move .forge/specs/<slug>       │
          │  - move .forge/plans/<slug>.md    │
          │  - move .forge/progress/<slug>.md │
          │  → .forge/archive/<date>-<slug>/  │
          └────────────────┬──────────────────┘
                           │
          ┌────────────────▼──────────────────┐
          │ Phase 2: CC purge decision        │
          │                                   │
          │  --purge-cc=skip → exit            │
          │  --purge-cc=auto → skip prompts   │
          │  --purge-cc=ask  → interactive     │
          └────────────────┬──────────────────┘
                           │
         ┌─────────────────▼──────────────────┐
         │ Phase 3: Safety checks              │
         │  - resolve project path (git root)  │
         │  - blacklist check                  │
         │  - `claude --version` (gate)        │
         │  - CC_Purge_Available check         │
         └─────────────────┬──────────────────┘
                           │
         ┌─────────────────▼──────────────────┐
         │ Phase 4: Dry-run preview             │
         │  claude project purge <path> --dry   │
         │                                       │
         │  → display summary                    │
         │  → write Purge_Manifest (pending)    │
         │  → prompt 1 (unless --purge-cc=auto) │
         └─────────────────┬──────────────────┘
                           │
         ┌─────────────────▼──────────────────┐
         │ Phase 5: Real purge (if accepted)    │
         │  claude project purge <path> --yes  │
         │                                       │
         │  → capture output                     │
         │  → update Purge_Manifest              │
         │  → log to .forge/runs/                │
         └──────────────────────────────────────┘
```

**设计决策**：

1. **两阶段分离**：file-level archive 和 CC purge 是两个独立事务，前者成功不要求后者也成功。CC purge 失败只是 warning，不回滚 Forge 侧归档。

2. **两次确认是硬性要求**：除了显式 `--purge-cc=auto`，任何情况下执行 purge 都需要用户看到 dry-run 结果再按 y。这和 CC 自己的 `--yes` 有本质区别——Forge 要求用户基于 dry-run 信息再拍板，而不是闭眼同意。

3. **Manifest 先写后执行**：即便 purge 过程中 claude 子进程 crash，也有记录可查。

4. **路径解析使用 git root**：worktree 场景下，用户可能在 worktree 里执行归档，但 CC transcripts 是按主 repo 路径编码的。必须解析到 git root 才能正确清理。

5. **黑名单保护**：虽然 CC 自己的 `project purge` 对根路径有保护，Forge 再加一层，避免 CC 未来版本行为变化导致的灾难。

## Components and Interfaces

### Component 1: Archive_Driver 脚本

**文件**：`scripts/archive-spec.sh`（假设名；实际以 repo 现状为准）

**新增参数**：
```
用法: scripts/archive-spec.sh <slug> [--purge-cc=auto|skip|ask]
环境变量:
  FORGE_ARCHIVE_CC_PURGE_DEFAULT=skip|ask|auto  （默认: ask）

退出码:
  0  归档成功（无论 CC purge 是否执行）
  1  文件级归档失败（致命）
  2  CC purge 执行失败（归档已完成，仅 warning）
  3  参数错误
```

**新增函数**：
```bash
cc_purge_preview() {
  local project_path="$1"
  local manifest_path="$2"
  claude project purge "$project_path" --dry-run 2>&1 || {
    # CC 版本过低或 purge 子命令不存在
    echo "cc_purge_unavailable" > "$manifest_path.status"
    return 127
  }
}

cc_purge_execute() {
  local project_path="$1"
  claude project purge "$project_path" --yes
}

resolve_project_path() {
  # 处理 worktree 场景
  local common_dir
  common_dir=$(git rev-parse --git-common-dir)
  if [ "$common_dir" = ".git" ] || [ "$common_dir" = "$(git rev-parse --git-dir)" ]; then
    git rev-parse --show-toplevel
  else
    # worktree: common_dir 指向主 repo 的 .git
    dirname "$common_dir"
  fi
}

check_blacklist() {
  local path="$1"
  local home_root
  home_root=$(getent passwd "$USER" | cut -d: -f6)
  case "$path" in
    /|/tmp|/tmp/*|"$home_root"|"$home_root"/)
      echo "❌ 拒绝对敏感路径执行 purge: $path" >&2
      return 1
      ;;
  esac
}
```

### Component 2: Purge_Manifest 格式

**文件**：`.forge/archive/<YYYY-MM-DD>-<slug>/purge-manifest.json`

```json
{
  "slug": "my-spec",
  "archive_date": "2026-05-12",
  "cc_project_path": "/Users/king/code/Forge",
  "cc_purge_available": true,
  "cc_version": "2.1.138",
  "dry_run_output": "...",
  "dry_run_truncated": false,
  "user_decision": "accepted",
  "execution_output": {
    "exit_code": 0,
    "stdout": "...",
    "stderr": ""
  },
  "started_at": "2026-05-12T10:00:00Z",
  "finished_at": "2026-05-12T10:00:05Z",
  "purge_cc_flag": "ask"
}
```

**user_decision 取值**：
- `"accepted"`：两次 prompt 都接受
- `"declined_preview"`：用户拒绝了 dry-run 阶段的第一个 prompt
- `"declined_execute"`：用户看了 dry-run 但拒绝执行
- `"auto"`：`--purge-cc=auto` 直接执行
- `"skipped"`：`--purge-cc=skip` 未进入 CC purge 流程

### Component 3: SKILL 修改

**文件**：`skills/forge-archive/SKILL.md`（若存在）或归档被哪个 skill 驱动就改哪个

**新增章节**：

```markdown
### CC Transcripts 清理（可选）

归档完成后，skill 会触发归档脚本，后者支持 `--purge-cc` 选项：

- `--purge-cc=ask`（默认）：交互确认两次（dry-run 预览 → 执行）
- `--purge-cc=skip`：跳过 CC 清理
- `--purge-cc=auto`：CI 场景下自动执行（记得在 Purge_Manifest 留痕）

CC purge 清理的内容：
- `~/.claude/projects/<encoded-path>/` 下的 transcripts、tasks、file-history
- `~/.claude.json` 中该项目的 entry

不清理的内容：
- 全局 skills、agents、hooks、plugins
- 其他项目的状态
- Forge 自己的 `.forge/` 目录

如果 CC 版本低于 2.1.126，purge 能力不可用，skill 会 warning 并继续（归档本身已完成）。
```

### Component 4: 测试覆盖

**文件**：`test/archive-purge.test.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. 测试 --purge-cc=skip：不调 claude
test_purge_skip() {
  ARCHIVE_DIR=$(mktemp -d)
  claude_called=false
  export PATH="$(mktemp -d):$PATH"
  # create fake claude that sets flag
  cat > "$PATH_mock/claude" <<'EOF'
#!/bin/sh
touch /tmp/claude_was_called
EOF
  bash scripts/archive-spec.sh test-slug --purge-cc=skip
  [ ! -f /tmp/claude_was_called ] || fail "claude was called"
}

# 2. 测试 --purge-cc=auto：调 claude 两次（dry + real）
# 3. 测试黑名单拒绝
# 4. 测试 CC 版本过低
# 5. 测试 worktree 场景的 project path 解析
# 6. 测试 manifest 写入
```

## Data Models

### Purge_Manifest JSON schema

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `slug` | string | 是 | Forge spec slug |
| `archive_date` | ISO date | 是 | |
| `cc_project_path` | absolute path | 是 | |
| `cc_purge_available` | bool | 是 | CC 版本是否支持 purge |
| `cc_version` | semver string | 否 | CC 版本（`claude --version` 输出） |
| `dry_run_output` | string | 是 | stdout（可截断至 10 KB） |
| `dry_run_truncated` | bool | 是 | |
| `user_decision` | enum | 是 | 见上 |
| `execution_output` | object | 否 | 仅当 decision ∈ {accepted, auto} |
| `execution_output.exit_code` | int | 否 | |
| `execution_output.stdout` | string | 否 | 可截断 |
| `execution_output.stderr` | string | 否 | 可截断 |
| `started_at` / `finished_at` | ISO 8601 | 是 | |
| `purge_cc_flag` | enum | 是 | ask/skip/auto |

## Error Handling

| 场景 | 脚本行为 | 用户可见 |
|---|---|---|
| `git rev-parse` 失败（非 git repo） | 归档正常完成，跳过 purge，warning | "非 git 项目，跳过 CC transcripts 清理" |
| 解析到黑名单路径 | exit 2，但 file-level 归档已完成 | "❌ 拒绝对敏感路径执行 purge: $path" |
| `claude` 未安装 | 跳过 purge，manifest 记录 `cc_purge_available: false` | "claude 未安装，跳过 CC transcripts 清理" |
| `claude project purge` 不存在（旧版本） | 同上 | "CC 版本 < 2.1.126，跳过清理" |
| dry-run 返回非零 | warning，跳过 real purge | "dry-run 失败，为安全计跳过清理" |
| real purge 返回非零 | exit 2，manifest 记录 stderr | "CC purge 执行失败: <stderr>（归档已完成）" |
| 用户按 Ctrl+C | manifest 记录 `user_decision: "interrupted"` | 中断消息 |

## Testing Strategy

1. **shell 测试** `test/archive-purge.test.sh`：
   - mock `claude` 子命令的 exit code 和 stdout
   - 覆盖 skip / auto / ask 三种 flag
   - 覆盖 dry-run success + user decline 分支
   - 覆盖黑名单、CC 版本过低、非 git 场景

2. **Manifest schema 验证** `test/contract.test.ts` 扩展：
   - fixture manifest 通过 JSON schema 校验
   - 必需字段齐全

3. **Skill contract test**（若归档走 skill）：
   - SKILL.md 包含 "CC Transcripts 清理" section
   - 解释三种 flag 含义

4. **手动 e2e**：
   - 在 Forge 自己的 repo 归档一个已完成 spec，全流程
   - 验证 `~/.claude/projects/...` 确实被清理
   - 故意用旧版本 CC 跑一次，验证降级路径
