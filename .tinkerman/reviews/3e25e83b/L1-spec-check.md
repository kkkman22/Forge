# L1 spec-check — 3e25e83b

status: fail
findings: P0:0 P1:0 P2:1 P3:0

## Findings

### [P2] R-001: REQ-04 CI-visible misuse-detection leg not implemented
- **REQ**: REQ-04
- **Evidence**: sandbox-policy.ts:47-60 (only SANDBOX_DEFAULT_SEMANTICS data constant added); biome.json has no rule targeting legacy API; legacy fns have only static @deprecated JSDoc, no runtime warn; test/sandbox-policy.test.ts:1002-1016 only asserts constant exists.
- **Gap**: Spec EARS conditional-mandatory (requirements.md:131): "IF 本轮无法完成全部消费者迁移 THEN 模块 SHALL 至少为 legacy 消费者添加 lint 规则或运行时告警，使误用在 CI 可见". Migration deferred per D4 → lint/warning leg is TRIGGERED and MANDATORY. Only documentation leg delivered.
- **Fix**: biome noRestrictedImports (ban legacy symbols outside check-sandbox.ts/sdk-sandbox-policy.ts) OR one-shot runtime deprecation warn + test proving misuse flagged.

## PASS notes (6 REQs)
- REQ-01 PASS: extractProgressTimestamp parses @ <epoch-ms>, sentinel 0 (never Date.now); tie-break on completedAt; tests both directions + determinism property. INV-5 respected.
- REQ-02 PASS: UNPARSEABLE_ID sentinel replaces Math.random; isolation + verbatim preservation + locatable warning; reproducibility test. INV-5 respected.
- REQ-03 PASS: PEM (e) first, JWT (f), lowercase JSON alternation (b) with i flag; certificates excluded; existing 4 patterns unchanged.
- REQ-05 PASS: isMainEntry string-normalisation handles Windows drive+backslash; POSIX preserved; main() exit-code + frozen-zone logic untouched.
- REQ-06 PASS: acquireLockSync/releaseLockSync exported; audit-log wraps append in try/finally; ToolHealthLockTimeoutError fail-soft; HMAC chain + AuditEntry unchanged; spy proves shared primitive.
- REQ-07 PASS: HINT_RULES verbatim-moved to router-hint-rules.ts (pure data); golden-snapshot equivalence + ADDITIVE invariant; large-file split correctly deferred.

<!-- review-final -->
