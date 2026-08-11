/**
 * Property-based test for evolved-rules.md round-trip consistency.
 *
 * Property 1: Evolved rules file round-trip
 *   For any valid set of rules (each with title, content, prevents, source,
 *   added date, confidence, and last_triggered), formatting them into the
 *   evolved-rules.md structure and then parsing the result back should produce
 *   an equivalent set of rules with all fields preserved.
 *
 * **Validates: Requirements 14.4**
 *
 * Feature: claude-md-self-evolution
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvolvedRule {
  /** Sequential 1-based index */
  index: number;
  /** Concise descriptive title (no colons) */
  title: string;
  /** Single actionable sentence or short paragraph */
  content: string;
  /** Specific testable failure scenario */
  prevents: string;
  /** Path to knowledge file + entry identifier */
  source: string;
  /** YYYY-MM-DD format */
  added: string;
  /** Range 0.3–0.9 */
  confidence: number;
  /** YYYY-MM-DD format */
  lastTriggered: string;
}

interface EvolvedRulesFile {
  /** YYYY-MM-DD format */
  updated: string;
  /** Must equal rules.length */
  ruleCount: number;
  /** Default 15 */
  maxRules: number;
  /** The rules */
  rules: EvolvedRule[];
}

// ---------------------------------------------------------------------------
// Formatter: structured data → evolved-rules.md string
// ---------------------------------------------------------------------------

