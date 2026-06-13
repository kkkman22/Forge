/**
 * Knowledge Integrity Linter — cross-file reference validation and
 * semantic contradiction detection for `.forge/knowledge/`.
 *
 * Motivation
 * ----------
 * Knowledge files reference each other: `instincts.md` patterns cite a
 * `来源` (source) that should correspond to a `solutions/<topic>.md` file;
 * `evolved-rules.md` entries cite `Source` fields that may reference
 * knowledge documents or sessions. When files are renamed, archived, or
 * deleted, these references can break silently.
 *
 * This module provides two lint passes:
 *
 * 1. **Reference integrity** — validates that every cross-file reference
 *    points to an existing file or section. Reports broken links.
 *
 * 2. **Semantic contradiction detection** — finds pairs of knowledge entries
 *    (instincts or solutions) that share significant tag overlap but contain
 *    opposing polarity signals (recommend vs avoid, "do X" vs "never X").
 *    These are flagged for human review, not auto-resolved.
 *
 * Design notes
 * ------------
 * - Pure functions. Inputs are file contents + directory listings; outputs
 *   are structured findings. No IO.
 * - Findings are advisory (severity: "warning"). The learn skill presents
 *   them to the user but does not auto-fix.
 * - The contradiction detector uses simple heuristic keyword matching, not
 *   semantic embeddings. This is intentional: it catches the most common
 *   case (same topic, opposite advice) without requiring a model call.
 *
 * **Wired into**: `/forge learn` step 1 (maintenance) — runs after
 * `maintainKnowledgeBase` and before five-dimension extraction.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single integrity finding.
 *
 * @internal
 */
export interface IntegrityFinding {
  severity: "warning" | "info";
  category: "broken-reference" | "contradiction" | "orphan-solution";
  file: string;
  message: string;
  /** The specific reference or entry that triggered the finding. */
  detail: string;
}

/**
 * Input for the reference integrity check.
 *
 * @internal
 */
export interface IntegrityInput {
  /** Content of `instincts.md`. */
  instinctsContent: string;
  /** Content of `evolved-rules.md`. */
  evolvedRulesContent: string;
  /** Content of `known-failures.md`. */
  knownFailuresContent: string;
  /** Map of topic → content for each `solutions/<topic>.md`. */
  solutions: Map<string, string>;
  /** List of session filenames (without path) in `sessions/`. */
  sessionFiles: string[];
}

// ---------------------------------------------------------------------------
// Reference Integrity
// ---------------------------------------------------------------------------

/**
 * Check that all cross-file references in knowledge files resolve to
 * existing targets.
 *
 * Checks performed:
 * 1. `instincts.md` `来源` / `**来源**:` fields → must match a solutions/ topic.
 * 2. `evolved-rules.md` `**Source**:` fields → must match a solutions/ topic
 *    or a sessions/ filename (partial match).
 * 3. `evolved-rules.md` `**Infra_Ref**:` paths → not validated here (those
 *    are code paths, validated by `verify-evolved-rule-infra-refs.mjs`).
 *
 * @internal
 */
export function checkReferenceIntegrity(input: IntegrityInput): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const solutionTopics = new Set(input.solutions.keys());

  // 1. instincts.md — 来源 fields
  const instinctSources = extractInstinctSources(input.instinctsContent);
  for (const { patternName, source } of instinctSources) {
    if (!resolveSource(source, solutionTopics, input.sessionFiles)) {
      findings.push({
        severity: "warning",
        category: "broken-reference",
        file: "instincts.md",
        message: `Pattern "${patternName}" references source "${source}" which does not match any solutions/ topic or sessions/ file.`,
        detail: source,
      });
    }
  }

  // 2. evolved-rules.md — Source fields
  const ruleSources = extractRuleSources(input.evolvedRulesContent);
  for (const { ruleId, source } of ruleSources) {
    if (!resolveSource(source, solutionTopics, input.sessionFiles)) {
      findings.push({
        severity: "warning",
        category: "broken-reference",
        file: "evolved-rules.md",
        message: `Rule "${ruleId}" references source "${source}" which does not match any solutions/ topic or sessions/ file.`,
        detail: source,
      });
    }
  }

  return findings;
}

/**
 * Detect solutions/ documents that are never referenced by any instinct
 * pattern or evolved rule. These are "orphan" documents that may be
 * candidates for archival.
 *
 * @internal
 */
