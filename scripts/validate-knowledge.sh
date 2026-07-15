#!/usr/bin/env bash
set -uo pipefail
# category: user-facing
# ============================================================================
# forge validate-knowledge — 知识库健康检查
#
# 检查项：
#   1. solutions/ 文档数是否超过上限（默认 20）
#   2. instincts.md 中是否有低于 0.3 置信度的模式
#   3. 知识文档的 frontmatter 是否完整（title, tags, date, confidence）
#   4. known-failures.md 格式是否正确
#   5. sessions/ 日志是否有 frontmatter
#
# 用法：
#   bash forge/scripts/validate-knowledge.sh [--forge-root <path>]
#
# 默认 forge-root 为当前目录下的 .forge/
# ============================================================================

set -euo pipefail

# ---------- 颜色定义 ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

FORGE_ROOT=".forge"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      echo "Usage: scripts/validate-knowledge.sh [--forge-root <path>]"
      echo ""
      echo "Validate Forge knowledge base health."
      echo "Checks: document limits, confidence thresholds, frontmatter completeness."
      echo "  --forge-root <path>  Path to .forge/ directory (default: .forge)"
      exit 0
      ;;
    --forge-root) FORGE_ROOT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

check_pass() { echo -e "${GREEN}✅${NC} $1"; PASS=$((PASS+1)); }
check_fail() { echo -e "${RED}❌${NC} $1"; FAIL=$((FAIL+1)); }
check_warn() { echo -e "${YELLOW}⚠️${NC} $1"; WARN=$((WARN+1)); }

# ---------- 前置检查 ----------
if [[ ! -d "${FORGE_ROOT}" ]]; then
  echo -e "${RED}❌ .forge/ 目录不存在。请先运行 forge init。${NC}"
  exit 1
fi

if [[ ! -d "${FORGE_ROOT}/knowledge" ]]; then
  echo -e "${RED}❌ .forge/knowledge/ 目录不存在。${NC}"
  exit 1
fi

echo "=== Forge 知识库健康检查 ==="
echo "路径: ${FORGE_ROOT}/knowledge/"
echo ""

# ---------- 1. solutions/ 文档数量检查 ----------
SOLUTIONS_DIR="${FORGE_ROOT}/knowledge/solutions"
KNOWLEDGE_LIMIT=20

# 尝试从 config.md 读取 knowledge_limit
CONFIG_FILE="${FORGE_ROOT}/config.md"
if [[ -f "${CONFIG_FILE}" ]]; then
  limit_line=$(grep -E '^knowledge_limit:' "${CONFIG_FILE}" 2>/dev/null || true)
  if [[ -n "${limit_line}" ]]; then
    parsed_limit=$(echo "${limit_line}" | sed 's/knowledge_limit:[[:space:]]*//' | tr -d '[:space:]')
    if [[ "${parsed_limit}" =~ ^[0-9]+$ ]]; then
      KNOWLEDGE_LIMIT="${parsed_limit}"
    fi
  fi
fi

if [[ -d "${SOLUTIONS_DIR}" ]]; then
  doc_count=$(find "${SOLUTIONS_DIR}" -name "*.md" -type f 2>/dev/null | wc -l | tr -d '[:space:]')
  if [[ "${doc_count}" -le "${KNOWLEDGE_LIMIT}" ]]; then
    check_pass "solutions/ 文档数量: ${doc_count}/${KNOWLEDGE_LIMIT}"
  else
    check_fail "solutions/ 文档数量超限: ${doc_count}/${KNOWLEDGE_LIMIT}"
  fi
else
  check_pass "solutions/ 目录为空（尚未积累知识）"
fi

# ---------- 2. instincts.md 低置信度检查 ----------
INSTINCTS_FILE="${FORGE_ROOT}/knowledge/instincts.md"
if [[ -f "${INSTINCTS_FILE}" ]]; then
  # 查找 Confidence_Score 行，检查是否有低于 0.3 的
  low_confidence_count=0
  while IFS= read -r line; do
    score=$(echo "${line}" | grep -oE '[0-9]+\.[0-9]+' | head -1)
    if [[ -n "${score}" ]]; then
      # 用 awk 比较浮点数
      is_low=$(awk "BEGIN { print (${score} < 0.3) ? 1 : 0 }")
      if [[ "${is_low}" == "1" ]]; then
        low_confidence_count=$((low_confidence_count+1))
      fi
    fi
  done < <(grep -i 'confidence_score' "${INSTINCTS_FILE}" 2>/dev/null || true)

  if [[ "${low_confidence_count}" -eq 0 ]]; then
    check_pass "instincts.md 无低置信度模式（< 0.3）"
  else
    check_fail "instincts.md 有 ${low_confidence_count} 个低置信度模式（< 0.3），应清理"
  fi
else
  check_pass "instincts.md 不存在（尚未积累经验）"
fi

# ---------- 3. solutions/ frontmatter 完整性检查 ----------
if [[ -d "${SOLUTIONS_DIR}" ]]; then
  incomplete_count=0
  while IFS= read -r doc; do
    # 检查是否有 frontmatter
    first_line=$(head -1 "${doc}" 2>/dev/null | tr -d '[:space:]')
    if [[ "${first_line}" != "---" ]]; then
      check_warn "缺少 frontmatter: $(basename "${doc}")"
      incomplete_count=$((incomplete_count+1))
      continue
    fi

    # 检查必需字段
    frontmatter=$(sed -n '/^---$/,/^---$/p' "${doc}" 2>/dev/null)
    for field in title tags date confidence; do
      if ! echo "${frontmatter}" | grep -q "${field}:"; then
        check_warn "缺少字段 ${field}: $(basename "${doc}")"
        incomplete_count=$((incomplete_count+1))
        break
      fi
    done
  done < <(find "${SOLUTIONS_DIR}" -name "*.md" -type f 2>/dev/null)

  if [[ "${incomplete_count}" -eq 0 && "${doc_count}" -gt 0 ]]; then
    check_pass "solutions/ 所有文档 frontmatter 完整"
  fi
fi

# ---------- 4. known-failures.md 存在性检查 ----------
FAILURES_FILE="${FORGE_ROOT}/knowledge/known-failures.md"
if [[ -f "${FAILURES_FILE}" ]]; then
  check_pass "known-failures.md 存在"
else
  check_warn "known-failures.md 不存在（建议运行 forge init 或手动创建）"
fi

# ---------- 5. sessions/ 日志检查 ----------
SESSIONS_DIR="${FORGE_ROOT}/knowledge/sessions"
if [[ -d "${SESSIONS_DIR}" ]]; then
  session_count=$(find "${SESSIONS_DIR}" -name "*.md" -type f 2>/dev/null | wc -l | tr -d '[:space:]')
  if [[ "${session_count}" -gt 0 ]]; then
    check_pass "sessions/ 有 ${session_count} 条会话日志"
  else
    check_pass "sessions/ 为空（尚未记录会话）"
  fi
else
  check_pass "sessions/ 目录为空"
fi

# ---------- 汇总 ----------
echo ""
echo "=== 检查结果 ==="
echo -e "  ${GREEN}通过${NC}: ${PASS}"
echo -e "  ${RED}失败${NC}: ${FAIL}"
echo -e "  ${YELLOW}警告${NC}: ${WARN}"

if [[ "${FAIL}" -gt 0 ]]; then
  echo ""
  echo -e "${RED}知识库健康检查未通过。请修复以上问题。${NC}"
  exit 1
else
  echo ""
  echo -e "${GREEN}知识库健康检查通过。${NC}"
  exit 0
fi
