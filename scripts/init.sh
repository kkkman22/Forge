#!/usr/bin/env bash
# category: user-facing
# ============================================================================
# forge init — Forge 项目初始化脚本
#
# 功能：
#   1. 交互式收集项目配置（名称、技术栈、安全级别）
#   2. 创建完整的 .forge/ 目录结构
#   3. 复制 7 个 Subagent 角色文件到 .claude/agents/
#   4. 生成 CLAUDE.md 项目宪法
#   5. 写入 .forge/config.md
#   6. 配置 forge-context MCP server（如果可用）
#
# 用法：
#   chmod +x forge/scripts/init.sh
#   ./forge/scripts/init.sh [--pack <name>] [--pack <name2>]
# ============================================================================

set -euo pipefail

# ---------- CC Version Check ----------
check_cc_version() {
  local min_version="2.1.121"
  local recommended_version="2.1.138"
  local version_output
  version_output=$(claude --version 2>/dev/null || true)

  if [ -z "$version_output" ]; then
    warn "Cannot detect Claude Code version. Recommended >= $recommended_version"
    return 0
  fi

  local current
  current=$(echo "$version_output" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)

  if [ -z "$current" ]; then
    warn "Cannot parse Claude Code version from: $version_output. Recommended >= $recommended_version"
    return 0
  fi

  if ! printf '%s\n%s\n' "$min_version" "$current" | LC_ALL=C sort -V -C 2>/dev/null; then
    error "Claude Code version too old: $current < $min_version"
    echo "   Please upgrade: https://docs.anthropic.com/en/docs/claude-code"
    return 1
  fi

  if ! printf '%s\n%s\n' "$recommended_version" "$current" | LC_ALL=C sort -V -C 2>/dev/null; then
    warn "Claude Code version $current is below recommended $recommended_version. Some features may not work."
  fi

  return 0
}

check_cc_version || exit 1

# ---------- Parse --pack / --recipe flags ----------
PACKS=()
RECIPES=()
remaining_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pack)
      if [[ -z "${2:-}" ]]; then
        echo "❌ --pack requires a pack name" >&2; exit 1
      fi
      PACKS+=("$2"); shift 2
      ;;
    --recipe)
      if [[ -z "${2:-}" ]]; then
        echo "❌ --recipe requires a name" >&2; exit 1
      fi
      RECIPES+=("$2"); shift 2
      ;;
    --non-interactive)
      # Consumed for test/non-interactive invocations; recipe mode exits before
      # any prompt regardless, so no state needs to be stored.
      shift
      ;;
    --help|-h)
      echo "Usage: scripts/init.sh [OPTIONS]"
      echo ""
      echo "Initialize a Forge project in the current directory."
      echo "Creates .forge/ structure, .claude/ agents, CLAUDE.md, config, and hooks."
      echo ""
      echo "Options:"
      echo "  --pack <name>     Enable a domain pack during init (repeatable)"
      echo "                    Available: pms"
      echo "  --recipe <name>   Generate a test-stack recipe into THIS project (ADR-0006 Req6)"
      echo "                    Available: vue3-vitest-msw, react-vitest-msw"
      echo "                    Does NOT auto-install deps; prints the install command."
      echo "  --non-interactive Skip prompts (use defaults)."
      echo "  --help, -h        Show this help message"
      echo ""
      echo "Interactive: prompts for project name, tech stack, and security level."
      exit 0
      ;;
    *)
      remaining_args+=("$1"); shift
      ;;
  esac
done
set -- "${remaining_args[@]+"${remaining_args[@]}"}"

