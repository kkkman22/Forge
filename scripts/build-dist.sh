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
# Usage: manifest_each "key" "callback_fn_name"
#
# Audit P1: was `eval "$2" "\"${item}\""` which re-interprets manifest entries
# through the shell (quote/space/backslash/newline injection). Switched to a
# direct function call — the callback name is always a hard-coded literal at the
# call site, and the item is passed as a single positional arg with no second
# shell-interpretation pass.
manifest_each() {
  local key="$1"
  local callback_fn="$2"
  node -e "
    const m = JSON.parse(require('fs').readFileSync('${MANIFEST}', 'utf8'));
    const items = m['${key}'] || [];
    items.forEach(i => console.log(i));
  " | while IFS= read -r item; do
    "${callback_fn}" "${item}"
  done
}

echo ""
echo "=== Forge 分发包构建 ==="
echo ""

# ---------- 确保 dist/src 是最新编译产物 ----------
# build-dist.sh 只 cp 已存在的 dist/src/*.js（见下方 -f 守卫），不自己编译。
# 但多个调用方不预先跑 tsc：pre-push hook、smoke-install、README 安装流、
# bump-version --commit。这些会产出残缺 bundle（缺 check-frozen.js / MCP server）。
# 条件编译：dist/src 陈旧才跑 tsc；已是最新则跳过（CI 零额外开销）。
# tsc 失败则阻断构建（fail-fast，不产出残缺 bundle）。
compile_if_stale() {
  # dist/src 不存在 → 必须编译
  if [[ ! -d "${FORGE_ROOT}/dist/src" ]]; then
    info "dist/src 不存在，正在编译 TypeScript..."
    return 0
  fi
  # 取 dist/src 下最旧的 .js（ls -t 倒序，tail -1 即最旧）。跨平台兼容
  # （BSD/GNU find 的 -printf 不通用）。无 .js 则视为必须编译。
  local oldest_dist
  oldest_dist=$(ls -t "${FORGE_ROOT}"/dist/src/*.js 2>/dev/null | tail -1) || true
  if [[ -z "${oldest_dist}" ]]; then
    info "dist/src 无 .js 产物，正在编译 TypeScript..."
    return 0
  fi
  # 找是否有比最旧 dist 产物更新的 .ts 源文件。find -newer 跨 BSD/GNU 兼容。
  if find "${FORGE_ROOT}/src" -name '*.ts' -newer "${oldest_dist}" -print -quit 2>/dev/null | grep -q .; then
    info "src/ 有改动早于 dist/src/，正在重新编译..."
    return 0
  fi
  info "dist/src 已是最新，跳过编译"
  return 1
}

if compile_if_stale; then
  # Use the build tsconfig so src/domain/ (the @non-production reference domain,
  # excluded from the main build per INV-1/INV-3) is NOT emitted into dist/src.
  if ! npx tsc -p tsconfig.build.json; then
    error "TypeScript 编译失败，终止构建（不产出残缺 bundle）"
    exit 1
  fi
  success "TypeScript 编译完成"
fi

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

# ---------- Packs（领域知识包，REQ-01/02/03 切片 A'）----------
# 正式 pack 用显式 allowlist 拷贝（非 cp -r packs 全量）：
# pms-marriott-sample 是含具体公司名的教学素材，不该进通用 bundle；
# 未来新增正式 pack 时显式加数组——这是有意摩擦点，防 sample/实验 pack 误入。
# allowlist 是 pack-plugin-distribution (slice A') 的单一真相源，与
# check-bundle-sync.mjs Layer 3、init.sh manifest 校验共享同一集合语义。
PACK_ALLOWLIST=("pms")

# copy_packs <bundle_dir> — 拷贝 allowlist 内的 pack，排除 *.test.ts。
# 可运行源码（business-day-clock.ts）以源码形态拷贝，非预编译——它是
# 参考实现，需用户 tsconfig 编译接入，用户会改（REQ-01）。
copy_packs() {
  local dest_bundle="$1"
  local packs_dir="${dest_bundle}/packs"
  mkdir -p "${packs_dir}"
  for name in "${PACK_ALLOWLIST[@]}"; do
    local src="${FORGE_ROOT}/packs/${name}"
    if [[ ! -d "${src}" ]]; then
      info "packs/${name} 在 allowlist 但源不存在，跳过"
      continue
    fi
    cp -r "${src}" "${packs_dir}/${name}"
    # 排除测试文件（test 文件进 bundle 无意义，增加噪音）
    find "${packs_dir}/${name}" -name '*.test.ts' -delete 2>/dev/null || true
  done
}

# gen_packs_manifest <bundle_dir> — 生成 packs/manifest.json（漂移围栏单一真相源）。
# schema（design §2.2）：generated_at + forge_version + packs[](name/forge_min_version/path)。
# forge_min_version 读自各 pack.yaml（无此字段则 null）；forge_version 读自 package.json。
# 依赖环境变量 PACKS_SRC_DIR（pack 源目录）、FORGE_PKG_JSON（package.json 路径）、
# PACK_ALLOWLIST_CSV（逗号分隔的 allowlist）—— 调用前已 export。
gen_packs_manifest() {
  local dest_bundle="$1"
  local packs_dir="${dest_bundle}/packs"
  node -e "
    const fs = require('fs');
    const path = require('path');
    const forgeVersion = JSON.parse(fs.readFileSync(process.env.FORGE_PKG_JSON, 'utf8')).version || 'unknown';
    function readMinVersion(packDir) {
      const p = path.join(packDir, 'pack.yaml');
      if (!fs.existsSync(p)) return null;
      const m = fs.readFileSync(p, 'utf8').match(/^forge_min_version:\s*[\"']?([^\"'\n#]+)[\"']?\s*\$/m);
      return m ? m[1].trim() : null;
    }
    const allowlist = String(process.env.PACK_ALLOWLIST_CSV).split(',').filter(Boolean);
    const packs = allowlist.map(name => {
      const dir = path.join(process.env.PACKS_SRC_DIR, name);
      return {
        name,
        forge_min_version: fs.existsSync(dir) ? readMinVersion(dir) : null,
        path: 'packs/' + name
      };
    });
    const manifest = {
      generated_at: new Date().toISOString(),
      forge_version: forgeVersion,
      packs
    };
    fs.writeFileSync(path.join('${packs_dir}', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  "
  success "packs/manifest.json 已生成"
}

# gen_packs_readme <bundle_dir> — 生成 packs/README.md。
# 让非目标行业用户明确 pack 是可选领域知识，可忽略（REQ-02）。
gen_packs_readme() {
  local dest_bundle="$1"
  local packs_dir="${dest_bundle}/packs"
  cat > "${packs_dir}/README.md" <<PACKS_EOF
# Forge 领域知识包（Packs）

本目录包含随 Forge 分发的领域知识包（pack）。**这些 pack 是可选的领域知识，非目标行业可忽略**，不影响 Forge 核心功能。

## 所含 pack

| 名称 | 定位 | 含可运行代码 |
|------|------|-------------|
PACKS_EOF
  for name in "${PACK_ALLOWLIST[@]}"; do
    local desc=""
    case "${name}" in
      pms) desc="酒店前台管理系统（PMS）领域知识包" ;;
      *)   desc="领域知识包" ;;
    esac
    local has_code="否"
    [[ -f "${packs_dir}/${name}/utils/business-day-clock.ts" ]] && has_code="是"
    echo "| ${name} | ${desc} | ${has_code} |" >> "${packs_dir}/README.md"
  done
  cat >> "${packs_dir}/README.md" <<'PACKS_EOF'

## 说明

- pack 是**可选领域知识**：非目标行业可直接忽略本目录，Forge 不会引用它。
- 标注「含可运行代码」的 pack（如 pms 的 `utils/business-day-clock.ts`）以**源码形态**分发，需在你的项目 `tsconfig` 中编译接入，可按需修改。
- 启用 pack：在项目中运行 \`/forge init --pack <name>\`。
PACKS_EOF
  success "packs/README.md 已生成"
}

# 复制核心文件
cp -r "${FORGE_ROOT}/skills" "${CC_BUNDLE}/skills"
cp -r "${FORGE_ROOT}/agents" "${CC_BUNDLE}/agents"
cp -r "${FORGE_ROOT}/commands" "${CC_BUNDLE}/commands"
cp -r "${FORGE_ROOT}/hooks" "${CC_BUNDLE}/hooks"
cp -r "${FORGE_ROOT}/templates" "${CC_BUNDLE}/templates"

# Packs 进 CC bundle（REQ-01/02/03）
PACK_ALLOWLIST_CSV="$(IFS=,; echo "${PACK_ALLOWLIST[*]}")"
export PACK_ALLOWLIST_CSV
export PACKS_SRC_DIR="${FORGE_ROOT}/packs"
export FORGE_PKG_JSON="${FORGE_ROOT}/package.json"
copy_packs "${CC_BUNDLE}"
gen_packs_manifest "${CC_BUNDLE}"
gen_packs_readme "${CC_BUNDLE}"

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
# Audit P2: INSTALL.md 计数之前写死 13/7, 实际为 1/24。动态计数避免漂移。
SKILL_COUNT=$(find "${CC_BUNDLE}" -name 'SKILL.md' | wc -l | tr -d ' ')
AGENT_COUNT=$(find "${CC_BUNDLE}" -path '*agents*' -name '*.md' ! -name 'README.md' | wc -l | tr -d ' ')

cat > "${CC_BUNDLE}/INSTALL.md" << EOF
# Forge for Claude Code — 安装指南

## 快速安装

\`\`\`bash
git clone https://github.com/kkkman22/Forge.git ~/.claude/skills/forge
\`\`\`

## 初始化项目

\`\`\`bash
# 在项目根目录运行
~/.claude/skills/forge/scripts/init.sh
\`\`\`

## 使用

在 Claude Code 中输入 \`/forge\` 并描述任务即可。

## 前置条件

- Claude Code 环境
- Claude Code 支持 Subagent（用于 /forge build、/forge decide 和 /forge review）

## 文件结构

\`\`\`
~/.claude/skills/forge/
├── skills/          # ${SKILL_COUNT} 个 SKILL.md
├── agents/          # ${AGENT_COUNT} 个 Subagent 角色
├── commands/        # Forge Command 入口
├── hooks/           # Claude Code Hooks
├── templates/       # 文件模板
├── scripts/
│   ├── init.sh                # 项目初始化脚本
│   └── validate-knowledge.sh  # 知识库健康检查
\`\`\`
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

# Packs 进 plugin dist（REQ-01/02/03，切片 A'）
# plugin 安装从 dist-plugin/forge-plugin-{VERSION}.zip 走，必须同样含 packs
# 才能让 /forge init --pack pms 在 plugin 场景真正工作（check-bundle-sync
# Layer 1 同时校验 CC + Plugin 两份 bundle，此处与之一致）。
copy_packs "${PLUGIN_DIST}"
gen_packs_manifest "${PLUGIN_DIST}"
gen_packs_readme "${PLUGIN_DIST}"

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
