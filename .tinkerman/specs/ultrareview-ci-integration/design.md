---
feature: ultrareview-ci-integration
layout: design
created: 2026-05-12
---

# Design Document: UltraReview CI Integration

## Overview

本 spec 在 Forge 中集成 Claude Code 2.1.120+ 提供的 `claude ultrareview --json` CLI，为每个 PR 自动生成 AI 评审报告。设计分为四层：

1. **脚本层**：`scripts/run-ci-ultrareview.sh` 封装 CLI 调用、JSON 解析、落盘、exit code 处理。
2. **CI 层**：`.github/workflows/ultrareview.yml` 驱动脚本运行、上传 artifact、评论 PR。
3. **产物层**：`.tinkerman/reviews/<pr-number>-ci.md` 标准化的评审落盘格式。
4. **skill 层**：`skills/forge-review/SKILL.md` 消费 CI 产物，避免本地评审重复工作。

**变更范围**：
- 新增 `scripts/run-ci-ultrareview.sh`
- 新增 `.github/workflows/ultrareview.yml`
- 修改 `skills/forge-review/SKILL.md`（读取 CI 产物）
- 修改 `scripts/init.sh`（init 时可选启用）
- 修改 `README.md`（新增 CI AI 评审章节）
- 修改 `CHANGELOG.md`

**不涉及**：`/forge review` 本地流程的三层并行评审逻辑、`.tinkerman/reviews/` 权限模型（保持现有"受保护区"语义）。

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  PR lifecycle                            │
├─────────────────────────────────────────────────────────┤
│  push/PR → GitHub → .github/workflows/ultrareview.yml    │
│              │                                           │
│              ├── job: ultrareview                        │
│              │     1. setup node + claude code           │
│              │     2. ANTHROPIC_API_KEY from secret      │
│              │     3. run scripts/run-ci-ultrareview.sh  │
│              │     4. upload artifact                    │
│              │     5. post PR comment                    │
│              │                                           │
│              └── job: check (existing npm run check)     │
│                    — parallel, independent               │
└─────────────────────────────────────────────────────────┘

   run-ci-ultrareview.sh flow:
   ┌───────────────────────────────────────────┐
   │ 1. which claude || exit 2                 │
   │ 2. claude ultrareview $1 --json > tmp.json│
   │    exit_code=$?                           │
   │ 3. parse tmp.json → severity_counts       │
   │ 4. write .tinkerman/reviews/<n>-ci.md          │
   │    (frontmatter + summary + findings +     │
   │     raw JSON)                              │
   │ 5. if any P0 found: exit 1                 │
   │    elif exit_code != 0: exit exit_code     │
   │    else: exit 0                            │
   └───────────────────────────────────────────┘

   /forge review local consumption:
   ┌───────────────────────────────────────────┐
   │ forge-review SKILL startup:                │
   │   if exists .tinkerman/reviews/<pr>-ci.md:     │
   │     read frontmatter severity_counts       │
   │     load findings list (from section 2)    │
   │     prefix local findings matching path +  │
   │       category with [confirmed-by-ci]      │
   └───────────────────────────────────────────┘
```

**设计决策**：

1. **脚本与 workflow 分离**：脚本封装所有 Claude Code 交互与落盘逻辑，workflow 只负责环境、secret、artifact 上传。迁移到其他 CI（GitLab、Bitbucket）时只需改 workflow，脚本不动。

2. **双通道不互斥**：CI 通道（广度，每次 push 触发）和本地 `/forge review` 通道（深度，开发者主动触发）共存。通过文件后缀 `-ci.md` / `-local.md` 区分。

3. **软失败优先**：默认 rate-limit / auth 失败不阻断 CI，开发者可用 `CI_ULTRAREVIEW_STRICT=1` 升级为硬失败。理由是 `npm run check` 已经是硬闸门，ultrareview 作为增量不应降低可用性。

4. **P0 严格阻断**：只要存在 P0 finding，无论 CLI 本身 exit code 如何，wrapper 都返回 1。这是"评审发现"对"评审成功"的硬性保证。

5. **Append-only 保护区**：CI 产物走"受保护区"语义——同一个 PR 号的 `<n>-ci.md` 允许覆盖（CI 的幂等性），但不允许 CI 产物覆盖本地 `<n>-local.md`。

## Components and Interfaces

### Component 1: Review_Wrapper 脚本

**文件**：`scripts/run-ci-ultrareview.sh`

**接口**：
```
用法: scripts/run-ci-ultrareview.sh <pr-number-or-url>
环境变量:
  ANTHROPIC_API_KEY          （必需）
  CI_ULTRAREVIEW_STRICT=1    （可选，失败即阻断）
  CI_ULTRAREVIEW_TIMEOUT=900 （可选，秒，默认 900）

