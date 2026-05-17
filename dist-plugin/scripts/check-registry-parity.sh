#!/bin/bash
# CI gate for registry/lib parity
set -euo pipefail
node scripts/regen-skill-registry.mjs --check-only