# ---------- 颜色定义 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ---------- 工具函数 ----------
info()    { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✅${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠️${NC} $1"; }
error()   { echo -e "${RED}❌${NC} $1"; }

# ---------- 检测 Forge 库路径 ----------
# 支持四种安装位置（plugin > clone > global > fail）
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

FORGE_ROOT="$(detect_forge_root)"
PROJECT_ROOT="$(pwd)"

# ============================================================================
# Recipe generation (ADR-0006 Req6) — runs early when --recipe is passed,
# independent of the interactive init flow. Generates test-stack scaffold
# (MSW/vitest) into the USER project; Forge installs nothing (R6.5).
# ============================================================================
if [[ ${#RECIPES[@]} -gt 0 ]]; then
  RECIPES_BASE="${FORGE_ROOT}/templates/recipes"

  # Detect the project's package manager for the install hint (Req6 AC10).
  detect_pkg_manager() {
    if [[ -f "${PROJECT_ROOT}/pnpm-lock.yaml" ]]; then echo "pnpm"
    elif [[ -f "${PROJECT_ROOT}/yarn.lock" ]]; then echo "yarn"
    elif [[ -f "${PROJECT_ROOT}/package-lock.json" ]]; then echo "npm"
    elif [[ -f "${PROJECT_ROOT}/bun.lockb" ]]; then echo "bun"
    else
      # fall back to packageManager field, else npm
      local pm=""
      if [[ -f "${PROJECT_ROOT}/package.json" ]]; then
        pm=$(node -e "try{console.log(require('./package.json').packageManager||'')}catch{}" 2>/dev/null || true)
      fi
      case "$pm" in
        pnpm*) echo "pnpm" ;; yarn*) echo "yarn" ;; npm*) echo "npm" ;;
        *) echo "npm" ;;
      esac
    fi
  }

  PKG_MANAGER="$(detect_pkg_manager)"

  for recipe_name in "${RECIPES[@]}"; do
    recipe_dir="${RECIPES_BASE}/${recipe_name}"
    # Req6 AC12: unknown recipe → non-zero exit + list available.
    if [[ ! -d "$recipe_dir" ]]; then
      error "recipe '${recipe_name}' not found in templates/recipes/."
      echo "  Available recipes:" >&2
      if [[ -d "$RECIPES_BASE" ]]; then
        for d in "$RECIPES_BASE"/*/; do
          [[ -d "$d" ]] && echo "  - $(basename "$d")" >&2
        done
      fi
      exit 1
    fi

    info "Generating recipe '${recipe_name}' into ${PROJECT_ROOT}..."
    conflicts=()
    # Copy each file, skipping + reporting conflicts (Req6 AC13).
    while IFS= read -r -d '' f; do
      rel="${f#${recipe_dir}/}"
      dest="${PROJECT_ROOT}/${rel}"
      if [[ -e "$dest" ]]; then
        # conflict → skip, report, hint manual merge (AC13)
        conflicts+=("$rel")
        continue
      fi
      mkdir -p "$(dirname "$dest")"
      cp "$f" "$dest"
    done < <(find "$recipe_dir" -type f -not -name '.gitkeep' -print0)

    # Install hint (Req6 AC9): print the command, never execute it.
    snippet=""
    if [[ -f "$recipe_dir/package.devDeps.snippet" ]]; then
      snippet=$(tr '\n' ' ' < "$recipe_dir/package.devDeps.snippet" | sed 's/  */ /g' | sed 's/^ //;s/ $//')
    fi
    case "$PKG_MANAGER" in
      pnpm|yarn|bun) hint="${PKG_MANAGER} add -D ${snippet}" ;;
      *) hint="npm install -D ${snippet}" ;;
    esac

    success "recipe '${recipe_name}' generated."
    echo ""
    echo -e "  ${BLUE}Next →${NC} install the devDependencies yourself (Forge will NOT):"
    echo -e "      ${CYAN}${hint}${NC}"
    if [[ ${#conflicts[@]} -gt 0 ]]; then
      warn "The following files already existed and were SKIPPED (manual merge needed):"
      for c in "${conflicts[@]}"; do echo "    - ${c}"; done
      echo "  Compare your existing config against the recipe's — incompatible combos"
      echo "  (e.g. jsdom vs happy-dom) can break the example tests."
    fi
  done

  # --recipe is a dedicated mode: generate and exit (no full interactive init).
  exit 0
fi

# ---------- 欢迎信息 ----------
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         🔥 Forge — 项目初始化            ║${NC}"
echo -e "${CYAN}║   统一 AI 编码工作流框架                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ---------- 检查是否已初始化 ----------
if [[ -d "${PROJECT_ROOT}/.forge" ]]; then
  warn ".forge/ 目录已存在。重新初始化将覆盖配置文件。"
  read -rp "是否继续？(y/N) " confirm
  if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
    info "已取消初始化。"
    exit 0
  fi
fi

# ============================================================================
# Step 1：交互式收集配置
# ============================================================================
echo ""
info "Step 1/7：收集项目信息"
echo ""

# --- 项目名称（自动检测） ---
default_name="$(basename "${PROJECT_ROOT}")"
read -rep "$(echo -e "${BLUE}?${NC}") 项目名称 [${default_name}]: " project_name
project_name="${project_name:-${default_name}}"

# --- 技术栈 ---
echo ""
echo "  常见技术栈组合："
echo "    1) TypeScript + React + Node.js"
echo "    2) TypeScript + Vue + Node.js"
echo "    3) Python + FastAPI"
echo "    4) Python + Django"
echo "    5) Go + Gin"
echo "    6) Java + Spring Boot"
echo "    7) 自定义"
echo ""
read -rp "$(echo -e "${BLUE}?${NC}") 选择技术栈 [1-7] 或直接输入: " stack_choice

case "${stack_choice}" in
  1|"") tech_stack="TypeScript, React, Node.js" ;;
  2)    tech_stack="TypeScript, Vue, Node.js" ;;
  3)    tech_stack="Python, FastAPI" ;;
  4)    tech_stack="Python, Django" ;;
  5)    tech_stack="Go, Gin" ;;
  6)    tech_stack="Java, Spring Boot" ;;
  7)
    read -rep "$(echo -e "${BLUE}?${NC}") 请输入技术栈（逗号分隔）: " tech_stack
    ;;
  *)    tech_stack="${stack_choice}" ;;
esac

# --- 安全级别 ---
echo ""
echo "  安全级别："
echo "    1) 标准 — 常规 Web 应用（默认）"
echo "    2) 高 — 涉及支付、个人信息"
echo "    3) 最高 — 金融、医疗、政府系统"
echo ""
read -rp "$(echo -e "${BLUE}?${NC}") 安全级别 [1-3]: " security_choice

case "${security_choice}" in
  1|"") security_level=1; security_label="标准" ;;
  2)    security_level=2; security_label="高" ;;
  3)    security_level=3; security_label="最高" ;;
  *)    security_level=1; security_label="标准" ;;
esac

# --- CI AI 评审 ---
echo ""
echo "  CI AI 评审（claude ultrareview）："
echo "    启用后会在 PR 推送时自动触发 AI 代码评审。"
echo "    需要在 GitHub 仓库 Settings > Secrets 中添加 ANTHROPIC_API_KEY。"
echo ""
read -rp "$(echo -e "${BLUE}?${NC}") 是否启用 CI AI 评审？[y/N] " enable_ultrareview

if [[ "$enable_ultrareview" =~ ^[Yy] ]]; then
  FORGE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  mkdir -p .github/workflows
  if [ -f "$FORGE_ROOT/templates/ultrareview.yml" ]; then
    cp "$FORGE_ROOT/templates/ultrareview.yml" .github/workflows/ultrareview.yml
    echo "  ✓ 已安装 .github/workflows/ultrareview.yml"
    echo "  ⚠ 请在 GitHub 仓库 Settings > Secrets > Actions 中添加 ANTHROPIC_API_KEY"
  else
    echo "  ⚠ templates/ultrareview.yml 不存在，跳过安装"
  fi
