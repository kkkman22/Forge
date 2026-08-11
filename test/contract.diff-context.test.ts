/**
 * Contract tests for `.tinkerman/reviews/.diff-context.md` schema fidelity.
 *
 * Spec: forge-review-diff-context-fidelity
 * Properties validated:
 *   - P1 Bug Condition (unified diff hunk markers always present, except empty diff)
 *   - P2 Empty Diff Edge Case (file_count = 0 exemption)
 *   - P4 Frontmatter Schema Stability (7 required fields)
 *
 * Strategy:
 *   - When `.diff-context.md` does not exist (no review in progress), gracefully skip.
 *   - When it exists, scan it against the schema contract.
 *   - Detect narrative-summary anti-pattern and require accompanying hunk markers.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const PATH = resolve(ROOT, ".tinkerman/reviews/.diff-context.md");

const REQUIRED_FRONTMATTER_FIELDS = [
  "base",
  "head",
  "file_count",
  "total_added",
  "total_removed",
  "truncated",
  "source",
];

const HUNK_MARKERS = [
  /^@@ .+ @@/m, // unified hunk header
  /^--- a\//m, // file source (existing file)
  /^--- \/dev\/null/m, // file source (new file added)
  /^\+\+\+ b\//m, // file target (existing file)
  /^\+\+\+ \/dev\/null/m, // file target (file deleted)
];

const NARRATIVE_ANTI_PATTERNS = [
  /^\s*See forge_git/im, // "See forge_git diff-content output"
  /^\s*Key changes:\s*\n\s*-/m, // "Key changes:\n- ..."
];

interface Parsed {
  fields: Record<string, string>;
  body: string;
}

function parseFrontmatter(content: string): Parsed {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error("missing YAML frontmatter delimiters");
  }
  const [, raw, body] = match;
  const fields: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const fieldMatch = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (fieldMatch) {
      fields[fieldMatch[1]] = fieldMatch[2].trim();
    }
  }
  return { fields, body };
}

function extractPatchSection(body: string): string {
  // Split body on level-2 headings; find the section whose first line is
  // "Patch" or "Diff Content".
  const sections = body.split(/^## /m);
  for (const section of sections) {
    if (/^(Patch|Diff Content)\s*\n/.test(section)) {
      // Strip the heading title line and return remainder.
      return section.replace(/^(Patch|Diff Content)\s*\n/, "");
    }
  }
  return "";
}

function hasHunkMarker(text: string): boolean {
  return HUNK_MARKERS.some((re) => re.test(text));
}

function matchesNarrativeAntiPattern(text: string): boolean {
  return NARRATIVE_ANTI_PATTERNS.some((re) => re.test(text));
}

describe("Contract: .tinkerman/reviews/.diff-context.md fidelity", () => {
  it("file gracefully skipped when no review in progress", () => {
    if (!existsSync(PATH)) {
      // No review running — contract checks below auto-skip via early return.
      return;
    }
    expect(existsSync(PATH)).toBe(true);
  });

  it("frontmatter has all 7 required fields", () => {
    if (!existsSync(PATH)) return;
    const { fields } = parseFrontmatter(readFileSync(PATH, "utf-8"));
    for (const key of REQUIRED_FRONTMATTER_FIELDS) {
      expect(fields[key], `frontmatter missing required field "${key}"`).toBeDefined();
    }
  });

  it("Patch section contains unified diff hunk markers (except empty diff)", () => {
    if (!existsSync(PATH)) return;
    const content = readFileSync(PATH, "utf-8");
    const { fields, body } = parseFrontmatter(content);

    // Empty diff edge case: file_count = 0 → exemption
    if (fields.file_count === "0") return;

    const patchSection = extractPatchSection(body);
    expect(
      hasHunkMarker(patchSection),
      "## Patch / ## Diff Content section must contain at least one unified diff marker (@@ ... @@ / --- a/ / +++ b/)",
    ).toBe(true);
  });

  it("Patch section does not contain narrative-summary anti-pattern (or co-presence with real hunk)", () => {
    if (!existsSync(PATH)) return;
    const content = readFileSync(PATH, "utf-8");
    const { body } = parseFrontmatter(content);
    const patchSection = extractPatchSection(body);

    if (matchesNarrativeAntiPattern(patchSection)) {
      // Narrative anti-pattern present — must be accompanied by real hunk markers,
      // otherwise this is the Stage 4 truncation regression we are guarding against.
      expect(
        hasHunkMarker(patchSection),
        "narrative summary anti-pattern detected without accompanying unified diff hunk markers — see forge-review-diff-context-fidelity bugfix.md Bug Condition",
      ).toBe(true);
    }
  });
});
