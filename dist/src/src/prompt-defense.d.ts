/**
 * Prompt Defense — core types for input threat detection.
 *
 * This module defines the shared type surface used by the prompt-injection
 * scanner. The scanning implementation itself lives in a follow-up task;
 * here we only expose the vocabulary so that the pattern library
 * (`prompt-defense-patterns.ts`), router integration, tests, and error
 * reporting can all share a single definition.
 *
 * Design constraints (Requirements 5.1–5.12):
 *   - Types SHALL be IO-free and dependency-free.
 *   - The `Threat.pattern` field carries a pattern **id** (stable string)
 *     rather than the matched content. This keeps PII out of `ScanResult`,
 *     downstream logs and error messages (Requirement 5.12).
 *   - Severity levels are ordered from most to least critical for ease of
 *     sorting: "critical" > "high" > "medium" > "low".
 *   - `ScanResult.detectionTimeMs` is populated by the scanner using
 *     `performance.now()` deltas; the type only fixes the contract.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */
/**
 * Category of input threat detected by the scanner.
 *
 *  - `instruction_override`: attempts to negate, replace, or disregard the
 *    prior system / developer instructions ("ignore all previous
 *    instructions").
 *  - `jailbreak`: named jailbreak prompts or unrestricted-mode keywords
 *    ("DAN", "developer mode", "bypass restrictions").
 *  - `role_switching`: attempts to change the assistant's persona or role
 *    ("you are now …", "act as …", "pretend to be …").
 *  - `context_manipulation`: injection of fake control markers that
 *    impersonate system / assistant turns (`<|system|>`, `[system]`,
 *    ```` ```system ````).
 *  - `encoding_attack`: instructions to decode and execute obfuscated
 *    payloads (base64, rot13, hex).
 *  - `pii_exposure`: occurrence of personally identifiable information or
 *    secrets (emails, SSNs, API keys, PEM private keys, JWTs).
 */
export type ThreatType = "instruction_override" | "jailbreak" | "role_switching" | "context_manipulation" | "encoding_attack" | "pii_exposure";
/**
 * Severity level of a detected threat.
 *
 * Ordered from most to least critical. Downstream routing uses this field
 * to decide between outright rejection (`critical`), warning hints
 * (`high` / `medium`) and silent accumulation (`low`).
 */
export type ThreatSeverity = "critical" | "high" | "medium" | "low";
/**
 * A single detected threat occurrence.
 *
 * `pattern` is the **id** of the matching rule from
 * `prompt-defense-patterns.ts` (e.g. `"io-001"`), never the matched content.
 * This is required to keep PII and injected instructions out of error
 * payloads and structured logs (Requirement 5.12).
 *
 * `location`, when present, points into the original scanned text via
 * UTF-16 code-unit offsets (matching the semantics of `RegExp` `.exec`).
 * It is safe to surface these offsets in logs because they do not leak
 * content.
 */
export interface Threat {
    /** Threat category. */
    type: ThreatType;
    /** Severity bucket. */
    severity: ThreatSeverity;
    /** Detection confidence in the inclusive range `[0, 1]`. */
    confidence: number;
    /** Stable id of the pattern that matched (NOT the matched text). */
    pattern: string;
    /** Optional byte-range location of the match in the input. */
    location?: {
        start: number;
        end: number;
    };
}
/**
 * Result of scanning a single input string.
 *
 *  - `safe` is `true` iff no threats were detected.
 *  - `threats` is ordered by severity (critical → low); ordering within a
 *    severity bucket is implementation-defined but stable per call.
 *  - `detectionTimeMs` records wall-clock scan time; the performance
 *    budget (Requirement 5.8) caps this at 5 ms p95 for inputs up to 10 KB.
 */
export interface ScanResult {
    safe: boolean;
    threats: Threat[];
    detectionTimeMs: number;
}
/**
 * Scan an input string for prompt-injection and PII threats.
 *
 * This is a pure function: it performs no IO, maintains no state, and its
 * output depends only on `text` and the frozen `PATTERNS` library. The
 * only observation of the outside world is via `performance.now()` for
 * timing, which is treated as a deterministic measurement and excluded
 * from purity reasoning.
 *
 * ## Behaviour
 *
 *   - Iterates the pattern library in order, running each `RegExp.exec`
 *     against `text` exactly once. The first match per pattern is
 *     recorded; additional occurrences of the same pattern are ignored to
 *     keep runtime bounded and avoid duplicate noise.
 *   - For every match, appends a `Threat` with the pattern's `id` (never
 *     the matched content) and an optional `location` carrying UTF-16
 *     start/end offsets.
 *   - Sorts the resulting `threats` array by severity
 *     (critical → high → medium → low). Ordering within a severity bucket
 *     follows the original pattern-library order, since `Array.sort` is
 *     stable in modern JavaScript engines.
 *   - Populates `detectionTimeMs` with the elapsed wall-clock time in
 *     milliseconds.
 *
 * ## Invariants
 *
 *   - NEVER throws, even on adversarial input (empty string, very long
 *     strings, unicode, embedded null bytes).
 *   - NEVER includes matched text, PII values, or user-supplied strings
 *     in the returned `ScanResult` — only pattern ids and numeric
 *     offsets (Requirement 5.12).
 *   - The returned `threats` array is freshly allocated on every call, so
 *     callers may mutate it freely without affecting subsequent calls.
 *
 * @param text - Arbitrary input string to scan.
 * @returns Structured scan result. `safe === threats.length === 0`.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.12**
 */
export declare function scanInput(text: string): ScanResult;
