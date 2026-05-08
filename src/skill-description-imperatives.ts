// Imperative verb whitelist for SKILL.md description validation.
//
// Every forge skill frontmatter description must start with one of
// these verbs (first sentence). The list is intentionally closed —
// additions require a PR that extends this array.
//
// Validates: Requirements 1.3, 1.7

export const IMPERATIVE_WHITELIST: readonly string[] = [
  "Build",
  "Audit",
  "Diagnose",
  "Execute",
  "Plan",
  "Review",
  "Ship",
  "Test",
  "Resume",
  "Orchestrate",
  "Capture",
  "Refactor",
  "Grill",
  "Decompose",
  "Decide",
  "Restart",
  "Fix",
  "Verify",
  "Accept",
];