退出码:
  0  成功，无 P0 findings
  1  发现 P0 findings
  2  Claude Code 未安装
  其他 透传自 claude ultrareview 的 exit code
```

**核心流程**（伪代码）：
```bash
set -euo pipefail

PR_NUMBER="${1:?pr number required}"
OUT_DIR=".tinkerman/reviews"
OUT_FILE="$OUT_DIR/${PR_NUMBER}-ci.md"
TIMEOUT="${CI_ULTRAREVIEW_TIMEOUT:-900}"

command -v claude >/dev/null || { echo "claude not found"; exit 2; }

mkdir -p "$OUT_DIR"

TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

set +e
timeout "$TIMEOUT" claude ultrareview "$PR_NUMBER" --json > "$TMP_JSON"
CLI_EXIT=$?
set -e

# parse severity counts from TMP_JSON (jq)
P0_COUNT=$(jq '[.findings[] | select(.severity == "P0")] | length' "$TMP_JSON")
# ... P1/P2/P3 similar

# write OUT_FILE with frontmatter + summary + findings + raw JSON
write_markdown_artifact

# exit policy
if [ "$P0_COUNT" -gt 0 ]; then
  exit 1
fi
if [ "$CLI_EXIT" -ne 0 ]; then
  if [ "${CI_ULTRAREVIEW_STRICT:-0}" = "1" ]; then
    exit "$CLI_EXIT"
  else
    exit 0  # soft-fail
  fi
fi
exit 0
```

**错误处理**：
- `claude` 未安装 → exit 2（环境问题，不是代码问题）
- JSON 解析失败 → 写入 stub artifact，exit 0（除非 STRICT）
- 超时 → 写入 stub artifact，标记 `timeout: true`

### Component 2: CI Workflow

**文件**：`.github/workflows/ultrareview.yml`

**结构**：
```yaml
name: CI UltraReview
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write
  contents: read

