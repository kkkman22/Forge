#!/usr/bin/env bash
set -euo pipefail
spec_file="${1:?Usage: check-spec-contract.sh <spec-file>}"
[[ -f "$spec_file" ]] || { echo "ERROR: spec not found: $spec_file"; exit 1; }
script_dir="$(cd "$(dirname "$0")" && pwd)"
npx tsx -e "
import { validateContract } from '$script_dir/../src/contract-validator.ts';
import { readFileSync } from 'node:fs';
const spec = readFileSync('$spec_file', 'utf8');
const result = validateContract(spec);
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
