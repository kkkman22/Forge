#!/usr/bin/env bash
# category: user-facing
# ============================================================================
# forge install-dist — 从分发包安装 Forge 到 Claude Code
#
# 用法：
#   bash forge/scripts/install-dist.sh [--target <path>] [--dry-run] [--backup]
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------- 颜色定义 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✅${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠️${NC} $1"; }
error()   { echo -e "${RED}❌${NC} $1"; }

# ---------- 参数解析 ----------
TARGET=""
TARGET_SET="false"
DRY_RUN="false"
BACKUP="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      echo "Usage: scripts/install-dist.sh [--target <path>] [--dry-run] [--backup]"
      echo ""
      echo "Install Forge distribution to Claude Code."
      echo "  --target <path>  Install to custom path (default: ~/.claude/skills/tinkerman)"
      echo "  --dry-run        Show what would be installed without writing files"
      echo "  --backup         Backup existing installation before overwriting"
      exit 0
      ;;
    --platform)
      # Accept --platform claude-code for backward compatibility, ignore other values
      if [[ "$2" != "claude-code" ]]; then
        error "Forge 仅支持 Claude Code 平台。"
        exit 1
      fi
      shift 2
      ;;
    --target) TARGET="$2"; TARGET_SET="true"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift ;;
    --backup) BACKUP="true"; shift ;;
    *) error "未知参数: $1"; exit 1 ;;
  esac
done

BUNDLE_DIR="${FORGE_ROOT}/dist/claude-code/bundles/tinkerman"

# ---------- 路径安全校验 ----------
# Apply default only if --target was not explicitly provided
if [[ "${TARGET_SET}" == "false" ]]; then
  TARGET="${HOME}/.claude/skills/tinkerman"
fi

# Reject empty TARGET (e.g. --target "")
if [[ -z "${TARGET}" ]]; then
  error "目标路径为空，拒绝执行安装。"
  exit 1
fi

# Resolve TARGET to an absolute path for safe comparison
if command -v realpath &>/dev/null; then
  RESOLVED_TARGET="$(realpath -m -- "${TARGET}" 2>/dev/null || echo "${TARGET}")"
else
  # Fallback: expand to absolute path manually
  case "${TARGET}" in
    /*) RESOLVED_TARGET="${TARGET}" ;;
    *)  RESOLVED_TARGET="$(pwd)/${TARGET}" ;;
  esac
fi

# Remove trailing slashes for consistent comparison (but preserve "/" itself)
RESOLVED_TARGET="${RESOLVED_TARGET%/}"
[[ -z "${RESOLVED_TARGET}" ]] && RESOLVED_TARGET="/"

DANGEROUS_PATHS="/ ${HOME} /usr /etc /var /bin /sbin /opt /tmp /lib /sys /proc /dev"

for dangerous in ${DANGEROUS_PATHS}; do
  if [[ "${RESOLVED_TARGET}" == "${dangerous}" ]]; then
    error "目标路径 '${TARGET}' (解析为 '${RESOLVED_TARGET}') 是危险的系统路径，拒绝执行。"
    exit 1
  fi
done

# ---------- 检查分发包 ----------
if [[ ! -d "${BUNDLE_DIR}" ]]; then
  error "分发包不存在: ${BUNDLE_DIR}"
  echo "  请先运行: bash forge/scripts/build-dist.sh"
  exit 1
fi

# ---------- 执行安装 ----------
echo ""
echo "=== Forge 安装 ==="
echo "  平台: Claude Code"
echo "  来源: ${BUNDLE_DIR}"
echo "  目标: ${TARGET}"
echo "  Dry Run: ${DRY_RUN}"
echo "  Backup: ${BACKUP}"
echo ""

if [[ "${DRY_RUN}" == "true" ]]; then
  info "[Dry Run] 将复制以下文件到 ${TARGET}/:"
  find "${BUNDLE_DIR}" -type f | while read -r f; do
    rel="${f#"${BUNDLE_DIR}"/}"
    echo "  ${rel}"
  done
  echo ""
  info "[Dry Run] 未执行任何操作。"
  exit 0
fi

# 备份
if [[ "${BACKUP}" == "true" && -d "${TARGET}" ]]; then
  backup_dir="${TARGET}.backup.$(date +%Y%m%d%H%M%S)"
  info "备份现有安装到: ${backup_dir}"
  cp -r "${TARGET}" "${backup_dir}"
  success "备份完成"
fi

# 安装
mkdir -p "$(dirname "${TARGET}")"
if [[ -d "${TARGET}" ]]; then
  warn "目标目录已存在，将覆盖: ${TARGET}"
  rm -rf "${TARGET}"
fi

cp -r "${BUNDLE_DIR}" "${TARGET}"
success "安装完成: ${TARGET}"

echo ""
echo "  下一步："
echo "    1. 在项目根目录运行: ${TARGET}/scripts/init.sh"
echo "    2. 开始使用: /tinkerman <任务描述>"
echo ""
