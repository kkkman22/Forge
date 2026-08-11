/**
 * Prompt Defense — threat pattern library.
 *
 * Curated, dependency-free regex rules used by `scanInput` to detect
 * prompt-injection, jailbreak, role-switching, context-manipulation,
 * encoding-based obfuscation and PII / secret exposure.
 *
 * ## Contract
 *
 *   - Every entry MUST have a unique `id` in kebab-case, prefixed by the
 *     category short-code (`io-*`, `jb-*`, `rs-*`, `cm-*`, `ea-*`,
 *     `pii-*`).
 *   - Patterns use bounded quantifiers to avoid catastrophic backtracking.
 *     In particular, no pattern contains `.*.*` or unbounded alternations.
 *   - `description` is human-readable metadata used for reporting only. It
 *     MUST NOT contain a concrete PII / secret value, because it surfaces
 *     in logs and error payloads (Requirement 5.12).
 *   - `baseConfidence` reflects how likely a regex match actually indicates
 *     the stated threat. Typical range is 0.70–0.99.
 *
 * ## Distribution (Requirement 5.4)
 *
 *   | Category              | Minimum | Actual |
 *   |-----------------------|---------|--------|
 *   | instruction_override  |     ≥ 4 |     6  |
 *   | jailbreak             |     ≥ 6 |     8  |
 *   | role_switching        |     ≥ 4 |     5  |
 *   | context_manipulation  |     ≥ 6 |     8  |
 *   | encoding_attack       |     ≥ 2 |     3  |
 *   | pii_exposure          |     ≥ 8 |     9  |
 *   | **Total**             |    ≥ 30 |    39  |
 *
 * **Validates: Requirements 5.3, 5.4**
 *
 * **Frozen zone**: modifications to this file require an ADR per
 * Requirement 5.10. Adding, removing, or weakening a rule SHALL be gated
 * through `/tinkerman decide` so that the rationale is captured in an
 * `ADR-NNNN` document before the change lands.
 */

import type { ThreatSeverity, ThreatType } from "./prompt-defense.js";

// ---------------------------------------------------------------------------
// Pattern contract
// ---------------------------------------------------------------------------

/**
 * A single threat-detection rule.
 *
 * See the file-level JSDoc for the invariants that every entry must
 * uphold.
 */
export interface ThreatPattern {
  /** Unique kebab-case identifier (e.g. `"io-001"`). */
  id: string;
  /** Regular expression, typically with the `i` (case-insensitive) flag. */
  pattern: RegExp;
  /** Category of the rule. */
  type: ThreatType;
  /** Severity bucket of a confirmed match. */
  severity: ThreatSeverity;
  /** Detection confidence in the inclusive range `[0, 1]`. */
  baseConfidence: number;
  /** Human-readable description — generic only, never includes sample values. */
  description: string;
}

// ---------------------------------------------------------------------------
// Pattern library
// ---------------------------------------------------------------------------

/**
 * Frozen, ordered list of all threat patterns.
 *
 * Consumers should treat this as read-only; the `ReadonlyArray` type
 * enforces that at compile time.
 */
