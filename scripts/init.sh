#!/usr/bin/env bash
# ============================================================================
# forge init — Forge 项目初始化脚本
#
# 功能：
#   1. 交互式收集项目配置（名称、技术栈、安全级别）
#   2. 创建完整的 .forge/ 目录结构
#   3. 复制 7 个 Subagent 角色文件到 .claude/agents/
#   4. 生成 CLAUDE.md 项目宪法
#   5. 写入 .forge/config.md
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
info "Step 1/5：收集项目信息"
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

# --- CI 检查命令 ---
echo ""
echo "  CI 检查命令（ci_check_command）："
echo "    运行所有 CI 检查的单条命令（如 npm run check）。"
echo "    build 全量测试和 test 验证清单将使用此命令，确保本地验证与 CI 一致。"
echo "    如果留空，将按 verify_commands 列表逐条执行。"
echo ""
read -rep "$(echo -e "${BLUE}?${NC}") CI 检查命令（留空跳过）: " ci_check_cmd

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
info "Step 2/5：创建 .forge/ 目录结构"

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
info "Step 3/5：复制 Agent 角色文件到 .claude/agents/"

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
info "Step 4/5：生成 CLAUDE.md 项目宪法"

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
info "Step 5：安装 Forge Hooks"

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
# Step 6：安装可选工具（code-review-graph）
# ============================================================================
info "Step 6：安装可选工具"

if command -v pip &>/dev/null || command -v pip3 &>/dev/null; then
  pip_cmd=""
  if command -v pip &>/dev/null; then
    pip_cmd="pip"
  elif command -v pip3 &>/dev/null; then
    pip_cmd="pip3"
  fi

  if [[ -n "${pip_cmd}" ]]; then
    info "正在安装 code-review-graph（Closure-First 探针优化）..."
    install_output=$(${pip_cmd} install code-review-graph 2>&1) && {
      success "code-review-graph 已安装"
    } || {
      warn "code-review-graph 安装失败，Closure-First 探针将使用 grep 回退方案"
      echo "    安装日志: ${install_output}" | head -3
    }
  fi
else
  info "未检测到 pip/pip3，跳过 code-review-graph 安装（grep 回退方案可用）"
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