export function checkOrphanSolutions(input: IntegrityInput): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const referenced = new Set<string>();

  // Collect all source references from instincts
  for (const { source } of extractInstinctSources(input.instinctsContent)) {
    referenced.add(normalizeSource(source));
  }

  // Collect from evolved rules
  for (const { source } of extractRuleSources(input.evolvedRulesContent)) {
    referenced.add(normalizeSource(source));
  }

  // Collect from known-failures (if they reference solutions)
  for (const { source } of extractFailureSources(input.knownFailuresContent)) {
    referenced.add(normalizeSource(source));
  }

  for (const topic of input.solutions.keys()) {
    const normalized = normalizeSource(topic);
    if (!referenced.has(normalized)) {
      findings.push({
        severity: "info",
        category: "orphan-solution",
        file: `solutions/${topic}.md`,
        message: `Solution "${topic}" is not referenced by any instinct, rule, or failure pattern. Consider archiving if no longer relevant.`,
        detail: topic,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Semantic Contradiction Detection
// ---------------------------------------------------------------------------

/** Polarity keywords that signal opposing advice. */
const POSITIVE_SIGNALS = ["recommend", "always", "must", "should", "prefer", "use"];
const NEGATIVE_SIGNALS = [
  "avoid",
  "never",
  "must not",
  "should not",
  "don't",
  "do not",
  "禁止",
  "不要",
  "避免",
];

/**
 * Find pairs of instinct patterns that share ≥ 50% tag overlap but contain
 * opposing polarity signals in their body text.
 *
 * This is a lightweight heuristic: it catches "Pattern A says 'always use X'"
 * vs "Pattern B says 'never use X'" when both are tagged with the same
 * domain. False positives are expected and acceptable — the output is
 * advisory.
 *
 * @internal
 */
export function checkContradictions(input: IntegrityInput): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const patterns = parsePatternBlocks(input.instinctsContent);

  // Pre-compute polarity for all patterns (avoids redundant computation)
  const polarities = patterns.map((p) => detectPolarity(p.body));

  // Build inverted index: tag → pattern indices
  // Only compare patterns that share at least one tag
  const tagIndex = new Map<string, number[]>();
  for (let i = 0; i < patterns.length; i++) {
    for (const tag of patterns[i].tags) {
      let indices = tagIndex.get(tag);
      if (!indices) {
        indices = [];
        tagIndex.set(tag, indices);
      }
      indices.push(i);
    }
  }

  // Collect candidate pairs that share tags
  const candidatePairs = new Map<string, [number, number]>();
  for (const indices of tagIndex.values()) {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = Math.min(indices[i], indices[j]);
        const b = Math.max(indices[i], indices[j]);
        const key = `${a}::${b}`;
        if (!candidatePairs.has(key)) {
          candidatePairs.set(key, [a, b]);
        }
      }
    }
  }

  // Check only candidate pairs
  for (const [aIdx, bIdx] of candidatePairs.values()) {
    const a = patterns[aIdx];
    const b = patterns[bIdx];
    const aPol = polarities[aIdx];
    const bPol = polarities[bIdx];

    if (aPol === "neutral" || bPol === "neutral" || aPol === bPol) continue;

    const overlap = tagOverlap(a.tags, b.tags);
    if (overlap < 0.5) continue;

    findings.push({
      severity: "warning",
      category: "contradiction",
      file: "instincts.md",
      message: `Potential contradiction: "${a.name}" (${aPol}) vs "${b.name}" (${bPol}) — tags overlap ${(overlap * 100).toFixed(0)}%.`,
      detail: `${a.name} ↔ ${b.name}`,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Full lint pass
// ---------------------------------------------------------------------------

/**
 * Run all knowledge integrity checks and return combined findings.
 *
 * @internal
 */
export function lintKnowledgeIntegrity(input: IntegrityInput): IntegrityFinding[] {
  return [
    ...checkReferenceIntegrity(input),
    ...checkOrphanSolutions(input),
    ...checkContradictions(input),
  ];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SourceRef {
  patternName: string;
  source: string;
}

interface RuleSourceRef {
  ruleId: string;
  source: string;
}

export function extractInstinctSources(content: string): SourceRef[] {
  const results: SourceRef[] = [];
  const _headingRe = /^###\s+(.+)$/gm;
  const sourceRe = /\*\*来源\*\*:\s*(.+)$/m;

  let _match: RegExpExecArray | null;
  const blocks = splitByH3(content);

  for (const block of blocks) {
    const headingMatch = block.match(/^###\s+(.+)$/m);
    if (!headingMatch) continue;
    const patternName = headingMatch[1].trim();

    const srcMatch = block.match(sourceRe);
    if (srcMatch) {
      // Source can be comma-separated
      const sources = srcMatch[1].split(",").map((s) => s.trim());
      for (const source of sources) {
        if (source.length > 0) {
          results.push({ patternName, source });
        }
      }
    }
  }

  return results;
}

function extractRuleSources(content: string): RuleSourceRef[] {
  const results: RuleSourceRef[] = [];
  const blocks = splitByH3(content);

  for (const block of blocks) {
    const headingMatch = block.match(/^###\s+(R\d+):\s*/m);
    if (!headingMatch) continue;
    const ruleId = headingMatch[1];

    const srcMatch = block.match(/\*\*Source\*\*:\s*(.+)$/m);
    if (srcMatch) {
      const source = srcMatch[1].trim();
      if (source.length > 0) {
        results.push({ ruleId, source });
      }
    }
  }

  return results;
}

function extractFailureSources(content: string): SourceRef[] {
  const results: SourceRef[] = [];
  const blocks = splitByH3(content);

  for (const block of blocks) {
    const headingMatch = block.match(/^###\s+(.+)$/m);
    if (!headingMatch) continue;
    const patternName = headingMatch[1].trim();

    // known-failures uses **解决方案** or **来源** or just references inline
    const srcMatch = block.match(/\*\*来源\*\*:\s*(.+)$/m);
    if (srcMatch) {
      results.push({ patternName, source: srcMatch[1].trim() });
    }
  }

  return results;
}

export function resolveSource(
  source: string,
  solutionTopics: Set<string>,
  sessionFiles: string[],
): boolean {
  const normalized = normalizeSource(source);

  // Direct match against solutions/ topics
  if (solutionTopics.has(normalized)) return true;

  // Partial match (source might be a description, not a filename)
  for (const topic of solutionTopics) {
    if (topic.includes(normalized) || normalized.includes(topic)) return true;
  }

  // Match against session files (partial)
  for (const session of sessionFiles) {
    const sessionNorm = session.replace(/\.md$/, "").toLowerCase();
    if (sessionNorm.includes(normalized) || normalized.includes(sessionNorm)) return true;
  }

  // Source might be a user-facing description (e.g. "用户反馈 — spec 阶段...")
  // These are not file references, so we accept them as valid.
  if (source.includes("—") || source.includes("用户") || source.includes("审计")) return true;

  return false;
}

export function normalizeSource(source: string): string {
  return source
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
}

interface PatternBlock {
  name: string;
  tags: string[];
  body: string;
}

function parsePatternBlocks(content: string): PatternBlock[] {
  const blocks = splitByH3(content);
  const results: PatternBlock[] = [];

  for (const block of blocks) {
    const headingMatch = block.match(/^###\s+(.+)$/m);
    if (!headingMatch) continue;

    const name = headingMatch[1].trim();
    const tags = extractTags(block);
    const body = block;

    results.push({ name, tags, body });
  }

  return results;
}

function extractTags(block: string): string[] {
  // v2 format: **tags**: regex, testing, bug-prevention
  const v2Match = block.match(/\*\*tags\*\*:\s*(.+)$/im);
  if (v2Match) {
    return v2Match[1]
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
  }
  // Legacy format: **Tags**: regex, testing
  const legacyMatch = block.match(/\*\*Tags\*\*:\s*(.+)$/m);
  if (legacyMatch) {
    return legacyMatch[1]
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
  }
  return [];
}

function tagOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const intersection = b.filter((t) => setA.has(t));
  return intersection.length / Math.min(a.length, b.length);
}

type Polarity = "positive" | "negative" | "neutral";

function detectPolarity(text: string): Polarity {
  const lower = text.toLowerCase();
  let posScore = 0;
  let negScore = 0;

  for (const signal of POSITIVE_SIGNALS) {
    if (lower.includes(signal)) posScore++;
  }
  for (const signal of NEGATIVE_SIGNALS) {
    if (lower.includes(signal)) negScore++;
  }

  // Only flag when there is a clear dominant polarity
  if (negScore >= 2 && negScore > posScore) return "negative";
  if (posScore >= 2 && posScore > negScore) return "positive";
  return "neutral";
}

function splitByH3(content: string): string[] {
  const parts = content.split(/(?=^###\s+)/m);
  return parts.filter((p) => p.trim().length > 0);
}