fi

# --- CI 检查命令 ---
echo ""
echo "  CI 检查命令（ci_check_command）："
echo "    运行所有 CI 检查的单条命令（如 npm run check）。"
echo "    build 全量测试和 test 验证清单将使用此命令，确保本地验证与 CI 一致。"
echo "    如果留空，将按 verify_commands 列表逐条执行。"
echo ""
detected_default="$(node scripts/suggest-ci-command.mjs 2>/dev/null || echo "")"
if [ -n "$detected_default" ]; then
  echo "    检测到 package.json 中已定义：$detected_default"
  read -rep "$(echo -e "${BLUE}?${NC}") CI 检查命令 [$detected_default]: " ci_check_cmd
  ci_check_cmd="${ci_check_cmd:-$detected_default}"
else
  read -rep "$(echo -e "${BLUE}?${NC}") CI 检查命令（留空跳过）: " ci_check_cmd
fi

# ---------- 输入清洗（防止 shell 注入） ----------
# 移除换行符和 shell 元字符
sanitize() {
  printf '%s' "$1" | tr -d '\n\r' | sed 's/[`$|;&!\\]//g' | sed "s/['\"]//g"
}
project_name="$(sanitize "${project_name}")"
tech_stack="$(sanitize "${tech_stack}")"
ci_check_cmd="$(sanitize "${ci_check_cmd}")"

echo ""
success "配置确认："
echo "  项目名称：${project_name}"
echo "  技术栈：  ${tech_stack}"
echo "  安全级别：${security_label}（Level ${security_level}）"
echo "  CI 检查命令：${ci_check_cmd:-（未配置，将使用 verify_commands）}"
echo ""

if [[ -z "${project_name}" ]]; then
  error "项目名称清洗后为空，请使用合法字符（字母、数字、连字符、下划线）。"
  exit 1
fi

# ============================================================================
# Step 2：创建 .forge/ 目录结构
# ============================================================================
info "Step 2/7：创建 .forge/ 目录结构"

directories=(
  ".forge"
  ".forge/decisions"
  ".forge/specs"
  ".forge/plans"
  ".forge/findings"
  ".forge/progress"
  ".forge/reviews"
  ".forge/knowledge"
  ".forge/knowledge/solutions"
  ".forge/knowledge/sessions"
  ".forge/knowledge/patterns"
  ".forge/debug"
  ".forge/archive"
  ".forge/handoffs"
)

for dir in "${directories[@]}"; do
  mkdir -p "${PROJECT_ROOT}/${dir}"
done

# --- 从模板复制 metrics.md 和 tool-health.md ---
if [[ -f "${FORGE_ROOT}/templates/metrics.md" ]]; then
  sed "s/YYYY-MM-DD/$(date +%Y-%m-%d)/g" \
    "${FORGE_ROOT}/templates/metrics.md" > "${PROJECT_ROOT}/.forge/knowledge/metrics.md"
fi

if [[ -f "${FORGE_ROOT}/templates/tool-health.md" ]]; then
  sed "s/YYYY-MM-DD/$(date +%Y-%m-%d)/g" \
    "${FORGE_ROOT}/templates/tool-health.md" > "${PROJECT_ROOT}/.forge/knowledge/tool-health.md"
fi

# --- 写入 config.md ---
init_date="$(date +%Y-%m-%d)"

# --- Copy evolved-rules.md template ---
if [[ -f "${FORGE_ROOT}/templates/evolved-rules.md" ]]; then
  sed -e "s/{{init_date}}/${init_date}/g" \
      -e "s/{{max_rules}}/15/g" \
    "${FORGE_ROOT}/templates/evolved-rules.md" > "${PROJECT_ROOT}/.forge/knowledge/evolved-rules.md"
fi

# --- Copy rule-changelog.md template ---
if [[ -f "${FORGE_ROOT}/templates/rule-changelog.md" ]]; then
  sed "s/{{init_date}}/${init_date}/g" \
    "${FORGE_ROOT}/templates/rule-changelog.md" > "${PROJECT_ROOT}/.forge/knowledge/rule-changelog.md"
fi

# --- Copy ADR template (idempotent: don't overwrite existing) ---
if [[ -f "${FORGE_ROOT}/templates/ADR-TEMPLATE.md" ]]; then
  if [[ ! -f "${PROJECT_ROOT}/.forge/decisions/ADR-TEMPLATE.md" ]]; then
    cp "${FORGE_ROOT}/templates/ADR-TEMPLATE.md" \
      "${PROJECT_ROOT}/.forge/decisions/ADR-TEMPLATE.md"
  fi
fi

# --- Copy initial adr-index.md (idempotent: don't overwrite existing) ---
if [[ -f "${FORGE_ROOT}/templates/adr-index.md" ]]; then
  if [[ ! -f "${PROJECT_ROOT}/.forge/knowledge/adr-index.md" ]]; then
    cp "${FORGE_ROOT}/templates/adr-index.md" \
      "${PROJECT_ROOT}/.forge/knowledge/adr-index.md"
  fi
fi

# --- Copy sandbox.json template (idempotent: don't overwrite existing) ---
if [[ -f "${FORGE_ROOT}/templates/sandbox.json" ]]; then
  if [[ ! -f "${PROJECT_ROOT}/.forge/sandbox.json" ]]; then
    cp "${FORGE_ROOT}/templates/sandbox.json" \
      "${PROJECT_ROOT}/.forge/sandbox.json"
    echo "  ✓ 已安装 .forge/sandbox.json（沙箱策略配置，默认全部允许）"
  fi
fi

