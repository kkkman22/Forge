#!/usr/bin/env bash
set -euo pipefail
# Usage: check-spec-contract.sh <spec-file> [--check-evidence]
#
# Validates spec Acceptance Criteria carry a layered `Verify-By` value
# (vitest:unit / vitest:component / bash:contract / forge_exec:e2e / manual)
# and non-placeholder Evidence. Specs with frontmatter `contract_legacy: true`
# skip validation (grandfathering).
#
# `--check-evidence` additionally verifies path-shaped Evidence tokens exist
# under the project root (Req1 AC7). Off by default for brownfield back-compat.
spec_file="${1:?Usage: check-spec-contract.sh <spec-file> [--check-evidence]}"
shift || true
check_evidence="false"
for arg in "$@"; do
  case "$arg" in
    --check-evidence) check_evidence="true" ;;
    *) echo "ERROR: unknown flag: $arg" >&2; exit 2 ;;
  esac
done
[[ -f "$spec_file" ]] || { echo "ERROR: spec not found: $spec_file"; exit 1; }
script_dir="$(cd "$(dirname "$0")" && pwd)"
project_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
npx tsx -e "
import { validateContract } from '$script_dir/../src/contract-validator.ts';
import { readFileSync } from 'node:fs';
const spec = readFileSync('$spec_file', 'utf8');
const opts = '$check_evidence' === 'true' ? { projectRoot: '$project_root' } : {};
const result = validateContract(spec, opts);
if (result.legacySkipped) {
  console.log('OK: contract_legacy spec, validation skipped');
  process.exit(0);
}
if (result.valid) {
  console.log('OK: contract template present and valid');
  process.exit(0);
}
for (const e of result.errors) console.error('ERROR:', e);
process.exit(1);
"
