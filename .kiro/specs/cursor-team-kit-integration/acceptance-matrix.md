# Acceptance Matrix — cursor-team-kit-integration

> Mapping R1–R14 acceptance criteria → implementation tasks → test files.
> Use as a pre-release review checklist.

| Requirement | AC | Task | Implementation | Test File |
|---|---|---|---|---|
| R1.1 | Three-state verdict output (VERIFIED/NOT_VERIFIED/INCONCLUSIVE) | 1.1/1.2 | `src/verify-verdict.ts` | `test/verify-verdict-totality.property.test.ts` |
| R1.2 | Falsifiable claim parsing (condition + metric + threshold) | 1.3 | `src/verify-claim-parser.ts` | `test/verify-claim-parser.test.ts` |
| R1.3 | Baseline-vs-treatment artifact pair | 2.1/2.2 | `src/verify-baseline-resolver.ts` | `test/verify-baseline-resolver.test.ts` |
| R1.4 | 4-level fallback (exact → normalized → heuristic → manual) | 3.1/3.2 | `src/verify-baseline-resolver.ts` | `test/verify-baseline-resolver.test.ts` |
| R1.5 | INCONCLUSIVE state with evidence chain | 4.1–4.3 | `src/verify-verdict.ts` | `test/verify-inconclusive-paths.test.ts` |
| R1.6 | SKILL.md with Evidence_Chain format | 5.1 | `skills/forge-verify/SKILL.md` | `test/contract.skills.test.ts` |
| R1.7 | Imperative description + Use when trigger | 5.2 | `skills/forge-verify/SKILL.md` | `scripts/validate-skill-descriptions.mjs` |
| R2.1 | Deslop dimension added to quality-check | 6.1/6.2 | `.claude/agents/quality-check.md §7` | `test/contract.skills.test.ts` |
| R2.2 | Deslop rules configurable | 6.3 | `rules/deslop-*.md` | — |
| R3.1 | `rules/` directory with starter set | 7.1 | `rules/*.md` | `test/rules-loader-starter-set.test.ts` |
| R3.2 | Rule loader parses frontmatter | 7.2 | `src/rules-loader.ts` | `test/rules-loader-roundtrip.property.test.ts` |
| R4.1 | HTML canvas generation (dark theme) | 8.1–8.4 | `src/canvas-renderer.ts` | `test/canvas-renderer.integration.test.ts` |
| R4.2 | XSS-safe output | 9.1/9.2 | `src/secret-redactor.ts` | `test/secret-redactor.test.ts` |
| R4.3 | Bitbucket MCP integration (optional) | 10.1/10.2 | `src/bitbucket-mcp-adapter.ts` | `test/canvas-bitbucket-degradation.test.ts` |
| R4.4 | Canvas property tests | 11.1–11.5 | `src/canvas-renderer.ts` | `test/canvas-xss-safe.property.test.ts` |
| R5.1 | CLI harness tier detection (A/B/C) | 12.1–14.5 | `src/cli-harness.ts` | `test/cli-harness-tier-selection.test.ts` |
| R6.1 | UI harness tier detection (A/B/C) | 15.1–15.7 | `src/ui-harness.ts` | `test/ui-harness-tier-selection.test.ts` |
| R6.2 | E2E harness test infrastructure | 17.1 | `test/e2e/forge-loop-cli.harness.test.ts` | — |
| R7.1 | Zone classification (frozen/guarded/open/source) | 18.1–18.4 | `src/conflict-classifier.ts` | `test/conflict-classifier-totality.property.test.ts` |
| R7.2 | Zone-normalized merge strategy | 19.1–19.5 | `src/fix-conflicts.ts` | `test/fix-conflicts-guarded-merge.test.ts` |
| R7.3 | Frozen zone refusal | 20.1–20.5 | `src/fix-conflicts.ts` | `test/fix-conflicts-frozen-refuse.test.ts` |
| R8.1 | Post-push verify execution | 21.1–21.3 | `src/ship.ts` | `test/ship-post-push-verify.test.ts` |
| R8.2 | Post-push verify config field | 21.4 | `.forge/config.md` | — |
| R8.3 | Ship open zone registration | 21.4 | `.forge/config.md` | — |
| R9.1 | Recap time window parsing | 22.1–22.3 | `src/recap.ts` | `test/recap-idempotent.property.test.ts` |
| R9.2 | Recap multi-source aggregation | 22.4–22.6 | `src/recap-aggregator.ts` | — |
| R10.1 | From-chats extraction | 23.1–23.5 | `src/chat-preference-extractor.ts` | `test/from-chats-confidence.test.ts` |
| R10.2 | Preference atom dedup | 23.3 | `src/chat-preference-extractor.ts` | `test/chat-extractor-dedup.property.test.ts` |
| R11.1 | Background subagent flag | 24.1–24.3 | `.claude/agents/quality-check.md` + `security-check.md` frontmatter | — |
| R11.2 | Fan-in resilience (Promise.allSettled) | 24.4/24.5 | `src/subagent-runner.ts` | `test/review-background-fan-in.test.ts` |
| R12.1 | Canvas render ≤ 2s for 50 findings | 25.1 | `src/canvas-renderer.ts` | benchmark test |
| R12.2 | Verify budget enforcement | 25.2 | `src/verify-verdict.ts` | — |
| R12.3 | Findings retention config | 25.3/25.4 | `scripts/prune-event-logs.sh` | `test/prune-findings-retention.test.sh` |
| R12.4 | Event log retention config | 25.3 | `.forge/config.md` | — |
| R12.5 | Secret redaction in canvas | 9.1/9.2 | `src/secret-redactor.ts` | `test/secret-redactor.test.ts` |
| R12.6 | i18n parity (en/zh) | 26.1 | `src/i18n.ts` | `test/translation-parity.test.ts` |
| R12.7 | Bitbucket timeout handling | 10.1 | `src/bitbucket-mcp-adapter.ts` | `test/canvas-bitbucket-degradation.test.ts` |
| R12.8 | Acceptance scenario evaluation safety | — | `src/accept-driver.ts` | — |
| R12.9 | Input validation for config fields | — | `.forge/config.md` | — |
| R12.10 | Path hygiene in prune script | — | `scripts/prune-event-logs.sh` | — |
| R12.11 | Archive directory permissions | — | `scripts/prune-event-logs.sh` | — |
| R13.1 | Zone totality invariant (frozen+guarded+open+source = all paths) | 18.1 | `src/conflict-classifier.ts` | `test/conflict-classifier-totality.property.test.ts` |
| R13.2 | Verdict totality (VERIFIED+NOT_VERIFIED+INCONCLUSIVE = all outcomes) | 1.1 | `src/verify-verdict.ts` | `test/verify-verdict-totality.property.test.ts` |
| R14.1 | Bitbucket timeout handling | 10.1 | `src/bitbucket-mcp-adapter.ts` | `test/canvas-bitbucket-degradation.test.ts` |
| R14.2 | Empty reviews canvas | 11.5 | `src/canvas-renderer.ts` | `test/canvas-empty-reviews.test.ts` |