# --- Copy triage templates (idempotent) + ensure state dir ---
mkdir -p "${PROJECT_ROOT}/.forge/state"
if [[ -f "${FORGE_ROOT}/templates/triage-inbox.md" ]]; then
  if [[ ! -f "${PROJECT_ROOT}/.forge/triage-inbox.md" ]]; then
    cp "${FORGE_ROOT}/templates/triage-inbox.md" \
      "${PROJECT_ROOT}/.forge/triage-inbox.md"
  fi
fi
if [[ -f "${FORGE_ROOT}/templates/triage-state.json" ]]; then
  if [[ ! -f "${PROJECT_ROOT}/.forge/state/triage-state.json" ]]; then
    cp "${FORGE_ROOT}/templates/triage-state.json" \
      "${PROJECT_ROOT}/.forge/state/triage-state.json"
  fi
fi

# --- Copy checkpoint template (idempotent) — regenerative-checkpoint R1 ---
# checkpoint.md 是再生式 checkpoint 的结构化载体，compact 时由 PostCompact hook
# 读取并预算化注入。缺失时 PostCompact 降级到 grep 拼 progress fallback。
if [[ -f "${FORGE_ROOT}/templates/checkpoint.md" ]]; then
  if [[ ! -f "${PROJECT_ROOT}/.forge/checkpoint.md" ]]; then
    cp "${FORGE_ROOT}/templates/checkpoint.md" \
      "${PROJECT_ROOT}/.forge/checkpoint.md"
  fi
fi

# 将技术栈转为 YAML 数组格式
IFS=',' read -ra stack_array <<< "${tech_stack}"
stack_yaml=""
for item in "${stack_array[@]}"; do
  trimmed="$(echo "${item}" | xargs)"
  stack_yaml="${stack_yaml}  - \"${trimmed}\"\n"
done

cat > "${PROJECT_ROOT}/.forge/config.md" << CONFIGEOF
---
project: "${project_name}"
stack:
$(printf '%b' "${stack_yaml}" | sed '/^$/d')
security_level: ${security_level}
knowledge_limit: 20
ci_check_command: "${ci_check_cmd}"
learn:
  enabled: false              # 只控制 --install；不影响手动 /forge learn 或 /forge learn --deep
  cron: "0 9 * * 1"           # 用户自定义（示例：每周一 9 点跑 --deep 收敛）
  interval_days: 7            # cron 触发最小间隔（防抖，对齐 installCronSkill）
  deep_interval_days: 7       # --deep 对账最近 N 天的轨迹
  deep_max_lines: 200         # 单个 knowledge 文件行数上限（收敛密度约束）
  deep_max_bytes: 10240       # 单个 knowledge 文件字节上限（10KB）
triage:
  enabled: false
  cron: "0 9 * * *"
  sources: [jira-sprint, bitbucket-pr, bitbucket-branch, git]
  stale_days: 5
  assignee: ""
  mcp:
    jira_tools:
      get_sprint_issues: "jira_get_sprint_issues"
      search: "jira_search"
    bitbucket_tools:
      list_prs: ""
      get_pr: ""
  high_risk_globs:
    - "*.vue"
    - "*.tsx"
    - "*.jsx"
    - "src/**/route*"
    - "src/**/server*"
  behavioral_diff_threshold: 100
