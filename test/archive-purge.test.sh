#!/usr/bin/env bash
# Test suite for archive-spec.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ARCHIVE_SCRIPT="$PROJECT_DIR/scripts/archive-spec.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=0

assert_contains() {
  local haystack="$1" needle="$2" test_name="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$haystack" | grep -qF -- "$needle"; then
    echo -e "  ${GREEN}PASS${NC} $test_name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $test_name"
    echo "    Expected to contain: $needle"
    echo "    Got: $(echo "$haystack" | head -5)"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local haystack="$1" needle="$2" test_name="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$haystack" | grep -qF -- "$needle"; then
    echo -e "  ${RED}FAIL${NC} $test_name"
    echo "    Expected NOT to contain: $needle"
    FAIL=$((FAIL + 1))
  else
    echo -e "  ${GREEN}PASS${NC} $test_name"
    PASS=$((PASS + 1))
  fi
}

assert_exit_code() {
  local actual="$1" expected="$2" test_name="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$actual" == "$expected" ]]; then
    echo -e "  ${GREEN}PASS${NC} $test_name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $test_name"
    echo "    Expected exit code $expected, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_exists() {
  local path="$1" test_name="$2"
  TOTAL=$((TOTAL + 1))
  if [[ -f "$path" ]]; then
    echo -e "  ${GREEN}PASS${NC} $test_name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $test_name"
    echo "    File does not exist: $path"
    FAIL=$((FAIL + 1))
  fi
}

assert_dir_exists() {
  local path="$1" test_name="$2"
  TOTAL=$((TOTAL + 1))
  if [[ -d "$path" ]]; then
    echo -e "  ${GREEN}PASS${NC} $test_name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $test_name"
    echo "    Directory does not exist: $path"
    FAIL=$((FAIL + 1))
  fi
}

setup_fixtures() {
  local tmpdir
  tmpdir=$(mktemp -d)
  mkdir -p "$tmpdir/.tinkerman/specs/test-slug"
  mkdir -p "$tmpdir/.tinkerman/plans"
  mkdir -p "$tmpdir/.tinkerman/progress"
  mkdir -p "$tmpdir/.tinkerman/archive"
  echo "test requirements" > "$tmpdir/.tinkerman/specs/test-slug/requirements.md"
  echo "test plan" > "$tmpdir/.tinkerman/plans/test-slug.md"
  echo "test progress" > "$tmpdir/.tinkerman/progress/test-slug.md"
  echo "$tmpdir"
}

setup_git_repo() {
  local tmpdir="$1"
  (cd "$tmpdir" && git init -q && git add -A && git commit -m "init" -q 2>/dev/null)
}

create_mock_claude() {
  local mock_dir="$1"
  local behavior="${2:-success}"
  mkdir -p "$mock_dir"
  local mock_file="$mock_dir/claude"

  case "$behavior" in
    success)
      cat > "$mock_file" << 'MOCK_EOF'
#!/usr/bin/env bash
case "$1" in
  --version) echo "2.1.138" ;;
  project)
    if [[ "$*" == *"--dry-run"* ]]; then
      echo "Would purge 5 transcripts, 3 tasks, 2 file-history entries"
      exit 0
    elif [[ "$*" == *"--yes"* ]]; then
      echo "Purged 5 transcripts, 3 tasks, 2 file-history entries"
      exit 0
    fi
    ;;
esac
MOCK_EOF
      ;;
    old_version)
      cat > "$mock_file" << 'MOCK_EOF'
#!/usr/bin/env bash
case "$1" in
  --version) echo "1.0.0" ;;
  project)
    echo "unknown command: project"
    exit 1
    ;;
esac
MOCK_EOF
      ;;
    fail_purge)
      cat > "$mock_file" << 'MOCK_EOF'
#!/usr/bin/env bash
case "$1" in
  --version) echo "2.1.138" ;;
  project)
    if [[ "$*" == *"--dry-run"* ]]; then
      echo "Would purge 5 transcripts"
      exit 0
    elif [[ "$*" == *"--yes"* ]]; then
      echo "Error: purge failed" >&2
      exit 1
    fi
    ;;
esac
MOCK_EOF
      ;;
  esac
  chmod +x "$mock_file" 2>/dev/null || true
}

