#!/usr/bin/env bash
# category: user-facing
# ============================================================================
# forge build-dist — 构建 Claude Code 分发包
#
# 从源定义（skills/, agents/, commands/, hooks/, templates/, scripts/）
# 构建 Claude Code 的分发包到 dist/
#
# 文件列表由 scripts/dist-manifest.json 管理（P3-3: manifest-driven packaging）。
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
  echo "File lists are read from scripts/dist-manifest.json."
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MANIFEST="${SCRIPT_DIR}/dist-manifest.json"

# Validate manifest exists
if [[ ! -f "${MANIFEST}" ]]; then
  echo "ERROR: dist-manifest.json not found at ${MANIFEST}" >&2
  exit 1
fi

# ---------- 颜色定义 ----------
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✅${NC} $1"; }

# ---------- Manifest reader ----------
# Read a JSON array from the manifest and iterate over its entries.
# Usage: manifest_each "key" "callback_script_name"
manifest_each() {
  local key="$1"
  node -e "
    const m = JSON.parse(require('fs').readFileSync('${MANIFEST}', 'utf8'));
    const items = m['${key}'] || [];
    items.forEach(i => console.log(i));
  " | while IFS= read -r item; do
    eval "$2" "\"${item}\""
  done
}

echo ""
echo "=== Forge 分发包构建 ==="
echo ""

# ---------- 提取版本号 ----------
VERSION=$(node -e "console.log(require('${FORGE_ROOT}/package.json').version)" 2>/dev/null || echo "unknown")
info "版本: ${VERSION}"
info "清单: dist-manifest.json"

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

# Copy runtime scripts from manifest
copy_cc_script() {
  local script="$1"
  if [[ -f "${FORGE_ROOT}/scripts/${script}" ]]; then
    cp "${FORGE_ROOT}/scripts/${script}" "${CC_BUNDLE}/scripts/${script}"
    chmod +x "${CC_BUNDLE}/scripts/${script}"
  fi
}
manifest_each "cc_runtime_scripts" "copy_cc_script"

# Copy runtime .mjs scripts from manifest
copy_cc_mjs() {
  local script="$1"
  if [[ -f "${FORGE_ROOT}/scripts/${script}" ]]; then
    cp "${FORGE_ROOT}/scripts/${script}" "${CC_BUNDLE}/scripts/${script}"
  fi
}
manifest_each "cc_runtime_mjs" "copy_cc_mjs"

# Copy cmux-mirror subdirectory if exists
if [[ -d "${FORGE_ROOT}/scripts/cmux-mirror" ]]; then
  cp -r "${FORGE_ROOT}/scripts/cmux-mirror" "${CC_BUNDLE}/scripts/cmux-mirror"
fi

cp "${FORGE_ROOT}/README.md" "${CC_BUNDLE}/README.md"

# Copy compiled check-frozen.js and its dependencies
if [[ -f "${FORGE_ROOT}/dist/src/check-frozen.js" ]]; then
  mkdir -p "${CC_BUNDLE}/dist/src"
  cp "${FORGE_ROOT}/dist/src/check-frozen.js" "${CC_BUNDLE}/dist/src/"
  copy_cc_dep() {
    local dep="$1"
    if [[ -f "${FORGE_ROOT}/dist/src/${dep}" ]]; then
      cp "${FORGE_ROOT}/dist/src/${dep}" "${CC_BUNDLE}/dist/src/"
    fi
  }
  manifest_each "cc_compiled_js" "copy_cc_dep"
  info "check-frozen.js 及其依赖已复制到分发包 dist/src/"
fi

# Copy compiled MCP server (forge-context)
if [[ -d "${FORGE_ROOT}/dist/src/mcp" ]]; then
  mkdir -p "${CC_BUNDLE}/dist/src/mcp"
  cp -r "${FORGE_ROOT}/dist/src/mcp"/. "${CC_BUNDLE}/dist/src/mcp/"
fi

# Bundle the forge-context MCP server into a single self-contained file.
# This is what the marketplace-install path (.mcp.json → dist/forge-context.mjs)
# resolves to — it inlines @modelcontextprotocol/sdk + zod + ajv so the server
# runs with zero node_modules. Requires tsc output (dist/src/mcp/server.js).
if [[ -f "${FORGE_ROOT}/dist/src/mcp/server.js" ]]; then
  node "${SCRIPT_DIR}/bundle-mcp.mjs"
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
MANIFEST_SHA="${FORGE_ROOT}/dist/claude-code/bundles/.manifest.sha256"
(cd "${CC_BUNDLE}" && find . -type f | sort | xargs shasum -a 256) > "${MANIFEST_SHA}"
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