export const PATTERNS: ReadonlyArray<ThreatPattern> = [
  // -------------------------------------------------------------------------
  // instruction_override — attempts to negate or replace prior directives
  // -------------------------------------------------------------------------
  {
    id: "io-001",
    pattern:
      /\bignore\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|preceding|earlier)\s+(?:instructions?|prompts?|rules?|directives?)\b/i,
    type: "instruction_override",
    severity: "critical",
    baseConfidence: 0.95,
    description: "imperative to ignore prior instructions",
  },
  {
    id: "io-002",
    pattern:
      /\b(?:forget|erase|wipe)\s+(?:all\s+|everything\s+)?(?:you\s+(?:were|have been)\s+(?:told|instructed|taught)|your\s+(?:instructions?|prompts?|training|guidelines?))\b/i,
    type: "instruction_override",
    severity: "critical",
    baseConfidence: 0.93,
    description: "imperative to forget prior instructions or training",
  },
  {
    id: "io-003",
    pattern:
      /\b(?:disregard|discard)\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|system)\s+(?:instructions?|prompts?|context|rules?)\b/i,
    type: "instruction_override",
    severity: "critical",
    baseConfidence: 0.92,
    description: "imperative to disregard prior instructions",
  },
  {
    id: "io-004",
    pattern:
      /\b(?:override|overwrite|replace)\s+(?:your\s+)?(?:system\s+|default\s+)?(?:instructions?|prompts?|behavior|rules?)\b/i,
    type: "instruction_override",
    severity: "critical",
    baseConfidence: 0.9,
    description: "imperative to override system instructions",
  },
  {
    id: "io-005",
    pattern:
      /\b(?:new|updated|revised)\s+(?:system\s+)?(?:instructions?|rules?|directives?)\s*(?::|\bare\b|\bfollow\b)/i,
    type: "instruction_override",
    severity: "high",
    baseConfidence: 0.8,
    description: "declaration of replacement instructions",
  },
  {
    id: "io-006",
    pattern:
      /\bstop\s+following\s+(?:the\s+|your\s+)?(?:previous|prior|earlier|system)\s+(?:instructions?|rules?|guidelines?)\b/i,
    type: "instruction_override",
    severity: "critical",
    baseConfidence: 0.9,
    description: "imperative to stop following prior instructions",
  },

  // -------------------------------------------------------------------------
  // jailbreak — named jailbreak prompts and unrestricted-mode keywords
  // -------------------------------------------------------------------------
  {
    id: "jb-001",
    pattern: /\bDAN\s+(?:mode|prompt)\b|\bdo\s+anything\s+now\b/i,
    type: "jailbreak",
    severity: "critical",
    baseConfidence: 0.95,
    description: "DAN (Do Anything Now) jailbreak prompt",
  },
  {
    id: "jb-002",
    pattern: /\b(?:enable|activate|enter|switch\s+to)\s+developer\s+mode\b/i,
    type: "jailbreak",
    severity: "critical",
    baseConfidence: 0.92,
    description: "developer-mode activation prompt",
  },
  {
    id: "jb-003",
    pattern:
      /\bbypass\s+(?:all\s+|any\s+|your\s+)?(?:restrictions?|filters?|safety|guardrails?|content\s+policy)\b/i,
    type: "jailbreak",
    severity: "critical",
    baseConfidence: 0.93,
    description: "imperative to bypass safety restrictions",
  },
  {
    id: "jb-004",
    pattern: /\b(?:unrestricted|unfiltered|uncensored)\s+(?:mode|ai|assistant|model|version)\b/i,
    type: "jailbreak",
    severity: "high",
    baseConfidence: 0.88,
    description: "request for unrestricted mode",
  },
  {
    id: "jb-005",
    pattern:
      /\b(?:with|have|has)\s+no\s+(?:limits?|restrictions?|filters?|rules?|morals?|ethics?)\b/i,
    type: "jailbreak",
    severity: "high",
    baseConfidence: 0.85,
    description: "claim of no operational limits",
  },
  {
    id: "jb-006",
    pattern: /\bjailbroken?\b|\bjail[-\s]?break(?:ing)?\b/i,
    type: "jailbreak",
    severity: "critical",
    baseConfidence: 0.9,
    description: "explicit jailbreak keyword",
  },
  {
    id: "jb-007",
    pattern:
      /\b(?:disable|remove|turn\s+off|switch\s+off)\s+(?:your\s+)?(?:safety|content\s+filter|moderation|guardrails?)\b/i,
    type: "jailbreak",
    severity: "critical",
    baseConfidence: 0.93,
    description: "imperative to disable safety or moderation",
  },
  {
    id: "jb-008",
    pattern:
      /\bpretend\s+(?:you|that\s+you)\s+(?:have\s+no|don'?t\s+have)\s+(?:rules?|restrictions?|filters?|guidelines?)\b/i,
    type: "jailbreak",
    severity: "high",
    baseConfidence: 0.88,
    description: "request to pretend absence of rules",
  },

  // -------------------------------------------------------------------------
  // role_switching — attempts to change persona or assigned role
  // -------------------------------------------------------------------------
  {
    id: "rs-001",
    pattern: /\b(?:you\s+are\s+now|from\s+now\s+on\s+you\s+are|you\s+will\s+now\s+be)\s+[a-z]/i,
    type: "role_switching",
    severity: "critical",
    baseConfidence: 0.85,
    description: "assertion of new persona",
  },
  {
    id: "rs-002",
    pattern: /\bact\s+as\s+(?:a|an|the)?\s*[a-z]/i,
    type: "role_switching",
    severity: "high",
    baseConfidence: 0.75,
    description: "imperative to act as a different role",
  },
  {
    id: "rs-003",
    pattern: /\bpretend\s+(?:to\s+be|you\s+are)\s+(?:a|an|the)?\s*[a-z]/i,
    type: "role_switching",
    severity: "high",
    baseConfidence: 0.8,
    description: "imperative to pretend to be a different role",
  },
  {
    id: "rs-004",
    pattern: /\b(?:roleplay|role-play)\s+as\s+(?:a|an|the)?\s*[a-z]/i,
    type: "role_switching",
    severity: "high",
    baseConfidence: 0.8,
    description: "roleplay instruction",
  },
  {
    id: "rs-005",
    pattern: /\byour\s+new\s+(?:role|persona|identity|character)\s+is\b/i,
    type: "role_switching",
    severity: "critical",
    baseConfidence: 0.9,
    description: "assertion of a new role or persona",
  },

  // -------------------------------------------------------------------------
  // context_manipulation — injection of fake control markers / turns
  // -------------------------------------------------------------------------
  {
    id: "cm-001",
    pattern: /<\|\s*(?:system|assistant|user|im_start|im_end)\s*\|>/i,
    type: "context_manipulation",
    severity: "critical",
    baseConfidence: 0.95,
    description: "ChatML-style control token",
  },
  {
    id: "cm-002",
    pattern: /\[\s*(?:system|assistant|INST|\/INST)\s*\]/i,
    type: "context_manipulation",
    severity: "high",
    baseConfidence: 0.85,
    description: "bracketed role marker",
  },
  {
    id: "cm-003",
    pattern: /```\s*(?:system|assistant)\b/i,
    type: "context_manipulation",
    severity: "high",
    baseConfidence: 0.85,
    description: "fenced code block tagged as system or assistant",
  },
  {
    id: "cm-004",
    pattern: /#{2,}\s*system\s+(?:prompt|message|instructions?)\s*#{0,}/i,
    type: "context_manipulation",
    severity: "medium",
    baseConfidence: 0.8,
    description: "markdown heading impersonating a system prompt",
  },
  {
    id: "cm-005",
    pattern: /<\s*system\s*>[\s\S]{0,500}?<\s*\/\s*system\s*>/i,
    type: "context_manipulation",
    severity: "critical",
    baseConfidence: 0.9,
    description: "xml-style system tag wrapper",
  },
  {
    id: "cm-006",
    pattern: /\b(?:BEGIN|START)\s+SYSTEM(?:\s+(?:PROMPT|MESSAGE|INSTRUCTIONS?))?\b/i,
    type: "context_manipulation",
    severity: "medium",
    baseConfidence: 0.8,
    description: "sentinel marker opening a fake system section",
  },
  {
    id: "cm-007",
    pattern: /\b(?:END|STOP|FINISH)\s+SYSTEM(?:\s+(?:PROMPT|MESSAGE|INSTRUCTIONS?))?\b/i,
    type: "context_manipulation",
    severity: "medium",
    baseConfidence: 0.8,
    description: "sentinel marker closing a fake system section",
  },
  {
    id: "cm-008",
    pattern: /^\s*(?:system|assistant)\s*:\s*(?:you|please|do|ignore|respond|output)/im,
    type: "context_manipulation",
    severity: "high",
    baseConfidence: 0.78,
    description: "line-initial role prefix followed by a directive",
  },

  // -------------------------------------------------------------------------
  // encoding_attack — obfuscation via base64 / rot13 / hex
  // -------------------------------------------------------------------------
  {
    id: "ea-001",
    pattern:
      /\b(?:decode|decrypt|run|execute|interpret)\s+(?:this\s+|the\s+following\s+)?base[-\s]?64\b/i,
    type: "encoding_attack",
    severity: "high",
    baseConfidence: 0.85,
    description: "request to decode and act on base64 payload",
  },
  {
    id: "ea-002",
    pattern: /\b(?:decode|decrypt|apply|run)\s+(?:this\s+|the\s+following\s+)?rot[-\s]?13\b/i,
    type: "encoding_attack",
    severity: "medium",
    baseConfidence: 0.8,
    description: "request to decode and act on rot13 payload",
  },
  {
    id: "ea-003",
    pattern:
      /\b(?:decode|convert|interpret)\s+(?:this\s+|the\s+following\s+)?hex(?:adecimal)?\s+(?:string|payload|message|instructions?)\b/i,
    type: "encoding_attack",
    severity: "medium",
    baseConfidence: 0.78,
    description: "request to decode hex-encoded payload",
  },

  // -------------------------------------------------------------------------
  // pii_exposure — personal identifiers and secret material
  //
  // Descriptions here are deliberately generic ("email", "SSN-like pattern",
  // "Anthropic API key") and contain no concrete sample values, so that
  // surfacing them via logs or error payloads does not leak PII.
  // -------------------------------------------------------------------------
  {
    id: "pii-001",
    pattern: /\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,255}\.[A-Z]{2,24}\b/i,
    type: "pii_exposure",
    severity: "medium",
    baseConfidence: 0.9,
    description: "email address",
  },
  {
    id: "pii-002",
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/,
    type: "pii_exposure",
    severity: "high",
    baseConfidence: 0.85,
    description: "SSN-like 9-digit pattern",
  },
  {
    id: "pii-003",
    pattern: /\b(?:\d[ -]?){13,19}\b/,
    type: "pii_exposure",
    severity: "high",
    baseConfidence: 0.7,
    description: "credit-card-like digit sequence",
  },
  {
    id: "pii-004",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,128}\b/,
    type: "pii_exposure",
    severity: "critical",
    baseConfidence: 0.98,
    description: "Anthropic API key",
  },
  {
    id: "pii-005",
    pattern: /\bsk-[A-Za-z0-9]{32,64}\b/,
    type: "pii_exposure",
    severity: "critical",
    baseConfidence: 0.95,
    description: "OpenAI-style API key",
  },
  {
    id: "pii-006",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,80}\b/,
    type: "pii_exposure",
    severity: "critical",
    baseConfidence: 0.98,
    description: "GitHub personal-access token",
  },
  {
    id: "pii-007",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    type: "pii_exposure",
    severity: "critical",
    baseConfidence: 0.97,
    description: "AWS access key id",
  },
  {
    id: "pii-008",
    pattern: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE\s+KEY(?:\s+BLOCK)?-----/i,
    type: "pii_exposure",
    severity: "critical",
    baseConfidence: 0.99,
    description: "PEM private-key header",
  },
  {
    id: "pii-009",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    type: "pii_exposure",
    severity: "high",
    baseConfidence: 0.9,
    description: "JWT-shaped token",
  },
];