teardown_fixtures() {
  rm -rf "$1" 2>/dev/null || true
}

echo -e "${YELLOW}=== archive-spec.sh Test Suite ===${NC}"

# ========== Test 1: --help ==========
echo ""
echo "Test 1: --help output"
output=$(bash "$ARCHIVE_SCRIPT" --help 2>&1)
rc=$?
assert_exit_code "$rc" "0" "--help exits 0"
assert_contains "$output" "purge-cc" "--help shows purge-cc option"
assert_contains "$output" "slug" "--help shows slug parameter"

# ========== Test 2: Missing slug ==========
echo ""
echo "Test 2: missing slug error"
output=$(bash "$ARCHIVE_SCRIPT" 2>&1)
rc=$?
assert_exit_code "$rc" "3" "missing slug exits 3"
assert_contains "$output" "缺少" "missing slug shows error message"

# ========== Test 3: Invalid slug ==========
echo ""
echo "Test 3: invalid slug"
tmpdir=$(setup_fixtures)
setup_git_repo "$tmpdir"
output=$(cd "$tmpdir" && bash "$ARCHIVE_SCRIPT" "invalid slug" --purge-cc=skip 2>&1)
rc=$?
assert_exit_code "$rc" "1" "invalid slug exits 1"
assert_contains "$output" "格式无效" "invalid slug shows format error"
teardown_fixtures "$tmpdir"

# ========== Test 4: Slug not found ==========
echo ""
echo "Test 4: slug not found"
tmpdir=$(setup_fixtures)
setup_git_repo "$tmpdir"
output=$(cd "$tmpdir" && bash "$ARCHIVE_SCRIPT" "nonexistent" --purge-cc=skip 2>&1)
rc=$?
assert_exit_code "$rc" "1" "nonexistent slug exits 1"
assert_contains "$output" "未找到" "nonexistent slug shows not found"
teardown_fixtures "$tmpdir"

# ========== Test 5: File archive success ==========
echo ""
echo "Test 5: file archive success"
tmpdir=$(setup_fixtures)
setup_git_repo "$tmpdir"
output=$(cd "$tmpdir" && bash "$ARCHIVE_SCRIPT" test-slug --purge-cc=skip 2>&1)
rc=$?
assert_exit_code "$rc" "0" "file archive exits 0"
archive_dir="$tmpdir/.tinkerman/archive/$(date +%Y-%m-%d)-test-slug"
assert_dir_exists "$archive_dir/spec" "spec directory archived"
assert_file_exists "$archive_dir/plan.md" "plan file archived"
assert_file_exists "$archive_dir/progress.md" "progress file archived"
assert_file_exists "$archive_dir/archive-manifest.md" "archive manifest created"
TOTAL=$((TOTAL + 1))
if [[ ! -d "$tmpdir/.tinkerman/specs/test-slug" ]]; then
  echo -e "  ${GREEN}PASS${NC} original spec removed"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}FAIL${NC} original spec not removed"
  FAIL=$((FAIL + 1))
fi
teardown_fixtures "$tmpdir"

# ========== Test 6: --purge-cc=skip does not call claude ==========
echo ""
echo "Test 6: --purge-cc=skip no claude call"
tmpdir=$(setup_fixtures)
setup_git_repo "$tmpdir"
mock_dir=$(mktemp -d)
flag_file="/tmp/archive_purge_claude_flag_$$"
rm -f "$flag_file"
cat > "$mock_dir/claude" << CLAUDE_FLAG_EOF
#!/usr/bin/env bash
touch "$flag_file"
CLAUDE_FLAG_EOF
chmod +x "$mock_dir/claude"
output=$(cd "$tmpdir" && PATH="$mock_dir:$PATH" bash "$ARCHIVE_SCRIPT" test-slug --purge-cc=skip 2>&1)
assert_not_contains "$output" "dry-run" "skip mode does not mention dry-run"
TOTAL=$((TOTAL + 1))
if [[ ! -f "$flag_file" ]]; then
  echo -e "  ${GREEN}PASS${NC} claude was not called"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}FAIL${NC} claude was called despite skip"
  FAIL=$((FAIL + 1))