$(if [[ ${#PACKS[@]} -gt 0 ]]; then
  echo "packs:"
  for p in "${PACKS[@]}"; do echo "  - ${p}"; done
fi)
$(if [[ "${bday_cutoff:-}" ]]; then
  echo "business_day_cutoff_hour: ${bday_cutoff}"
  echo "business_day_timezone: \"${bday_tz}\""
fi)
---

# 项目配置

- **项目名称**：${project_name}
- **技术栈**：${tech_stack}
- **安全级别**：${security_label}（Level ${security_level}）
- **知识库上限**：20
- **初始化时间**：${init_date}
${ci_check_cmd:+
## CI 检查命令

build 阶段的全量测试和 test 阶段的验证清单必须使用以下命令，不得自行拼凑：

\`\`\`bash
${ci_check_cmd}
\`\`\`
}
## 状态文件保护分区

\`.forge/\` 目录下的文件按修改权限分为三个区域：

### 冻结区（Frozen）— AI 不可修改

以下文件一旦进入锁定/批准状态，AI 在 build 阶段**不得修改**，除非用户明确解锁：

- \`.forge/specs/*/spec.md\`（status: locked）
- \`.forge/plans/*.md\`（status: approved）
- \`.forge/config.md\`

### 受保护区（Guarded）— AI 可追加，不可删除或覆盖

以下文件 AI 可以追加内容，但不得删除已有内容或覆盖文件（维护清理操作除外）：

- \`.forge/progress/*.md\`（只能标记任务完成，不能删除任务或修改已完成的记录）
- \`.forge/reviews/*.md\`（只能写入新评审，不能修改已有评审结果）
- \`.forge/knowledge/instincts.md\`（只能追加或更新置信度，不能删除已有模式，除非维护清理）
- \`.forge/knowledge/known-failures.md\`（只能追加或更新，不能删除已有失败模式，除非维护清理）
- \`.forge/knowledge/solutions/*.md\`（只能追加或合并，不能随意删除，除非维护清理）

### 开放区（Open）— AI 可自由修改

以下文件 AI 可以自由创建和修改：

- \`.forge/status.md\`（状态更新）
- \`.forge/decisions/*.md\`（决策文档）
- \`.forge/findings/*.md\`（研究发现）
- \`.forge/debug/*.md\`（调试记录）
- \`.forge/knowledge/sessions/*.md\`（会话上下文）
- \`.forge/knowledge/metrics.md\`（指标追踪）
- \`.forge/knowledge/tool-health.md\`（工具健康度）
- \`.forge/knowledge/skill-feedback.md\`（SKILL 反馈）
CONFIGEOF

# --- 写入 status.md ---
cat > "${PROJECT_ROOT}/.forge/status.md" << STATUSEOF
---
current_task: ""
tier: ""
phase: ""
updated: "${init_date} $(date +%H:%M)"
---

# 项目状态

尚未开始任何任务。使用 \`/forge\` 开始第一个任务。
STATUSEOF

# --- 写入 instincts.md ---
cat > "${PROJECT_ROOT}/.forge/knowledge/instincts.md" << INSTINCTSEOF
---
updated: "${init_date}"
---

# 经验模式库

尚未积累经验模式。完成任务后运行 \`/forge learn\` 沉淀经验。
INSTINCTSEOF

# --- 写入 known-failures.md ---
cat > "${PROJECT_ROOT}/.forge/knowledge/known-failures.md" << FAILURESEOF
---
updated: "${init_date}"
---

# 已知失败模式

尚未记录失败模式。当 \`/forge debug\` 发现反复出现的失败时，会自动记录到此文件。

<!-- 格式示例：
### 模块导入路径在 monorepo 中解析失败

**模式**：使用相对路径导入跨 package 的模块时，tsc 通过但运行时报 MODULE_NOT_FOUND
**触发条件**：monorepo + TypeScript path aliases + vitest
**根因**：vitest 不读取 tsconfig paths，需要配置 vite resolve.alias
**解决方案**：在 vitest.config.ts 中添加 resolve.alias 映射
**首次发现**：2025-01-15
**出现次数**：3
**置信度**：0.8
-->
FAILURESEOF

success ".forge/ 目录结构创建完成"

# ============================================================================
# Step 3：复制 7 个 Subagent 角色文件
# ============================================================================
info "Step 3/7：复制 Agent 角色文件到 .claude/agents/"

mkdir -p "${PROJECT_ROOT}/.claude/agents"

agent_files=(
  "product.md"
  "architect.md"
  "security.md"
  "designer.md"
  "spec-check.md"
  "quality-check.md"
  "security-check.md"
)

for agent_file in "${agent_files[@]}"; do
  if [[ -f "${FORGE_ROOT}/agents/${agent_file}" ]]; then
    cp "${FORGE_ROOT}/agents/${agent_file}" "${PROJECT_ROOT}/.claude/agents/${agent_file}"
  else
    warn "未找到 ${agent_file}，跳过"
  fi
done

success "7 个 Agent 角色文件已复制"

# --- Install atomic rules (idempotent: don't overwrite existing) ---
if echo "${tech_stack}" | grep -qi "typescript\|javascript"; then
  rules_dir="${PROJECT_ROOT}/rules"
  mkdir -p "${rules_dir}"

  rule_files=(
    "typescript-exhaustive-switch.md"
    "no-inline-imports.md"
    "no-any-cast.md"
  )

  installed=0
  for rule_file in "${rule_files[@]}"; do
    if [[ -f "${FORGE_ROOT}/rules/${rule_file}" ]]; then
      if [[ ! -f "${rules_dir}/${rule_file}" ]]; then
        cp "${FORGE_ROOT}/rules/${rule_file}" "${rules_dir}/${rule_file}"
        installed=$((installed + 1))
      fi
    fi
  done

  if [[ ${installed} -gt 0 ]]; then
    success "${installed} 条原子规则已安装到 rules/"
  else
    info "rules/ 目录中已存在所有规则，跳过"
  fi
fi

# --- 复制 Command 文件 ---
mkdir -p "${PROJECT_ROOT}/.claude/commands"
if [[ -f "${FORGE_ROOT}/commands/forge.md" ]]; then
  cp "${FORGE_ROOT}/commands/forge.md" "${PROJECT_ROOT}/.claude/commands/forge.md"
  success "Forge Command 入口已复制到 .claude/commands/"
else
  warn "未找到 commands/forge.md，跳过"
fi

# ============================================================================
# Step 4：生成 CLAUDE.md 项目宪法
# ============================================================================
info "Step 4/7：生成 CLAUDE.md 项目宪法"

if [[ -f "${FORGE_ROOT}/templates/CLAUDE.md" ]]; then
  # Use awk instead of sed to avoid issues with special characters in user input
  awk \
    -v pname="${project_name}" \
    -v tstack="${tech_stack}" \
    -v slevel="${security_label}（Level ${security_level}）" \
    -v klimit="20" \
    -v idate="${init_date}" \
    '{
      gsub(/\{\{project_name\}\}/, pname);
      gsub(/\{\{tech_stack\}\}/, tstack);
      gsub(/\{\{security_level\}\}/, slevel);
      gsub(/\{\{knowledge_limit\}\}/, klimit);
      gsub(/\{\{init_date\}\}/, idate);
      print
    }' \
    "${FORGE_ROOT}/templates/CLAUDE.md" > "${PROJECT_ROOT}/CLAUDE.md"
  success "CLAUDE.md 项目宪法已生成"
else
  warn "未找到 CLAUDE.md 模板，跳过"
fi

# ============================================================================
# Step 5：安装 Hooks 到 .claude/settings.json
# ============================================================================
info "Step 5/7：安装 Forge Hooks"

settings_file="${PROJECT_ROOT}/.claude/settings.json"
hooks_source="${FORGE_ROOT}/hooks/hooks.json"

if [[ -f "${hooks_source}" ]]; then
  if [[ -f "${settings_file}" ]]; then
    # settings.json already exists — check if hooks are already present
    if grep -q '"hooks"' "${settings_file}" 2>/dev/null; then
      warn ".claude/settings.json 已包含 hooks 配置，跳过（避免覆盖）"
    else
      # Attempt to merge hooks into existing settings.json using Node.js
      if command -v node &>/dev/null; then
        if node -e "
          const fs = require('fs');
          const settings = JSON.parse(fs.readFileSync('${settings_file}', 'utf-8'));
          const hooks = JSON.parse(fs.readFileSync('${hooks_source}', 'utf-8'));
          settings.hooks = hooks.hooks;
          // Merge env from hooks.json (don't overwrite existing values)
          if (hooks.env) {
            settings.env = { ...hooks.env, ...(settings.env || {}) };
          }
          fs.writeFileSync('${settings_file}', JSON.stringify(settings, null, 2) + '\n');
        " 2>/dev/null; then
          success "Forge Hooks 已合并到 .claude/settings.json"
        else
          warn "无法自动合并 hooks 配置到 .claude/settings.json。请手动操作："
          echo ""
          echo "  1. 打开 .claude/settings.json"
          echo "  2. 在文件的 JSON 对象中添加或合并以下 \"hooks\" 配置："
          echo ""
          if [[ -f "${hooks_source}" ]]; then
            # Pretty-print just the hooks value from hooks.json
            node -e "
              const hooks = JSON.parse(require('fs').readFileSync('${hooks_source}', 'utf-8'));
              const snippet = { hooks: hooks.hooks };
              console.log(JSON.stringify(snippet, null, 2));
            " 2>/dev/null || cat "${hooks_source}"
          fi
          echo ""
          echo "  3. 确保合并后的文件是合法的 JSON 格式"
          echo "  4. 保存文件"
          echo ""
        fi
      else
        warn "未检测到 node 命令，无法自动合并 hooks 配置。请手动操作："
        echo ""
        echo "  1. 打开 .claude/settings.json"
        echo "  2. 在文件的 JSON 对象中添加或合并以下 \"hooks\" 配置："
        echo ""
        echo "     （hooks 内容请参考 ${hooks_source} 文件）"
        echo ""
        echo "  3. 确保合并后的文件是合法的 JSON 格式"
        echo "  4. 保存文件"
        echo ""
      fi
    fi
  else
    # No settings.json — create it with hooks
    mkdir -p "${PROJECT_ROOT}/.claude"
    cp "${hooks_source}" "${settings_file}"
    success "Forge Hooks 已安装到 .claude/settings.json"
  fi
else
  warn "未找到 hooks.json，跳过 Hooks 安装"
fi

# ============================================================================
# Step 6：配置 forge-context MCP Server（智能 diff 截断）
# ============================================================================
info "Step 6/7：forge-context MCP（智能 diff 截断）"
echo ""
echo "forge-context MCP Server 配置到项目的 .mcp.json（项目级，不影响其他项目）。"
echo ""
echo "为什么需要："
echo "  • Token 消耗：spec-check 单次评审 700K+ → <200K（19 文件变更实测）"
echo "  • 完整性：避免三个评审 agent 因上下文溢出输出截断"
echo "  • 智能截断：源码 > 配置 > 测试 > 生成文件 > lock 优先级"
echo "  • 一致性：三个 agent 共享同一份 diff 内容，结论可比"
echo ""
echo "不配置的影响："
echo "  • Review 走 git diff | head -1500 降级路径"
echo "  • 大变更集（≥15 文件）评审可能截断"
echo "  • lock 文件、生成文件可能挤占预算"
echo ""

mcp_server_path="${FORGE_ROOT}/dist/src/mcp/server.js"

if [ -f "$mcp_server_path" ]; then
  if command -v node &>/dev/null; then
    mcp_file="${PROJECT_ROOT}/.mcp.json"

    # Merge forge-context into .mcp.json
    mcp_result=$(node -e "
      const fs = require('fs');
      const mcpPath = '${mcp_file}';
      const serverPath = '${mcp_server_path}';
      let mcp;
      try {
        mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      } catch (e) {
        mcp = {};
      }
      if (!mcp.mcpServers) mcp.mcpServers = {};
      if (mcp.mcpServers['forge-context']) {
        process.stdout.write('SKIP');
      } else {
        mcp.mcpServers['forge-context'] = {
          command: 'node',
          args: [serverPath],
          alwaysLoad: true
        };
        fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n');
        process.stdout.write('OK');
      }
    " 2>&1) || true

    case "${mcp_result}" in
      SKIP)
        warn "forge-context MCP 配置已存在，跳过（避免覆盖）"
        ;;
      OK)
        success "forge-context MCP Server 已配置到 .mcp.json"
        ;;
      *)
        warn "MCP 配置写入失败：${mcp_result}"
        ;;
    esac
  else
    warn "未检测到 node 命令，跳过 MCP Server 配置。请手动创建 .mcp.json 配置 forge-context。"
  fi
else
  info "未找到 MCP server（${mcp_server_path}），跳过 MCP 配置（运行 npm run build 后重新初始化可启用）"
fi

# --- Write env variables to settings.json ---
if command -v node &>/dev/null; then
  # Ensure settings.json exists
  if [ ! -f "${settings_file}" ]; then
    mkdir -p "${PROJECT_ROOT}/.claude"
    echo '{}' > "${settings_file}"
  fi

  env_result=$(node -e "
    const fs = require('fs');
    const settingsPath = '${settings_file}';
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (e) {
      settings = {};
    }
    if (!settings.env) settings.env = {};

    const envVars = {
      'ENABLE_PROMPT_CACHING_1H': 'true',
      'MCP_CONNECTION_NONBLOCKING': 'true',
      'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB': 'true',
      // regenerative-checkpoint D9: GLM-5.2 1M compact 配置（省额优先）
      // 两变量必须配合：单独 PCT 对默认本地会话无效（官方 env-vars 文档）。
      // WINDOW=1000000: 1M window (GLM-5.2); enables proactive compact mode.
      // PCT=60: compact at 60% of window = 600K (save-quota-first).
      // idempotent：用户已设不同值则跳过（settings.env[key] === undefined 判断）。
      'CLAUDE_CODE_AUTO_COMPACT_WINDOW': '1000000',
      'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE': '60'
    };

    let added = 0;
    let skipped = 0;
    for (const [key, value] of Object.entries(envVars)) {
      if (settings.env[key] === undefined) {
        settings.env[key] = value;
        added++;
      } else {
        skipped++;
      }
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    process.stdout.write(JSON.stringify({added, skipped}));
  " 2>&1) || true

  case "${env_result}" in
    *"added"*)
      added=$(echo "${env_result}" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf-8')).added)" 2>/dev/null || echo "?")
      skipped=$(echo "${env_result}" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf-8')).skipped)" 2>/dev/null || echo "?")
      if [[ "${added}" -gt 0 ]]; then
        skip_msg=""
        if [[ "${skipped}" -gt 0 ]]; then
          skip_msg="（${skipped} 项已存在，跳过）"
        fi
        success "${added} 项环境变量已写入 settings.json ${skip_msg}"
      else
        info "所有环境变量已存在于 settings.json，跳过"
      fi
      ;;
    *)
      warn "环境变量写入失败：${env_result}"
      ;;
  esac
else
  warn "未检测到 node 命令，跳过环境变量配置。建议手动添加 ENABLE_PROMPT_CACHING_1H、MCP_CONNECTION_NONBLOCKING、CLAUDE_CODE_SUBPROCESS_ENV_SCRUB、CLAUDE_CODE_AUTO_COMPACT_WINDOW、CLAUDE_AUTOCOMPACT_PCT_OVERRIDE 到 .claude/settings.json 的 env 部分。"
fi

# --- Install cmux workspace layout (idempotent) ---
if [[ -f "${FORGE_ROOT}/scripts/cmux-mirror/install-template.sh" ]]; then
  bash "${FORGE_ROOT}/scripts/cmux-mirror/install-template.sh" "${PROJECT_ROOT}" 2>/dev/null || true
fi

# ============================================================================
# Step 7：安装 Token 优化工具（companion tools）
# ============================================================================
info "Step 7/7：安装 Token 优化工具"

# Helper: detect pip command
detect_pip() {
  if command -v pip &>/dev/null; then echo "pip"
  elif command -v pip3 &>/dev/null; then echo "pip3"
  else echo ""
  fi
}

# Helper: install a companion tool with graceful failure
# Usage: install_companion <name> <description> <install_command> [fallback_msg]
install_companion() {
  local name="$1"
  local desc="$2"
  local install_cmd="$3"
  local fallback="${4:-Fallback 方案可用}"

  info "正在安装 ${name}（${desc}）..."
  if eval "${install_cmd}" 2>&1; then
    success "${name} 已安装"
    return 0
  else
    warn "${name} 安装失败。${fallback}"
    return 1
  fi
}

# --- a. code-review-graph（代码知识图谱）---
pip_cmd=$(detect_pip)
if [[ -n "${pip_cmd}" ]]; then
  install_companion "code-review-graph" \
    "代码知识图谱" \
    "${pip_cmd} install code-review-graph" \
    "Explore agent 将使用 grep 回退方案"
  # Initialize CRG if installed
  if command -v code-review-graph &>/dev/null; then
    code-review-graph install --platform claude-code 2>/dev/null || true
    code-review-graph build 2>/dev/null || true
  fi
else
  info "未检测到 pip/pip3，跳过 code-review-graph（grep 回退方案可用）"
fi

# --- b. Headroom（API 级压缩，wrap 模式）---
if [[ -n "${pip_cmd}" ]]; then
  install_companion "Headroom" \
    "API 级全量压缩（对话历史 + tool 输出 + 模型写回）" \
    "${pip_cmd} install 'headroom-ai[all]'" \
    "forge_exec 将使用内置 trimmer 回退方案（成功输出裁剪）；失败输出 Iron Law 由 formatFailureOutput 或 Headroom protected:error_output 兜底"
else
  info "未检测到 pip/pip3，跳过 Headroom（内置 trimmer 回退方案可用）"
fi

# --- c. context-mode（大输出沙箱）---
if command -v npm &>/dev/null; then
  # Try claude plugin marketplace (non-blocking)
  if command -v claude &>/dev/null; then
    claude plugin marketplace add mksglu/context-mode 2>/dev/null || true
  fi
  install_companion "context-mode" \
    "大输出沙箱（BM25 索引）" \
    "npm install -g context-mode" \
    "大输出由 forge_exec + trimmer 处理"
else
  info "未检测到 npm，跳过 context-mode（forge_exec 回退方案可用）"
fi

# --- d. Caveman（回复压缩）---
if command -v claude &>/dev/null; then
  install_companion "Caveman" \
    "回复压缩（去除客套话）" \
    "claude plugin marketplace add JuliusBrussee/caveman" \
    "§2.6 Output Conciseness 规则继续生效"
else
  info "未检测到 claude 命令，跳过 Caveman（§2.6 Output Conciseness 规则继续生效）"
fi

# --- Installation summary ---
echo ""
info "Token 优化工具安装完成："
echo "  工具                  | 状态"
echo "  --------------------- | ------"
for tool in "code-review-graph" "headroom" "context-mode"; do
  if command -v "${tool}" &>/dev/null; then
    echo "  ${tool}          | ✅ 已安装"
  else
    echo "  ${tool}          | ⚠️ 未安装（fallback 可用）"
  fi
done
echo ""
info "Headroom 使用说明："
echo "  用 'headroom wrap claude' 替代 'claude' 启动 Claude Code"
echo "  Headroom 会自动压缩 API 请求中的 prompt（47-92%↓ token）"
echo "  不使用 headroom wrap 时 Forge 正常运行（直连 API）"

# ============================================================================
# Step 8：Pack 配置（--pack 参数）
# ============================================================================
if [[ ${#PACKS[@]} -gt 0 ]]; then
  info "Step 8/8：配置 Domain Pack"

  for pack_name in "${PACKS[@]}"; do
    # Check if pack exists
    if [[ ! -d "${FORGE_ROOT}/packs/${pack_name}" ]]; then
      warn "Pack \"${pack_name}\" 未找到于 packs/ 目录。配置已记录，但 Pack 功能将不可用直到安装。"
      continue
    fi

    # PMS-specific setup
    if [[ "${pack_name}" == "pms" ]]; then
      echo ""
      info "PMS Pack 配置"
      echo "  PMS Pack 需要营业日时钟（Business Day Clock）配置："
      echo ""

      read -rep "$(echo -e "${BLUE}?${NC}") 营业日切日时间（小时 0-23）[4]: " bday_cutoff
      bday_cutoff="${bday_cutoff:-4}"

      read -rep "$(echo -e "${BLUE}?${NC}") 时区（IANA） [Asia/Shanghai]: " bday_tz
      bday_tz="${bday_tz:-Asia/Shanghai}"

      # Create .forge/custom/ for project-specific overrides
      mkdir -p "${PROJECT_ROOT}/.forge/custom/pms"

      # Re-write config.md with business_day settings
      # (The config.md was already written in Step 2; now we update the frontmatter)
      if command -v node &>/dev/null; then
        node -e "
          const fs = require('fs');
          const path = '${PROJECT_ROOT}/.forge/config.md';
          let content = fs.readFileSync(path, 'utf-8');
          // Add packs and business_day settings to frontmatter
          if (!content.includes('packs:')) {
            content = content.replace('---\\n', '---\\npacks:\\n  - pms\\n');
          }
          content = content.replace('---\\n', '---\\nbusiness_day_cutoff_hour: ${bday_cutoff}\\nbusiness_day_timezone: \"${bday_tz}\"\\n');
          fs.writeFileSync(path, content);
        " 2>/dev/null || warn "无法自动更新 config.md frontmatter，请手动添加 business_day 配置"
      fi

      success "PMS Pack 已启用"
      echo ""
      echo -e "  ${CYAN}═══ PMS Pack 欢迎信息 ═══${NC}"
      echo "  PMS Domain Pack v1.0 已激活！"
      echo ""
      echo "  包含内容："
      echo "    • 8 个限界上下文（Reservations, Folio, Night Audit...）"
      echo "    • 4 个状态机（预订, 账单, 房态, 客房任务）"
      echo "    • 20 个 Gherkin 场景模板"
      echo "    • 完整术语表 + 禁用词清单"
      echo "    • BusinessDayClock（营业日时钟）"
      echo ""
      echo "  营业日配置：切日 ${bday_cutoff}:00, 时区 ${bday_tz}"
      echo "  详见：packs/pms/README.md"
      echo "  自定义覆盖：.forge/custom/pms/"
      echo ""
    fi

    success "Pack \"${pack_name}\" 配置完成"
  done
fi

# ============================================================================
# 完成
# ============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       🔥 Forge 初始化完成！               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "  已创建："
echo "    📁 .forge/          — 统一状态目录（含所有子目录和模板）"
echo "    📄 .forge/sandbox.json — 沙箱策略配置（Phase 1 advisory 模式）"
echo "    📁 .claude/agents/  — 7 个 Subagent 角色文件"
echo "    📁 .claude/commands/ — Forge Command 入口"
echo ""
echo "  ## 🔧 配置优化"
echo ""
echo "  | 配置项 | 值 | 用途 |"
echo "  |--------|-----|------|"
echo "  | alwaysLoad | true | MCP 即时加载，消除冷启动 |"
echo "  | ENABLE_PROMPT_CACHING_1H | true | Cache TTL 1h，节省 token |"
echo "  | MCP_CONNECTION_NONBLOCKING | true | MCP 不阻塞启动 |"
echo "  | CLAUDE_CODE_SUBPROCESS_ENV_SCRUB | true | 清理子进程敏感环境变量 |"
echo ""
echo "    📄 .claude/settings.json — Forge Hooks + MCP 配置"
echo "    📄 CLAUDE.md        — 项目宪法"
echo "    📄 .forge/config.md — 项目配置"
echo ""
echo "  下一步："
echo "    输入 /forge 并描述你的任务，开始第一个开发任务。"
echo ""
echo "  推荐：启用 Agent Teams（Full tier 自动使用 5 视角协作决策）："
echo "    在 .claude/settings.json 的 env 块中添加："
echo '    {"env": {"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"}}'
echo "    或运行：/forge config"
echo ""
echo "  建议添加到 .gitignore："
echo "    .forge/debug/"
echo "    .forge/archive/"
echo ""
echo "  ## 🔧 Worktree 高级配置"
echo ""
echo "  以下配置可在 .claude/settings.json 中按需启用（默认不启用）："
echo ""
echo "  | 配置项 | 用途 | 适用场景 |"
echo "  |--------|------|----------|"
echo "  | worktree.bgIsolation: \"none\" | 禁用后台 agent worktree 隔离 | git submodule 仓库、特殊 repo 结构 |"
echo "  | worktree.sparsePaths: [\"src/\"] | Worktree 只 checkout 指定目录 | 大 monorepo（checkout >30s 或 >1GB） |"
echo "  | CLAUDE_CODE_SIMPLE: \"true\" | 最小化模式，减少输出 | 简单场景、CI 脚本（注意：可能影响 Forge 完整功能） |"
echo ""
echo "  示例 .claude/settings.json 片段："
echo '  {"worktree":{"bgIsolation":"none","sparsePaths":["src/","tests/"]}}'
echo ""