function formatEvolvedRules(file: EvolvedRulesFile): string {
  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push(`updated: "${file.updated}"`);
  lines.push(`rule_count: ${file.ruleCount}`);
  lines.push(`max_rules: ${file.maxRules}`);
  lines.push("---");
  lines.push("");
  lines.push("# Error-Prevention Rules");
  lines.push("");
  lines.push("Rules distilled by `/tinkerman learn` from accumulated project knowledge.");
  lines.push("Each rule prevents a specific, documented error pattern.");

  for (const rule of file.rules) {
    lines.push("");
    lines.push(`### R${rule.index}: ${rule.title}`);
    lines.push("");
    lines.push(`**Content**: ${rule.content}`);
    lines.push(`**Prevents**: ${rule.prevents}`);
    lines.push(`**Source**: ${rule.source}`);
    lines.push(`**Added**: ${rule.added}`);
    lines.push(`**Confidence**: ${rule.confidence}`);
    lines.push(`**Last_triggered**: ${rule.lastTriggered}`);
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Parser: evolved-rules.md string → structured data
// ---------------------------------------------------------------------------

function parseEvolvedRules(text: string): EvolvedRulesFile {
  // Parse YAML frontmatter
  const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error("Missing YAML frontmatter");
  }

  const frontmatter = frontmatterMatch[1];
  const updatedMatch = frontmatter.match(/updated:\s*"([^"]+)"/);
  const ruleCountMatch = frontmatter.match(/rule_count:\s*(\d+)/);
  const maxRulesMatch = frontmatter.match(/max_rules:\s*(\d+)/);

  if (!updatedMatch || !ruleCountMatch || !maxRulesMatch) {
    throw new Error("Missing required frontmatter fields");
  }

  const updated = updatedMatch[1];
  const ruleCount = Number.parseInt(ruleCountMatch[1], 10);
  const maxRules = Number.parseInt(maxRulesMatch[1], 10);

  // Parse rule sections — split on ### R{N}: headings
  const rules: EvolvedRule[] = [];
  const rulePattern =
    /### R(\d+): (.+)\n\n\*\*Content\*\*: (.+)\n\*\*Prevents\*\*: (.+)\n\*\*Source\*\*: (.+)\n\*\*Added\*\*: (.+)\n\*\*Confidence\*\*: (.+)\n\*\*Last_triggered\*\*: (.+)/g;

  let match: RegExpExecArray | null = rulePattern.exec(text);
  while (match !== null) {
    rules.push({
      index: Number.parseInt(match[1], 10),
      title: match[2],
      content: match[3],
      prevents: match[4],
      source: match[5],
      added: match[6],
      confidence: Number.parseFloat(match[7]),
      lastTriggered: match[8],
    });
    match = rulePattern.exec(text);
  }

  return { updated, ruleCount, maxRules, rules };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a YYYY-MM-DD date string. */
const dateArb = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

/**
 * Generate a safe text string for rule fields.
 * Must not contain newlines, markdown bold markers, or heading markers
 * that would break the format parsing.
 */
const safeTextArb = fc
  .stringMatching(/^[a-zA-Z0-9 ,.;!?()/_-]+$/)
  .filter((s) => s.trim().length >= 1 && s.length <= 80);

/** Generate a title string (no colons per field constraints). */
const titleArb = fc
  .stringMatching(/^[a-zA-Z0-9 ,.;!?()/_-]+$/)
  .filter((s) => s.trim().length >= 1 && !s.includes(":") && s.length <= 60);

/** Generate a confidence value in range 0.3–0.9. */
const confidenceArb = fc
  .integer({ min: 3, max: 9 })
  .map((n) => Number.parseFloat((n / 10).toFixed(1)));

/** Generate a source path string. */
const sourceArb = fc
  .tuple(
    fc.constantFrom("known-failures", "instincts", "skill-feedback", "metrics", "session-journal"),
    fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter((s) => s.length >= 1 && s.length <= 20),
  )
  .map(([file, entry]) => `.tinkerman/knowledge/${file}.md#${entry}`);

/** Generate a single evolved rule with a given index. */
function ruleArb(index: number): fc.Arbitrary<EvolvedRule> {
  return fc
    .tuple(titleArb, safeTextArb, safeTextArb, sourceArb, dateArb, confidenceArb, dateArb)
    .map(([title, content, prevents, source, added, confidence, lastTriggered]) => ({
      index,
      title,
      content,
      prevents,
      source,
      added,
      confidence,
      lastTriggered,
    }));
}

/** Generate a complete evolved rules file with 0–15 rules. */
const evolvedRulesFileArb: fc.Arbitrary<EvolvedRulesFile> = fc
  .tuple(dateArb, fc.integer({ min: 0, max: 15 }))
  .chain(([updated, count]) => {
    const ruleArbs = Array.from({ length: count }, (_, i) => ruleArb(i + 1));
    const rulesArb = ruleArbs.length > 0 ? fc.tuple(...ruleArbs) : fc.constant([]);
    return rulesArb.map((rules) => ({
      updated,
      ruleCount: count,
      maxRules: 15,
      rules: rules as EvolvedRule[],
    }));
  });

// ---------------------------------------------------------------------------
// Feature: claude-md-self-evolution, Property 1: Evolved rules file round-trip
// ---------------------------------------------------------------------------

describe("Feature: claude-md-self-evolution, Property 1: Evolved rules file round-trip", () => {
  /**
   * **Validates: Requirements 14.4**
   *
   * For any valid set of rules, formatting them into the evolved-rules.md
   * structure and then parsing the result back produces an equivalent set
   * of rules with all fields preserved.
   */
  it("format then parse produces equivalent rules file", () => {
    fc.assert(
      fc.property(evolvedRulesFileArb, (file) => {
        const formatted = formatEvolvedRules(file);
        const parsed = parseEvolvedRules(formatted);

        // Frontmatter fields preserved
        expect(parsed.updated).toBe(file.updated);
        expect(parsed.ruleCount).toBe(file.ruleCount);
        expect(parsed.maxRules).toBe(file.maxRules);

        // Rule count matches
        expect(parsed.rules.length).toBe(file.rules.length);

        // Each rule's fields preserved
        for (let i = 0; i < file.rules.length; i++) {
          const original = file.rules[i];
          const roundTripped = parsed.rules[i];

          expect(roundTripped.index).toBe(original.index);
          expect(roundTripped.title).toBe(original.title);
          expect(roundTripped.content).toBe(original.content);
          expect(roundTripped.prevents).toBe(original.prevents);
          expect(roundTripped.source).toBe(original.source);
          expect(roundTripped.added).toBe(original.added);
          expect(roundTripped.confidence).toBe(original.confidence);
          expect(roundTripped.lastTriggered).toBe(original.lastTriggered);
        }
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 14.4**
   *
   * The rule_count frontmatter field always equals the actual number of
   * parsed rules after a round-trip.
   */
  it("rule_count frontmatter equals actual rule count after round-trip", () => {
    fc.assert(
      fc.property(evolvedRulesFileArb, (file) => {
        const formatted = formatEvolvedRules(file);
        const parsed = parseEvolvedRules(formatted);

        expect(parsed.ruleCount).toBe(parsed.rules.length);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 14.4**
   *
   * Confidence values survive the round-trip within the valid 0.3–0.9 range.
   */
  it("confidence values are preserved within valid range after round-trip", () => {
    fc.assert(
      fc.property(evolvedRulesFileArb, (file) => {
        const formatted = formatEvolvedRules(file);
        const parsed = parseEvolvedRules(formatted);

        for (const rule of parsed.rules) {
          expect(rule.confidence).toBeGreaterThanOrEqual(0.3);
          expect(rule.confidence).toBeLessThanOrEqual(0.9);
        }
      }),
      { numRuns: 50 },
    );
  });
});