jobs:
  ultrareview:
    if: ${{ secrets.ANTHROPIC_API_KEY != '' }}   # 软跳过
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # full history for diff base
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install Claude Code
        run: curl -fsSL https://claude.ai/install.sh | bash
      - name: Run UltraReview
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: bash scripts/run-ci-ultrareview.sh ${{ github.event.pull_request.number }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ultrareview-pr-${{ github.event.pull_request.number }}
          path: .tinkerman/reviews/${{ github.event.pull_request.number }}-ci.md
      - name: Comment on PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            // read artifact summary, post as comment
```

**设计点**：
- `if: ${{ secrets.ANTHROPIC_API_KEY != '' }}` 不是 YAML 合法语法，实际实现要在 step 层做 `if: env.ANTHROPIC_API_KEY != ''` 或整 job 加条件。
- `fetch-depth: 0` 保证 ultrareview 能看到 base 分支做 diff。
- 评论 PR 用 `github-script` 避免引入第三方 action。

### Component 3: Review_Artifact 格式

**文件**：`.tinkerman/reviews/<pr-number>-ci.md`

**模板**：
```markdown
---
source: "ci-ultrareview"
pr_number: 123
commit_sha: "abc123..."
branch: "feature/foo"
run_id: 456789
created_at: "2026-05-12T08:00:00Z"
severity_counts:
  P0: 0
  P1: 2
  P2: 5
  P3: 1
timeout: false
---

# UltraReview CI Report — PR #123

## Summary

AI ultra-review over commit `abc123` on branch `feature/foo`. 8 total findings.

## Findings

### P0 (0)

_无_

### P1 (2)

1. **src/foo.ts:42** — race condition in async init...
2. ...

### P2 (5)
...

### P3 (1)
...

## Raw JSON

```json
{ ... 原始 ultrareview --json 输出 ... }
```
```

**解析约定**：消费方（forge-review SKILL）只解析 frontmatter 和 `## Findings` 下的严重度分组。`## Raw JSON` 是审计用的完整快照。

### Component 4: Forge_Review_SKILL 修改

**文件**：`skills/forge-review/SKILL.md`

**修改位置 1**：Workflow 开头新增"CI 证据接入"步骤：

```markdown
### 0. CI 证据接入（新增）

开始评审前，检查是否存在 CI ultrareview 产物：

```bash
PR_NUMBER=$(git log -1 --format=%s | grep -oE '#[0-9]+' | tr -d '#')
CI_REVIEW=".tinkerman/reviews/${PR_NUMBER}-ci.md"
[ -f "$CI_REVIEW" ] && cat "$CI_REVIEW" | head -100
```

如果存在：
- 读取 frontmatter 的 `severity_counts`
- 读取 `## Findings` 各严重度列表
- 在本次评审的 summary 中首行注明："CI 评审已覆盖 N 条 finding，本地评审将补充对齐 spec 与 ADR 的深度检查"

如果不存在：按原有流程进行，不报警告。
```

**修改位置 2**：Finding 输出格式增加 `[confirmed-by-ci]` 前缀规则：

```markdown
当本地发现的 finding 与 CI 产物中的 finding 匹配（file_path 与 category 相同）时，
输出格式为：

- **[confirmed-by-ci] src/foo.ts:42** — <本地描述>

不匹配的本地 finding 不加前缀。
```

### Component 5: init.sh 修改

**文件**：`scripts/init.sh`

**修改位置**：安全级别收集之后、config.md 生成之前，新增交互步骤：

```bash
echo ""
echo "是否启用 CI AI 评审？"
echo "  启用后会安装 .github/workflows/ultrareview.yml，"
echo "  每次 PR 自动触发 claude ultrareview。"
echo "  需要在 GitHub 仓库 secrets 中配置 ANTHROPIC_API_KEY。"
read -p "启用？[y/N] " enable_ultrareview

if [[ "$enable_ultrareview" =~ ^[Yy] ]]; then
  mkdir -p .github/workflows
  cp "$FORGE_ROOT/templates/ultrareview.yml" .github/workflows/ultrareview.yml
  echo "✓ 已安装 .github/workflows/ultrareview.yml"
  echo "⚠ 请在 GitHub 仓库设置中添加 secret: ANTHROPIC_API_KEY"
fi
```

**新增模板文件**：`templates/ultrareview.yml`（workflow 原始模板）。

## Data Models

**Review_Artifact frontmatter schema**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `source` | `"ci-ultrareview"` | 是 | 固定值 |
| `pr_number` | int | 是 | PR 编号 |
| `commit_sha` | string | 是 | 被评审 commit |
| `branch` | string | 是 | PR 源分支 |
| `run_id` | int | 是 | GitHub Actions run id |
| `created_at` | ISO 8601 string | 是 | UTC 时间 |
| `severity_counts.P0..P3` | int | 是 | 各级 finding 数 |
| `timeout` | bool | 否 | 是否因超时产生 stub |
| `partial` | bool | 否 | 是否因失败产生 stub |

## Error Handling

| 场景 | Review_Wrapper 行为 | CI_Workflow 行为 |
|---|---|---|
| `claude` 未安装 | exit 2，打印诊断 | 整个 job 失败 |
| `ANTHROPIC_API_KEY` 缺失 | n/a（workflow 层已跳过） | step skipped，warning |
| Rate limit / auth 失败 | 写 stub artifact，exit 0（STRICT 时 exit 非 0） | 非 STRICT 时 workflow 通过 |
| JSON 解析失败 | 写 stub artifact，exit 0 | 同上 |
| 超时（> 15min） | 写 stub artifact（timeout: true），exit 0 | 同上 |
| 存在 P0 finding | exit 1 | workflow fail，PR comment 告警 |
| PR number 不合法（非正整数） | exit 3 | workflow fail |

## Testing Strategy

由于本 spec 主要是 CI 集成，大部分测试在 CI 层做 e2e 验证，但仍需本地单元测试覆盖 wrapper 脚本逻辑：

1. **scripts/run-ci-ultrareview.sh 的 shell 测试**（新增 `test/run-ci-ultrareview.test.sh`）：
   - mock `claude` 为返回固定 JSON 的 shell 函数
   - 验证 artifact 格式、P0 exit code、timeout 分支、STRICT 分支

2. **`.tinkerman/reviews/*-ci.md` 格式的 contract test**（扩展 `test/contract.test.ts`）：
   - 用 fixture 验证 frontmatter schema
   - 验证必需章节存在

3. **skills/forge-review 的 contract test**（扩展 `test/contract.skills.test.ts`）：
   - 验证 SKILL.md 包含"CI 证据接入"步骤和 `[confirmed-by-ci]` 规则说明

4. **workflow 语法校验**：`actionlint` 或在 CI 中 `act` 干跑。

5. **手动 e2e**：开发者在 fork 上建一个 test PR，观察完整流程。
