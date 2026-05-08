# Scripts Help Audit — 2026-05-08

## user_facing_with_help

- scripts/validate-skill-descriptions.mjs  ✓ (has Usage in --help output)
- scripts/validate-skill-length.mjs         ✓ (has Usage in --help output)
- scripts/validate-skill-skeleton.mjs       ✓ (has Usage in --help output)

## user_facing_missing_help

- scripts/init.sh               (需补齐 --help)
- scripts/build-dist.sh         (需补齐 --help)
- scripts/install-dist.sh       (需补齐 --help)
- scripts/prune-event-logs.sh   (需补齐 --help)
- scripts/validate-knowledge.sh (需补齐 --help)

## internal_only

- scripts/check-frozen.sh                  evidence: hooks/hook-check-frozen.sh
- scripts/hook-check-frozen.sh             evidence: hooks/hooks.json
- scripts/auto-resume.sh                   evidence: .claude/settings.json hook
- scripts/persistent-loop.sh               evidence: Stop hook
- scripts/run-with-trim.sh                 evidence: build pipeline wrapper
- scripts/check-no-bare-console.sh         evidence: CI check
- scripts/check-no-execsync.sh             evidence: CI check
- scripts/check-skill-function-refs.sh     evidence: CI check
- scripts/check-readme-metrics.sh          evidence: CI check
- scripts/validate-skill-descriptions.sh   evidence: thin .sh wrapper for .mjs
- scripts/validate-skill-length.sh         evidence: thin .sh wrapper for .mjs
- scripts/validate-skill-skeleton.sh       evidence: thin .sh wrapper for .mjs
- scripts/check-evolution-marker-zones.sh  evidence: thin .sh wrapper
- scripts/append-baseline.mjs             evidence: CI benchmark tool
- scripts/extract-bench-json.mjs          evidence: CI benchmark tool
- scripts/render-bench-markdown.mjs       evidence: CI benchmark tool
- scripts/check-coverage-regression.mjs   evidence: CI check
- scripts/check-public-api.mjs            evidence: CI check
- scripts/check-deps.mjs                  evidence: CI check
- scripts/check-evolution-marker-zones.mjs evidence: CI check
- scripts/inject-plan-context.mjs         evidence: hook tool

## exempt_from_help

See scripts/.help-exempt for the full list.
