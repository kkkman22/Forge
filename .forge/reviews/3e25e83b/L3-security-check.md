# L3 security-check — 3e25e83b

status: pass
findings: P0:0 P1:0 P2:3 P3:3

## Summary
Adversarial regex testing (PEM variants, JWT edges, 50k/200k-char ReDoS probes at 0ms), isMainEntry cross-platform trace, audit-log lock control-flow trace, hardcoded-secret scan. No ReDoS. No hardcoded secrets. INV-2 honoured (redaction strictly additive). Security headline changes sound.

## Findings

### [P2] R-001: PEM regex requires END footer — truncated/header-only key body leaks
- **File**: secret-redactor.ts:29
- **Risk**: Pattern (e) `[\s\S]*?-----END...` — key truncated before footer (log line-limit, partial paste, stream flush) matches nothing; base64 body leaks, has no `=` so pattern (c) misses it. Not a regression but creates false "PEM covered" impression.
- **Fix**: Add header-only pattern: `-----BEGIN [A-Z ]*PRIVATE KEY-----` + base64 body to blank/non-base64 line.

### [P2] R-002: Lock-timeout fail-soft silently drops record, breaking HMAC chain
- **File**: audit-log.ts:141-150
- **Risk**: On ToolHealthLockTimeoutError (5s), warn+return without write. Audit is tamper-evidence; dropping entry N breaks N+1's prev_hmac chain. PRE-EXISTING (old appendFile catch dropped too) and spec's INTENTIONAL design (REQ-06 fail-soft). Lock path widens drop surface.
- **Fix (backlog)**: gap-marker line with own HMAC, or buffer-retry. Exceeds REQ-06 "reuse existing primitive" scope.

### [P2] R-003: Stale-lock TOCTOU can steal slow holder's lock → torn records
- **File**: tool-health-writer.ts:127-137 (pre-existing, now shared by audit-log)
- **Risk**: acquireLockSync force-removes .lock older than 30s; if holder alive-but-slow (debugger/NFS), 2nd writer steals, both append → torn record (exactly what REQ-06 prevents). PRE-EXISTING in tool-health (F8); REQ-06 raises blast radius. Window small (single-line appendFileSync sub-ms).
- **Fix (backlog)**: PID-in-lockfile + live-PID check before steal, or flock. Would harden BOTH consumers; separate hardening spec.

### [P3] R-004: PGP private key blocks not redacted
- **File**: secret-redactor.ts:29
- **Risk**: `[A-Z ]*PRIVATE KEY-----` can't absorb ` BLOCK` after PRIVATE KEY (PGP = "PRIVATE KEY BLOCK"). OPENSSH/ENCRYPTED variants DO match. Niche for this tool's surface.
- **Fix**: generalize to `(?:PRIVATE KEY(?: BLOCK)?)`.

### [P3] R-005: JWT regex misses non-eyJ payloads; JSON escaped-quote partially leaks
- **File**: secret-redactor.ts:56, :40
- **Risk**: (1) payload first key empty-string → base64 `eyI...` not `eyJ` → missed. Rare. (2) pattern (b) `"[^"]*"` stops at first `"`; `{"secret":"abc\"def"}` leaks `def"`. Pre-existing limitation.
- **Fix (backlog)**: JWT anchor on eyJ header + any two base64url segments; JSON escaped-quote needs JSON-aware redactor (out of scope).

### [P3] R-006: isMainEntry misses URL-encoded POSIX paths + UNC (residual, non-regression)
- **File**: check-frozen.ts:182-205
- **Risk**: REQ-05 is security control — false-negative disables frozen-zone protection (P0-class). Verified: POSIX absolute unchanged (no regression), Windows drive+backslash now matches (strict improvement). Residual: POSIX space `%20` vs raw space, UNC `\\server\share` — both pre-existing, hook invoked via unencoded argv so practical risk low.
- **Fix (backlog)**: decodeURIComponent on URL side closes encoding gap cheaply.

## Sound (checked, no issue)
- No ReDoS: PEM `[A-Z ]*`+`[\s\S]*?` and JWT alternation linear; 50k/200k-char probes 0ms.
- No hardcoded secrets in diff.
- INV-2: redaction strictly additive; PEM-first never reduces coverage.
- REQ-01/02: Date.now/Math.random removed; deterministic sentinel; merge reproducible; unparseable lines preserved verbatim (no data loss).
- REQ-04: SANDBOX_DEFAULT_SEMANTICS pure data export, no runtime effect, accurate Phase1/legacy distinction.
- Lock-release correctness: timeout returns before finally → no double-release; non-timeout acquire error rethrows without releasing (O_EXCL failed). No leaked-lock path.
- redactSecrets not applied to audit entries (only bitbucket/triage adapters) — audit entries structured hashes/scalars, no free-form user text; redactor improvements don't need audit-path coverage.

<!-- review-final -->
