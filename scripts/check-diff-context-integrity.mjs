#!/usr/bin/env node
// category: internal-only
/**
 * check-diff-context-integrity.mjs — PostToolUse guard for `.diff-context.md`.
 *
 * Validates that the file just written by Write/Edit at
 * `.forge/reviews/.diff-context.md` contains real unified diff hunk markers
 * (or is exempt under the empty-diff edge case). Blocks narrative-summary
 * regression at the moment of write, before the review pipeline reads the
 * malformed file.
 *
 * Invocation (PostToolUse hook command):
 *   node scripts/check-diff-context-integrity.mjs "$TOOL_INPUT_FILE"
 *
 * Behavior:
 *   - Path argument missing or doesn't end in `.diff-context.md` → exit 0 (silent skip)
 *   - File doesn't exist → exit 0 (race with Write — let next event handle it)
 *   - file_count == 0 in frontmatter → exit 0 (empty-diff exemption)
 *   - Patch / Diff Content section contains unified diff marker → exit 0
 *   - Patch / Diff Content section is narrative-only → exit 2 + stderr message
 *
 * @see .kiro/specs/forge-review-diff-context-fidelity/{bugfix,design}.md
 * @see test/contract.diff-context.test.ts (CI-level guard, this is runtime guard)
 */
import { existsSync, readFileSync } from "node:fs";

const TARGET_BASENAME_SUFFIX = ".diff-context.md";

const HUNK_MARKERS = [
  /^@@ .+ @@/m,
  /^--- a\//m,
  /^--- \/dev\/null/m,
  /^\+\+\+ b\//m,
  /^\+\+\+ \/dev\/null/m,
];

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split("\n")) {
    const fieldMatch = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (fieldMatch) fields[fieldMatch[1]] = fieldMatch[2].trim();
  }
  return { fields, body: match[2] };
}

function extractPatchSection(body) {
  const sections = body.split(/^## /m);
  for (const section of sections) {
    if (/^(Patch|Diff Content)\s*\n/.test(section)) {
      return section.replace(/^(Patch|Diff Content)\s*\n/, "");
    }
  }
  return "";
}

function main() {
  const targetPath = process.env.TOOL_INPUT_FILE || process.argv[2];

  // Silent skip: not invoked with a path, or path is for a different file.
  if (!targetPath || !targetPath.endsWith(TARGET_BASENAME_SUFFIX)) {
    process.exit(0);
  }

  // Race-tolerant: file may not yet exist between Write start and our read.
  if (!existsSync(targetPath)) {
    process.exit(0);
  }

  let content;
  try {
    content = readFileSync(targetPath, "utf-8");
  } catch {
    // Permission / I/O — fail-open, don't block.
    process.exit(0);
  }

  const parsed = parseFrontmatter(content);
  if (!parsed) {
    // Malformed frontmatter is itself an error, but contract test catches it.
    // Keep this hook narrowly scoped to the bug we're guarding against.
    process.exit(0);
  }

  // Empty-diff exemption: file_count == 0 → no hunk required.
  if (parsed.fields.file_count === "0") {
    process.exit(0);
  }

  const patchSection = extractPatchSection(parsed.body);
  const hasMarker = HUNK_MARKERS.some((re) => re.test(patchSection));

  if (!hasMarker) {
    process.stderr.write(
      `\n.diff-context.md integrity check failed: ## Patch / ## Diff Content section is missing unified diff hunk markers (@@ ... @@ / --- a/ / +++ b/).\n` +
        `This violates the forge-review-diff-context-fidelity contract.\n` +
        `Use 'node scripts/prepare-diff-context.mjs' to regenerate with real patch content.\n` +
        `See skills/tinkerman-review/references/diff-context-preparation.md § Why Narrative Summary is Forbidden.\n`,
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
