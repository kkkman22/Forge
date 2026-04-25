#!/usr/bin/env bash
# ============================================================================
# forge init — Forge 项目初始化脚本
#
# 功能：
#   1. 交互式收集项目配置（名称、技术栈、安全级别）
#   2. 创建完整的 .forge/ 目录结构
#   3. 复制 7 个 Subagent 角色文件到 .claude/agents/
#   4. 复制 2 个 Agent Team 配置到 .claude/teams/
#   5. 生成 CLAUDE.md 项目宪法
#   6. 写入 .forge/config.md
#
# 用法：
#   chmod +x forge/scripts/init.sh
#   ./forge/scripts/init.sh
# ============================================================================

set -euo pipefail

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
# 支持三种安装位置
detect_forge_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # 情况 1：脚本在 forge/scripts/ 下（开发模式或手动 clone）
  if [[ -d "${script_dir}/../agents" && -d "${script_dir}/../teams" ]]; then
    echo "$(cd "${script_dir}/.." && pwd)"
    return
  fi

  # 情况 2：全局安装到 ~/.claude/skills/forge
  if [[ -d "$HOME/.claude/skills/forge/agents" ]]; then
    echo "$HOME/.claude/skills/forge"
    return
  fi

  # 情况 3：找不到 Forge 库
  error "无法找到 Forge 库文件。请确认 Forge 已正确安装。"
  exit 1
}

FORGE_ROOT="$(detect_forge_root)"
PROJECT_ROOT="$(pwd)"

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
info "Step 1/6：收集项目信息"
echo ""

# --- 项目名称（自动检测） ---
default_name="$(basename "${PROJECT_ROOT}")"
read -rp "$(echo -e "${BLUE}?${NC}") 项目名称 [${default_name}]: " project_name
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
    read -rp "$(echo -e "${BLUE}?${NC}") 请输入技术栈（逗号分隔）: " tech_stack
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

echo ""
success "配置确认："
echo "  项目名称：${project_name}"
echo "  技术栈：  ${tech_stack}"
echo "  安全级别：${security_label}（Level ${security_level}）"
echo ""

# ---------- 输入清洗（防止 shell 注入） ----------
# 项目名称只允许字母、数字、连字符、下划线、点、空格和非 ASCII 字符（中文等）
# 移除 $()、``、|、;、& 等 shell 元字符
sanitize() {
  printf '%s' "$1" | sed 's/[`$|;&!\\]//g' | sed "s/['\"]//g"
}
project_name="$(sanitize "${project_name}")"
tech_stack="$(sanitize "${tech_stack}")"

if [[ -z "${project_name}" ]]; then
  error "项目名称清洗后为空，请使用合法字符（字母、数字、连字符、下划线）。"
  exit 1
fi

# ============================================================================
# Step 2：创建 .forge/ 目录结构
# ============================================================================
info "Step 2/6：创建 .forge/ 目录结构"

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
)

for dir in "${directories[@]}"; do
  mkdir -p "${PROJECT_ROOT}/${dir}"
done

# --- 写入 config.md ---
init_date="$(date +%Y-%m-%d)"

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
---

# 项目配置

- **项目名称**：${project_name}
- **技术栈**：${tech_stack}
- **安全级别**：${security_label}（Level ${security_level}）
- **知识库上限**：20
- **初始化时间**：${init_date}

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
info "Step 3/6：复制 Agent 角色文件到 .claude/agents/"

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

# ============================================================================
# Step 4：复制 2 个 Agent Team 配置
# ============================================================================
info "Step 4/6：复制 Agent Team 配置到 .claude/teams/"

mkdir -p "${PROJECT_ROOT}/.claude/teams/decide"
mkdir -p "${PROJECT_ROOT}/.claude/teams/review"

if [[ -f "${FORGE_ROOT}/teams/decide/config.json" ]]; then
  cp "${FORGE_ROOT}/teams/decide/config.json" "${PROJECT_ROOT}/.claude/teams/decide/config.json"
fi

if [[ -f "${FORGE_ROOT}/teams/review/config.json" ]]; then
  cp "${FORGE_ROOT}/teams/review/config.json" "${PROJECT_ROOT}/.claude/teams/review/config.json"
fi

success "2 个 Agent Team 配置已复制"

# --- 复制 Command 文件 ---
mkdir -p "${PROJECT_ROOT}/.claude/commands"
if [[ -f "${FORGE_ROOT}/commands/forge.md" ]]; then
  cp "${FORGE_ROOT}/commands/forge.md" "${PROJECT_ROOT}/.claude/commands/forge.md"
  success "Forge Command 入口已复制到 .claude/commands/"
else
  warn "未找到 commands/forge.md，跳过"
fi

# ============================================================================
# Step 5：生成 CLAUDE.md 项目宪法
# ============================================================================
info "Step 5/6：生成 CLAUDE.md 项目宪法"

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
# Step 6：安装 Hooks 到 .claude/settings.json
# ============================================================================
info "Step 6：安装 Forge Hooks"

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
        node -e "
          const fs = require('fs');
          const settings = JSON.parse(fs.readFileSync('${settings_file}', 'utf-8'));
          const hooks = JSON.parse(fs.readFileSync('${hooks_source}', 'utf-8'));
          settings.hooks = hooks.hooks;
          fs.writeFileSync('${settings_file}', JSON.stringify(settings, null, 2) + '\n');
        " 2>/dev/null && success "Forge Hooks 已合并到 .claude/settings.json" \
          || warn ".claude/settings.json 已存在但无 hooks。请手动将 ${hooks_source} 中的 hooks 合并到 settings.json。"
      else
        warn ".claude/settings.json 已存在但无 hooks。请手动将 ${hooks_source} 中的 hooks 合并到 settings.json。"
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

# --- 启用 Agent Teams 环境变量 ---
if [[ -f "${settings_file}" ]]; then
  if grep -q 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' "${settings_file}" 2>/dev/null; then
    info "Agent Teams 环境变量已配置"
  else
    if command -v node &>/dev/null; then
      node -e "
        const fs = require('fs');
        const settings = JSON.parse(fs.readFileSync('${settings_file}', 'utf-8'));
        if (!settings.env) settings.env = {};
        settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
        fs.writeFileSync('${settings_file}', JSON.stringify(settings, null, 2) + '\n');
      " 2>/dev/null && success "Agent Teams 已启用（CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1）" \
        || warn "无法自动启用 Agent Teams。请手动在 .claude/settings.json 中添加 env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = \"1\""
    else
      warn "无法自动启用 Agent Teams。请手动在 .claude/settings.json 中添加 env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = \"1\""
    fi
  fi
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
echo "    📁 .claude/agents/  — 7 个 Subagent 角色文件"
echo "    📁 .claude/teams/   — 2 个 Agent Team 配置"
echo "    📁 .claude/commands/ — Forge Command 入口"
echo "    📄 .claude/settings.json — Forge Hooks（自动上下文加载）"
echo "    📄 CLAUDE.md        — 项目宪法"
echo "    📄 .forge/config.md — 项目配置"
echo ""
echo "  下一步："
echo "    输入 /forge 并描述你的任务，开始第一个开发任务。"
echo ""
echo "  建议添加到 .gitignore："
echo "    .forge/debug/"
echo "    .forge/archive/"
echo ""