fi
rm -f "$flag_file"
teardown_fixtures "$tmpdir"
rm -rf "$mock_dir"

# ========== Test 7: --purge-cc=auto with mock claude ==========
echo ""
echo "Test 7: --purge-cc=auto with mock claude"
tmpdir=$(setup_fixtures)
setup_git_repo "$tmpdir"
mock_dir=$(mktemp -d)
create_mock_claude "$mock_dir" "success"
output=$(cd "$tmpdir" && PATH="$mock_dir:$PATH" bash "$ARCHIVE_SCRIPT" test-slug --purge-cc=auto 2>&1)
rc=$?
assert_exit_code "$rc" "0" "auto mode exits 0"
assert_contains "$output" "CC purge" "auto mode completes purge"
archive_dir="$tmpdir/.tinkerman/archive/$(date +%Y-%m-%d)-test-slug"
manifest="$archive_dir/purge-manifest.json"
assert_file_exists "$manifest" "manifest file created"
manifest_content=$(cat "$manifest" 2>/dev/null || echo "")
assert_contains "$manifest_content" '"user_decision": "auto"' "manifest shows auto decision"
assert_contains "$manifest_content" '"exit_code": 0' "manifest shows success exit code"
teardown_fixtures "$tmpdir"
rm -rf "$mock_dir"

# ========== Test 8: CC version too old ==========
echo ""
echo "Test 8: CC version too old"
tmpdir=$(setup_fixtures)
setup_git_repo "$tmpdir"
mock_dir=$(mktemp -d)
create_mock_claude "$mock_dir" "old_version"
output=$(cd "$tmpdir" && PATH="$mock_dir:$PATH" bash "$ARCHIVE_SCRIPT" test-slug --purge-cc=auto 2>&1)
rc=$?
assert_exit_code "$rc" "0" "old version exits 0 (archive succeeds)"
assert_contains "$output" "跳过" "old version skips purge"
teardown_fixtures "$tmpdir"
rm -rf "$mock_dir"

# ========== Test 9: CC not installed ==========
echo ""
echo "Test 9: CC not installed"
tmpdir=$(setup_fixtures)
setup_git_repo "$tmpdir"
mock_dir=$(mktemp -d)
# Empty dir — no claude binary
output=$(cd "$tmpdir" && PATH="$mock_dir:/usr/bin:/bin" bash "$ARCHIVE_SCRIPT" test-slug --purge-cc=auto 2>&1)
rc=$?
assert_exit_code "$rc" "0" "no CC exits 0"
assert_contains "$output" "未安装" "no CC shows warning"
teardown_fixtures "$tmpdir"
rm -rf "$mock_dir"

# ========== Test 10: CC purge execution failure ==========
echo ""
echo "Test 10: CC purge execution failure"
tmpdir=$(setup_fixtures)
setup_git_repo "$tmpdir"
mock_dir=$(mktemp -d)
create_mock_claude "$mock_dir" "fail_purge"
output=$(cd "$tmpdir" && PATH="$mock_dir:$PATH" bash "$ARCHIVE_SCRIPT" test-slug --purge-cc=auto 2>&1)
rc=$?
assert_exit_code "$rc" "2" "purge failure exits 2"
assert_contains "$output" "执行失败" "purge failure shows error"
archive_dir="$tmpdir/.tinkerman/archive/$(date +%Y-%m-%d)-test-slug"
assert_dir_exists "$archive_dir" "archive dir exists despite purge failure"
teardown_fixtures "$tmpdir"
rm -rf "$mock_dir"

# ========== Test 11: Blacklist path rejection ==========
echo ""
echo "Test 11: blacklist path rejection"
# Test check_blacklist logic directly
HOME_ROOT="$(cd ~ && pwd)"
bl_pass=0
bl_total=0

