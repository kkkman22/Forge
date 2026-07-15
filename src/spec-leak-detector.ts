/**
 * Spec Leak Detector — scans spec text for banned patterns.
 *
 * detectSpecLeak: finds implementation/infra/framework/technical leaks in specs.
 *   - Skips content inside fenced code blocks (``` ... ```).
 *   - Checks glossary whitelist before emitting a finding.
 *
 * loadBannedPatterns: loads banned-patterns.yaml from all enabled layers and
 *   unions them into a single BannedPatternRegistry.
 */

import { parse as parseYaml } from "yaml";
import { resolveAllPaths } from "./pack/resolver.js";
import type {
  BannedPattern,
  BannedPatternRegistry,
  EnabledPacks,
  FileSystem,
  GlossaryRegistry,
  LeakCategory,
  LeakFinding,
} from "./pack/types.js";

// ---------------------------------------------------------------------------
// detectSpecLeak
// ---------------------------------------------------------------------------

/**
 * Scan spec text for banned patterns, emitting findings for each match
 * that is not whitelisted by the glossary for the given specContext.
 */
export function detectSpecLeak(
  specText: string,
  filePath: string,
  bannedRegistry: BannedPatternRegistry,
  glossary: GlossaryRegistry,
  specContext: string,
): LeakFinding[] {
  if (bannedRegistry.categories.size === 0) return [];

  const findings: LeakFinding[] = [];
  const lines = specText.split("\n");
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Toggle code block state on lines that are just ```
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    for (const [category, patterns] of bannedRegistry.categories) {
      for (const bp of patterns) {
        const built = buildRegex(bp.pattern);
        if (!built) continue;
        const { regex, matchedLiteral } = built;
        const match = regex.exec(line);
        if (!match) continue;

        const matchedTerm = matchedLiteral ?? match[0];

        // Glossary whitelist check
        const glossaryEntries = glossary.byTerm.get(matchedTerm);
        if (glossaryEntries) {
          const whitelisted = glossaryEntries.some(
            (e) => e.context === specContext || e.context === "_shared",
          );
          if (whitelisted) continue;
        }

        findings.push({
          category: category as LeakCategory,
          file: filePath,
          line: i + 1,
          original: line,
          matchedTerm,
          suggestedRewrite: bp.suggestion_template ?? null,
          sourceLayer: "core",
        });
      }
    }
  }

  // Sort by line number
  findings.sort((a, b) => a.line - b.line);
  return findings;
}

/**
 * Build a RegExp from a banned pattern string.
 *   - "regex:..." → compile the rest as-is
 *   - otherwise   → word-bounded case-insensitive literal
 */
function buildRegex(pattern: string): { regex: RegExp; matchedLiteral: string | null } | null {
  if (pattern.startsWith("regex:")) {
    const expr = pattern.slice(6);
    if (expr.length > 500) return null;
    try {
      const regex = new RegExp(expr);
      // Quick safety check: test against a medium string to catch catastrophic backtracking
      regex.test("a".repeat(100));
      return { regex, matchedLiteral: null };
    } catch (_err: unknown) {
      // Invalid regex pattern — skip this rule (legitimate fail-soft: an
      // unparseable pattern cannot match anything; returning null lets the
      // caller continue with the remaining rules).
      return null;
    }
  }
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { regex: new RegExp(`\\b${escaped}\\b`, "i"), matchedLiteral: pattern };
}

// ---------------------------------------------------------------------------
// loadBannedPatterns
// ---------------------------------------------------------------------------

/**
 * Load banned-patterns.yaml from all enabled packs and the custom layer.
 * UNIONs all patterns across layers and deduplicates identical pattern strings.
 */
export async function loadBannedPatterns(
  enabledPacks: EnabledPacks,
  fs: FileSystem,
): Promise<BannedPatternRegistry> {
  const categories = new Map<string, BannedPattern[]>();
  // Track dedup: category → Set of pattern strings already seen
  const seen = new Map<string, Set<string>>();

  const candidates = resolveAllPaths("banned-patterns.yaml", enabledPacks);

  for (const candidate of candidates) {
    const exists = await fs.exists(candidate.path);
    if (!exists) continue;

    const content = await fs.readFile(candidate.path);
    const parsed = parseYaml(content);

    if (!parsed || typeof parsed !== "object") continue;
    if (parsed.schema_version !== 1) continue;
    if (!parsed.categories || typeof parsed.categories !== "object") continue;

    for (const [catName, rawPatterns] of Object.entries(
      parsed.categories as Record<string, unknown[]>,
    )) {
      if (!Array.isArray(rawPatterns)) continue;

      if (!categories.has(catName)) {
        categories.set(catName, []);
        seen.set(catName, new Set());
      }

      const catPatterns = categories.get(catName);
      const catSeen = seen.get(catName);
      if (!catPatterns || !catSeen) continue;

      for (const raw of rawPatterns) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        if (typeof r.pattern !== "string") continue;

        // Deduplicate by pattern string
        if (catSeen.has(r.pattern)) continue;
        catSeen.add(r.pattern);

        catPatterns.push({
          pattern: r.pattern,
          description: typeof r.description === "string" ? r.description : "",
          suggestion_template:
            typeof r.suggestion_template === "string" ? r.suggestion_template : undefined,
        });
      }
    }
  }

  return { categories };
}
