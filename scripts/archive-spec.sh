#!/usr/bin/env bash
# category: user-facing
# ============================================================================
# archive-spec.sh — Archive a completed spec and optionally purge CC state.
#
# Moves spec/plan/progress files to .forge/archive/<date>-<slug>/, then
# optionally runs `claude project purge` to clean Claude Code transcripts.
#
# Usage:
#   bash scripts/archive-spec.sh <slug> [--purge-cc=ask|skip|auto]
#
# Environment:
#   FORGE_ARCHIVE_CC_PURGE_DEFAULT  (default: ask)
#
# Exit codes:
#   0 — archive succeeded (CC purge may or may not have run)
#   1 — file-level archive failed (fatal)
#   2 — CC purge execution failed (archive already done, warning only)
#   3 — argument error
# ============================================================================

set -euo pipefail

# ---------- Colors ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✅${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
error()   { echo -e "${RED}❌${NC} $1"; }

# ---------- Defaults ----------
PURGE_CC="${FORGE_ARCHIVE_CC_PURGE_DEFAULT:-ask}"
SLUG=""
ARCHIVE_DATE="$(date +%Y-%m-%d)"

# ---------- Argument parsing ----------
parse_args() {
  local positional=()

  for arg in "$@"; do
    case "$arg" in
      --help|-h)
        echo "用法: scripts/archive-spec.sh <slug> [--purge-cc=ask|skip|auto]"
        echo ""
        echo "归档已完成的 spec，并可选清理 Claude Code transcripts。"
        echo ""
        echo "参数:"
        echo "  <slug>                       Spec slug（如 my-feature）"
        echo "  --purge-cc=ask|skip|auto     CC purge 模式（默认: ask）"
        echo ""
        echo "  ask   交互确认两次（dry-run 预览 → 执行）"
        echo "  skip  跳过 CC 清理"
        echo "  auto  自动执行（CI 场景）"
        echo ""
        echo "环境变量:"
        echo "  FORGE_ARCHIVE_CC_PURGE_DEFAULT  默认 purge 模式（默认: ask）"
        echo ""
        echo "退出码:"
        echo "  0  归档成功"
        echo "  1  文件级归档失败"
        echo "  2  CC purge 执行失败（归档已完成）"
        echo "  3  参数错误"
        exit 0
        ;;
      --purge-cc=ask|--purge-cc=skip|--purge-cc=auto)
        PURGE_CC="${arg#--purge-cc=}"
        ;;
      --purge-cc=*)
        error "--purge-cc 值无效: ${arg#--purge-cc=}（必须是 ask|skip|auto）"
        exit 3
        ;;
      -*)
        error "未知选项: $arg"
        exit 3
        ;;
      *)
        positional+=("$arg")
        ;;
    esac
  done

  if [[ ${#positional[@]} -eq 0 ]]; then
    error "缺少 <slug> 参数"
    echo "用法: scripts/archive-spec.sh <slug> [--purge-cc=ask|skip|auto]"
    exit 3
  fi

  SLUG="${positional[0]}"
}

# ---------- Phase 1: File-level archive ----------

do_file_archive() {
  local slug="$1"
  local archive_dir=".forge/archive/${ARCHIVE_DATE}-${slug}"

  # Validate slug format
  if [[ ! "$slug" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    error "Slug 格式无效: $slug（仅允许字母、数字、连字符、下划线）" >&2
    return 1
  fi

  # Check at least one source exists
  local spec_dir=".forge/specs/${slug}"
  local plan_file=".forge/plans/${slug}.md"
  local progress_file=".forge/progress/${slug}.md"

  local found=0
  [[ -d "${spec_dir}" ]] && found=1
  [[ -f "${plan_file}" ]] && found=1
  [[ -f "${progress_file}" ]] && found=1

  if [[ $found -eq 0 ]]; then
    error "未找到 slug '${slug}' 对应的 spec/plan/progress 文件" >&2
    return 1
  fi

  # Create archive directory
  mkdir -p "${archive_dir}"

  # Move spec directory
  if [[ -d "${spec_dir}" ]]; then
    mv "${spec_dir}" "${archive_dir}/spec"
    success "已归档 spec: ${spec_dir} → ${archive_dir}/spec" >&2
  fi

  # Move plan file
  if [[ -f "${plan_file}" ]]; then
    mv "${plan_file}" "${archive_dir}/plan.md"
    success "已归档 plan: ${plan_file} → ${archive_dir}/plan.md" >&2
  fi

  # Move progress file
  if [[ -f "${progress_file}" ]]; then
    mv "${progress_file}" "${archive_dir}/progress.md"
    success "已归档 progress: ${progress_file} → ${archive_dir}/progress.md" >&2
  fi

  # Write archive manifest
  cat > "${archive_dir}/archive-manifest.md" << MANIFEST_EOF
---
slug: "${slug}"
archive_date: "${ARCHIVE_DATE}"
archive_version: 1
---

# Archive Manifest

- **Slug**: ${slug}
- **Archive Date**: ${ARCHIVE_DATE}
- **Source Files**: $(ls "${archive_dir}" | grep -v archive-manifest.md | tr '\n' ', ')
MANIFEST_EOF

  success "文件级归档完成: ${archive_dir}" >&2
  # Only stdout is the archive_dir (captured by caller)
  echo "${archive_dir}"
  return 0
}

# ---------- Phase 2-5: CC purge ----------

resolve_project_path() {
  # Handle worktree scenario
  local common_dir
  common_dir=$(git rev-parse --git-common-dir 2>/dev/null) || {
    warn "非 git 项目，无法解析 project path"
    return 1
  }
  local git_dir
  git_dir=$(git rev-parse --git-dir 2>/dev/null)

  if [[ "${common_dir}" == "${git_dir}" ]]; then
    # Not a worktree — use repo root
    git rev-parse --show-toplevel
  else
    # Worktree — common_dir points to main repo's .git
    dirname "${common_dir}"
  fi
}

check_blacklist() {
  local path="$1"
  local home_root
  home_root="$(cd ~ && pwd)"

  case "$path" in
    /|/tmp|/tmp/*|"${home_root}"|"${home_root}/")
      error "拒绝对敏感路径执行 purge: ${path}"
      return 1
      ;;
  esac
  return 0
}

detect_cc_version() {
  local version_str
  version_str=$(claude --version 2>/dev/null) || {
    echo "not_installed"
    return 0
  }
  echo "${version_str}" | head -1
}

cc_purge_preview() {
  local project_path="$1"
  claude project purge "${project_path}" --dry-run 2>&1 || {
    echo "cc_purge_unavailable"
    return 127
  }
}

cc_purge_execute() {
  local project_path="$1"
  claude project purge "${project_path}" --yes 2>&1
}

# ---------- Phase 3-5: CC purge orchestration ----------

do_cc_purge() {
  local archive_dir="$1"
  local purge_flag="$2"

  if [[ "${purge_flag}" == "skip" ]]; then
    info "CC purge 已跳过（--purge-cc=skip）"
    return 0
  fi

  # Resolve project path
  local project_path
  project_path=$(resolve_project_path) || {
    warn "非 git 项目，跳过 CC transcripts 清理"
    return 0
  }

  # Blacklist check
  check_blacklist "${project_path}" || return 2

  # CC availability check
  local cc_version
  cc_version=$(detect_cc_version)
  if [[ "${cc_version}" == "not_installed" ]]; then
    warn "claude 未安装，跳过 CC transcripts 清理"
    return 0
  fi

  # Dry-run preview
  info "正在执行 CC purge dry-run..."
  local dry_output
  dry_output=$(cc_purge_preview "${project_path}")
  local dry_rc=$?

  if [[ "${dry_output}" == "cc_purge_unavailable" ]] || [[ $dry_rc -ne 0 ]]; then
    warn "CC 版本不支持 purge 或 dry-run 失败，跳过清理"
    return 0
  fi

  echo ""
  info "CC Purge Dry-Run 结果:"
  echo "${dry_output}"
  echo ""

  # Prompt 1 (unless auto)
  if [[ "${purge_flag}" == "ask" ]]; then
    if [[ -t 0 ]]; then
      read -rp "是否确认执行 CC purge？[y/N] " confirm1
      if [[ "${confirm1}" != "y" && "${confirm1}" != "Y" ]]; then
        info "用户拒绝 dry-run 预览阶段"
        return 0
      fi
    else
      warn "非 TTY 且 --purge-cc=ask，跳过 purge"
      return 0
    fi
  fi

  # Execute purge
  info "正在执行 CC purge..."
  local exec_output
  exec_output=$(cc_purge_execute "${project_path}") || {
    error "CC purge 执行失败"
    echo "${exec_output}"
    return 2
  }

  success "CC purge 完成"
  echo "${exec_output}"
  return 0
}

# ---------- Main ----------

main() {
  parse_args "$@"

  info "归档 spec: ${SLUG}"
  info "CC purge 模式: ${PURGE_CC}"

  # Phase 1: File-level archive
  local archive_dir
  archive_dir=$(do_file_archive "${SLUG}") || {
    error "文件级归档失败"
    exit 1
  }

  # Phase 2-5: CC purge
  do_cc_purge "${archive_dir}" "${PURGE_CC}" || {
    local rc=$?
    if [[ $rc -eq 2 ]]; then
      warn "CC purge 执行失败（归档已完成）"
      exit 2
    fi
  }

  success "归档完成: ${archive_dir}"
  exit 0
}

main "$@"
