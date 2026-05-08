#!/usr/bin/env bash
# category: internal-only
# ============================================================================
# check-skill-function-refs.sh — CI check for SKILL.md ↔ src/ function sync
#
# Scans all SKILL.md files for explicit function call references and verifies
# each one has a matching export in src/. Only matches lines with clear
# call-site markers (Function Call, 函数调用, Call `fn(`, 调用 `fn(`).
#
# This is a lightweight last-resort check; the primary validation is in
# test/contract.skill-function-sync.test.ts.
#
# Exit: 0 if all references match, 1 if any orphaned reference is found.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
ROOT_DIR="${SCRIPT_DIR}/.."
SKILLS_DIR="${ROOT_DIR}/skills"
SRC_DIR="${ROOT_DIR}/src"

errors=0

echo "SKILL Function Reference Check"
echo "==============================="

# Extract function references from a SKILL.md file.
# Only matches lines with explicit call-site markers to avoid false positives
# from code examples, git commit messages, and Claude Code invocation syntax.
#
# Matched patterns:
#   **Function Call**: `funcName(`
#   **Function call**: `funcName(`
#   **函数调用**：`funcName(`
#   Call `funcName(`  /  call `funcName(`
#   调用 `funcName(`
extract_refs() {
  local file="$1"
  # Step 1: grep lines with call-site markers + backtick function pattern
  grep -iE '(Function [Cc]all|函数调用|[Cc]all |调用 ).*`[a-zA-Z_][a-zA-Z0-9_]*\(' "$file" 2>/dev/null \
    | sed -E 's/.*`([a-zA-Z_][a-zA-Z0-9_]*)\(.*/\1/' \
    | sort -u
}

# Scan all SKILL.md files
while IFS= read -r skill_file; do
  skill_rel="${skill_file#"${SKILLS_DIR}/"}"

  while IFS= read -r func; do
    if [[ -z "$func" ]]; then
      continue
    fi

    # Search for "export function <func>" in src/
    if ! grep -rql "export function ${func}" "${SRC_DIR}/" 2>/dev/null; then
      echo "❌ skills/${skill_rel} references '${func}' but no matching export in src/"
      errors=$((errors + 1))
    fi
  done < <(extract_refs "$skill_file")
done < <(find "${SKILLS_DIR}" -name "SKILL.md" -type f)

if [[ $errors -gt 0 ]]; then
  echo ""
  echo "Found ${errors} SKILL-code sync error(s)."
  echo "Fix: add missing exports to src/ or update SKILL.md references."
  exit 1
fi

echo "All SKILL function references have matching exports ✓"

# ---------------------------------------------------------------------------
# --strict mode: verify registry entries have matching SKILL.md references
# Uses node to parse the TypeScript registry reliably.
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "--strict" ]]; then
  echo ""
  echo "Strict mode: verifying registry ↔ SKILL.md bidirectional sync..."

  node -e "
    const { readFileSync, existsSync } = require('fs');
    const { resolve } = require('path');
    const ROOT = '${ROOT_DIR}';
    const SKILLS = resolve(ROOT, 'skills');

    // Extract entries from registry TS source using regex
    const src = readFileSync(resolve(ROOT, 'src/skill-function-registry.ts'), 'utf8');
    const entries = [];
    let currentFunc = '';
    for (const line of src.split('\n')) {
      const fm = line.match(/functionName:\s*\"([^\"]+)\"/);
      if (fm) currentFunc = fm[1];
      const sm = line.match(/skills:\s*\[([^\]]+)\]/);
      if (sm && currentFunc) {
        const skills = [...sm[1].matchAll(/\"([^\"]+)\"/g)].map(m => m[1]);
        entries.push({ func: currentFunc, skills });
        currentFunc = '';
      }
    }

    let errors = 0;
    for (const { func, skills } of entries) {
      for (const skill of skills) {
        const path = resolve(SKILLS, skill);
        if (!existsSync(path)) {
          console.error('❌ Registry references ' + skill + ' but file not found (for ' + func + ')');
          errors++;
          continue;
        }
        const content = readFileSync(path, 'utf8');
        if (!content.includes(func)) {
          console.error('❌ ' + func + ' registered for ' + skill + ' but function name not found in SKILL.md');
          errors++;
        }
      }
    }

    if (errors > 0) {
      console.log('Found ' + errors + ' strict sync error(s).');
      process.exit(1);
    }
    console.log('All registry entries have matching SKILL.md references ✓');
  "
fi
