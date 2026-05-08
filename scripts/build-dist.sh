#!/usr/bin/env bash
# category: user-facing
# ============================================================================
# forge build-dist — 构建 Claude Code 分发包
#
# 从源定义（skills/, agents/, commands/, hooks/, templates/, scripts/）
# 构建 Claude Code 的分发包到 dist/
#
# 用法：
#   bash forge/scripts/build-dist.sh
# ============================================================================

set -euo pipefail

# ---------- --help ----------
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: scripts/build-dist.sh"
  echo ""
  echo "Build the Forge distribution package from source definitions."
  echo "Compiles TypeScript to dist/ and bundles skills, agents, hooks, templates, and scripts."
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------- 颜色定义 ----------
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✅${NC} $1"; }

echo ""
echo "=== Forge 分发包构建 ==="
echo ""

# ---------- 提取版本号 ----------
VERSION=$(node -e "console.log(require('${FORGE_ROOT}/package.json').version)" 2>/dev/null || echo "unknown")
info "版本: ${VERSION}"

# ---------- 清理旧的分发包 ----------
info "清理旧的分发包..."
rm -rf "${FORGE_ROOT}/dist/claude-code/bundles/forge"

# ============================================================================
# Claude Code 分发包
# ============================================================================
info "构建 Claude Code 分发包..."

CC_BUNDLE="${FORGE_ROOT}/dist/claude-code/bundles/forge"
mkdir -p "${CC_BUNDLE}"

# 复制核心文件
cp -r "${FORGE_ROOT}/skills" "${CC_BUNDLE}/skills"
cp -r "${FORGE_ROOT}/agents" "${CC_BUNDLE}/agents"
cp -r "${FORGE_ROOT}/commands" "${CC_BUNDLE}/commands"
cp -r "${FORGE_ROOT}/hooks" "${CC_BUNDLE}/hooks"
cp -r "${FORGE_ROOT}/templates" "${CC_BUNDLE}/templates"
mkdir -p "${CC_BUNDLE}/scripts"
cp "${FORGE_ROOT}/scripts/init.sh" "${CC_BUNDLE}/scripts/init.sh"
chmod +x "${CC_BUNDLE}/scripts/init.sh"
cp "${FORGE_ROOT}/scripts/validate-knowledge.sh" "${CC_BUNDLE}/scripts/validate-knowledge.sh"
chmod +x "${CC_BUNDLE}/scripts/validate-knowledge.sh"
# Copy all runtime scripts (exclude build/install scripts which are dev-only)
for script in check-frozen.sh auto-resume.sh persistent-loop.sh; do
  if [[ -f "${FORGE_ROOT}/scripts/${script}" ]]; then
    cp "${FORGE_ROOT}/scripts/${script}" "${CC_BUNDLE}/scripts/${script}"
    chmod +x "${CC_BUNDLE}/scripts/${script}"
  fi
done
cp "${FORGE_ROOT}/README.md" "${CC_BUNDLE}/README.md"

# Copy compiled check-frozen.js and its dependencies so that the
# hooks.json "node forge/dist/src/check-frozen.js" path resolves
# correctly in the distribution package (R3: frozen-zone protection).
if [[ -f "${FORGE_ROOT}/dist/src/check-frozen.js" ]]; then
  mkdir -p "${CC_BUNDLE}/dist/src"
  cp "${FORGE_ROOT}/dist/src/check-frozen.js" "${CC_BUNDLE}/dist/src/"
  # check-frozen.js → state.js → frontmatter.js (full dependency chain)
  for dep in state.js frontmatter.js; do
    if [[ -f "${FORGE_ROOT}/dist/src/${dep}" ]]; then
      cp "${FORGE_ROOT}/dist/src/${dep}" "${CC_BUNDLE}/dist/src/"
    fi
  done
  info "check-frozen.js 及其依赖已复制到分发包 dist/src/"
fi

# 写入版本号
echo "${VERSION}" > "${CC_BUNDLE}/VERSION"

# 生成安装指引
cat > "${CC_BUNDLE}/INSTALL.md" << 'EOF'
# Forge for Claude Code — 安装指南

## 快速安装

```bash
git clone https://github.com/kkkman22/Forge.git ~/.claude/skills/forge
```

## 初始化项目

```bash
# 在项目根目录运行
~/.claude/skills/forge/scripts/init.sh
```

## 使用

在 Claude Code 中输入 `/forge` 并描述任务即可。

## 前置条件

- Claude Code 环境
- Claude Code 支持 Subagent（用于 /forge build、/forge decide 和 /forge review）

## 文件结构

```
~/.claude/skills/forge/
├── skills/          # 13 个 SKILL.md
├── agents/          # 7 个 Subagent 角色
├── commands/        # Forge Command 入口
├── hooks/           # Claude Code Hooks
├── templates/       # 文件模板
├── scripts/
│   ├── init.sh                # 项目初始化脚本
│   └── validate-knowledge.sh  # 知识库健康检查
```
EOF

success "Claude Code 分发包构建完成: dist/claude-code/bundles/forge/"

# ---------- 生成 manifest 用于 CI 同步校验 ----------
info "生成 manifest..."
MANIFEST="${FORGE_ROOT}/dist/claude-code/bundles/.manifest.sha256"
(cd "${CC_BUNDLE}" && find . -type f | sort | xargs shasum -a 256) > "${MANIFEST}"
success "Manifest 已生成: dist/claude-code/bundles/.manifest.sha256"

# ============================================================================
# 汇总
# ============================================================================
echo ""
echo "=== 构建完成 ==="
echo ""

cc_count=$(find "${CC_BUNDLE}" -type f | wc -l | tr -d '[:space:]')
echo "  dist/claude-code/bundles/forge/  — ${cc_count} 个文件"
echo "  版本: ${VERSION}"
echo ""