# ============================================================================
# Plugin 分发包
# ============================================================================
info "构建 Plugin 分发包..."

PLUGIN_DIST="${FORGE_ROOT}/dist-plugin"
rm -rf "${PLUGIN_DIST}"
mkdir -p "${PLUGIN_DIST}"

# Copy plugin manifest
cp -r "${FORGE_ROOT}/.claude-plugin" "${PLUGIN_DIST}/.claude-plugin"

# Sync version from package.json into plugin.json (safety net against drift)
DIST_PLUGIN_JSON="${PLUGIN_DIST}/.claude-plugin/plugin.json"
if [[ -f "${DIST_PLUGIN_JSON}" ]]; then
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('${FORGE_ROOT}/package.json', 'utf8'));
    const plugin = JSON.parse(fs.readFileSync('${DIST_PLUGIN_JSON}', 'utf8'));
    if (plugin.version !== pkg.version) {
      plugin.version = pkg.version;
      fs.writeFileSync('${DIST_PLUGIN_JSON}', JSON.stringify(plugin, null, 2) + '\n');
      console.log('  ↳ synced plugin.json version → ' + pkg.version);
    }
  "
fi

# Copy plugin assets (same as CC bundle but with plugin layout)
cp -r "${FORGE_ROOT}/skills" "${PLUGIN_DIST}/skills"
cp -r "${FORGE_ROOT}/agents" "${PLUGIN_DIST}/agents"
cp -r "${FORGE_ROOT}/commands" "${PLUGIN_DIST}/commands"
cp -r "${FORGE_ROOT}/templates" "${PLUGIN_DIST}/templates"
cp -r "${FORGE_ROOT}/hooks" "${PLUGIN_DIST}/hooks"
if [ -f "${FORGE_ROOT}/.mcp.json" ]; then
  cp "${FORGE_ROOT}/.mcp.json" "${PLUGIN_DIST}/.mcp.json"
fi
mkdir -p "${PLUGIN_DIST}/scripts"

# Copy runtime scripts from manifest
copy_plugin_script() {
  local script="$1"
  if [[ -f "${FORGE_ROOT}/scripts/${script}" ]]; then
    cp "${FORGE_ROOT}/scripts/${script}" "${PLUGIN_DIST}/scripts/${script}"
    chmod +x "${PLUGIN_DIST}/scripts/${script}"
  fi
}
manifest_each "plugin_runtime_scripts" "copy_plugin_script"

# Copy runtime .mjs scripts from manifest
copy_plugin_mjs() {
  local script="$1"
  if [[ -f "${FORGE_ROOT}/scripts/${script}" ]]; then
    cp "${FORGE_ROOT}/scripts/${script}" "${PLUGIN_DIST}/scripts/${script}"
  fi
}
manifest_each "plugin_runtime_mjs" "copy_plugin_mjs"

# Copy cmux-mirror if exists
if [[ -d "${FORGE_ROOT}/scripts/cmux-mirror" ]]; then
  cp -r "${FORGE_ROOT}/scripts/cmux-mirror" "${PLUGIN_DIST}/scripts/cmux-mirror"
fi

# Copy compiled JS from manifest
if [[ -d "${FORGE_ROOT}/dist/src" ]]; then
  mkdir -p "${PLUGIN_DIST}/dist/src"
  copy_plugin_js() {
    local js="$1"
    if [[ -f "${FORGE_ROOT}/dist/src/${js}" ]]; then
      cp "${FORGE_ROOT}/dist/src/${js}" "${PLUGIN_DIST}/dist/src/"
    fi
  }
  manifest_each "plugin_compiled_js" "copy_plugin_js"
fi

# Copy compiled MCP server (forge-context)
if [[ -d "${FORGE_ROOT}/dist/src/mcp" ]]; then
  mkdir -p "${PLUGIN_DIST}/dist/src/mcp"
  cp -r "${FORGE_ROOT}/dist/src/mcp"/. "${PLUGIN_DIST}/dist/src/mcp/"
  info "forge-context MCP server (dist/src/mcp/) 已捆绑到 plugin"
fi
ZIP_NAME="forge-plugin-${VERSION}.zip"
(cd "${PLUGIN_DIST}" && zip -r "${FORGE_ROOT}/${ZIP_NAME}" . > /dev/null 2>&1 && mv "${FORGE_ROOT}/${ZIP_NAME}" .)
success "Plugin 分发包构建完成: ${PLUGIN_DIST}/"

plugin_count=$(find "${PLUGIN_DIST}" -type f | wc -l | tr -d '[:space:]')
echo "  ${PLUGIN_DIST}/  — ${plugin_count} 个文件"
echo "  版本: ${VERSION}"
echo ""