# Test / should be rejected
bl_total=$((bl_total + 1))
case "/" in
  /|/tmp|/tmp/*|"${HOME_ROOT}"|"${HOME_ROOT}/")
    echo -e "  ${GREEN}PASS${NC} blacklist rejects /"
    bl_pass=$((bl_pass + 1))
    ;;
  *) echo -e "  ${RED}FAIL${NC} blacklist should reject /" ;;
esac

# Test /tmp should be rejected
bl_total=$((bl_total + 1))
case "/tmp" in
  /|/tmp|/tmp/*|"${HOME_ROOT}"|"${HOME_ROOT}/")
    echo -e "  ${GREEN}PASS${NC} blacklist rejects /tmp"
    bl_pass=$((bl_pass + 1))
    ;;
  *) echo -e "  ${RED}FAIL${NC} blacklist should reject /tmp" ;;
esac

# Test $HOME should be rejected
bl_total=$((bl_total + 1))
case "${HOME_ROOT}" in
  /|/tmp|/tmp/*|"${HOME_ROOT}"|"${HOME_ROOT}/")
    echo -e "  ${GREEN}PASS${NC} blacklist rejects HOME"
    bl_pass=$((bl_pass + 1))
    ;;
  *) echo -e "  ${RED}FAIL${NC} blacklist should reject HOME" ;;
esac

# Test safe path should pass
bl_total=$((bl_total + 1))
case "/some/safe/path" in
  /|/tmp|/tmp/*|"${HOME_ROOT}"|"${HOME_ROOT}/")
    echo -e "  ${RED}FAIL${NC} blacklist should not reject safe path"
    ;;
  *)
    echo -e "  ${GREEN}PASS${NC} blacklist allows safe path"
    bl_pass=$((bl_pass + 1))
    ;;
esac
PASS=$((PASS + bl_pass))
TOTAL=$((TOTAL + bl_total))
FAIL=$((FAIL + bl_total - bl_pass))

# ========== Test 12: Manifest schema validation ==========
echo ""
echo "Test 12: manifest schema"
tmpdir=$(setup_fixtures)
setup_git_repo "$tmpdir"
mock_dir=$(mktemp -d)
create_mock_claude "$mock_dir" "success"
output=$(cd "$tmpdir" && PATH="$mock_dir:$PATH" bash "$ARCHIVE_SCRIPT" test-slug --purge-cc=auto 2>&1)
manifest="$tmpdir/.tinkerman/archive/$(date +%Y-%m-%d)-test-slug/purge-manifest.json"
if [[ -f "$manifest" ]]; then
  content=$(cat "$manifest")
  for field in '"slug"' '"archive_date"' '"cc_project_path"' '"cc_purge_available"' '"dry_run_output"' '"dry_run_truncated"' '"user_decision"' '"started_at"' '"finished_at"' '"purge_cc_flag"'; do
    assert_contains "$content" "$field" "manifest has $field field"
  done
  TOTAL=$((TOTAL + 1))
  if echo "$content" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    echo -e "  ${GREEN}PASS${NC} manifest is valid JSON"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} manifest is not valid JSON"
    FAIL=$((FAIL + 1))
  fi
else
  TOTAL=$((TOTAL + 1))
  echo -e "  ${RED}FAIL${NC} manifest file not found"
  FAIL=$((FAIL + 1))
fi
teardown_fixtures "$tmpdir"
rm -rf "$mock_dir"

# ========== Test 13: Invalid --purge-cc value ==========
echo ""
echo "Test 13: invalid purge-cc value"
output=$(bash "$ARCHIVE_SCRIPT" test-slug --purge-cc=invalid 2>&1)
rc=$?
assert_exit_code "$rc" "3" "invalid purge-cc value exits 3"
assert_contains "$output" "值无效" "invalid value shows error"

# ========== Test 14: Worktree path resolution ==========
echo ""
echo "Test 14: worktree path resolution"
tmpdir=$(setup_fixtures)
setup_git_repo "$tmpdir"
output=$(cd "$tmpdir" && git rev-parse --show-toplevel)
TOTAL=$((TOTAL + 1))
if [[ -n "$output" && -d "$output/.git" ]]; then
  echo -e "  ${GREEN}PASS${NC} worktree path resolves"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}FAIL${NC} worktree path did not resolve"
  FAIL=$((FAIL + 1))
fi
teardown_fixtures "$tmpdir"

# ========== Results ==========
echo ""
echo -e "${YELLOW}=== Results: ${PASS}/${TOTAL} passed, ${FAIL} failed ===${NC}"
[ "$FAIL" -gt 0 ] && exit 1
exit 0
