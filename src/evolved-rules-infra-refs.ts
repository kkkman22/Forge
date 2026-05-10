/**
 * Evolved rules Infra_Ref validator (pure functions).
 *
 * Verifies each rule's `Infra_Ref:` field points to files/sections that
 * actually exist. Failing references indicate that a SKILL/hook/agent
 * refactor may have broken a rule's landing location — evolved rules
 * would then silently regress.
 *
 * Format expected in evolved-rules.md:
 *   **Infra_Ref**: `path/to/file.md` §<section> + `other/path.ts` ...
 *
 * Validation rules:
 *   - Every backticked path `<value>` within the `Infra_Ref` line is
 *     extracted as a reference.
 *   - File references (ending with `.md`, `.ts`, `.json`, `.yaml`,
 *     `.mjs`, `.sh`) must exist on disk.
 *   - §<section> hints are best-effort: if present and the referenced
 *     file is markdown, we check that the section header exists.
 */

/** A single reference extracted from an Infra_Ref line. */
export interface InfraRef {
  ruleId: string;
  path: string;
  section: string | null;
  rawLine: string;
}

/** Result of validating a single ref. */
export interface InfraRefVerdict {
  ref: InfraRef;
  valid: boolean;
  reason?: string;
}

/**
 * Parse Infra_Ref lines from rule blocks.
 *
 * Given the full body of evolved-rules.md, returns one InfraRef per
 * backticked path found under each rule's Infra_Ref field.
 */
export function parseInfraRefs(body: string): InfraRef[] {
  const refs: InfraRef[] = [];

  const headingRe = /^###\s+(R\d+):[^\n]*$/gm;
  const matches: Array<{ id: string; start: number; end: number }> = [];
  let prev: RegExpExecArray | null = null;
  let prevStart = 0;
  let m: RegExpExecArray | null = headingRe.exec(body);
  while (m !== null) {
    if (prev !== null) {
      matches.push({ id: prev[1], start: prevStart, end: m.index });
    }
    prev = m;
    prevStart = m.index;
    m = headingRe.exec(body);
  }
  if (prev !== null) matches.push({ id: prev[1], start: prevStart, end: body.length });

  for (const { id, start, end } of matches) {
    const block = body.slice(start, end);
    const line = extractInfraRefLine(block);
    if (!line) continue;

    for (const { path: refPath, section } of extractBacktickPathsWithSections(line)) {
      refs.push({ ruleId: id, path: refPath, section, rawLine: line });
    }
  }

  return refs;
}

/** Extract the single `**Infra_Ref**:` line value (trimmed) from a rule block. */
function extractInfraRefLine(block: string): string | null {
  const match = block.match(/^\*\*Infra_Ref\*\*:\s*(.+?)$/im);
  return match ? match[1].trim() : null;
}

/**
 * Extract backticked paths + optional §<section> hints from a line.
 *
 * Examples:
 *   "`a.md` §Foo + `b.ts`" → [{path:"a.md", section:"Foo"}, {path:"b.ts", section:null}]
 */
export function extractBacktickPathsWithSections(
  line: string,
): Array<{ path: string; section: string | null }> {
  const out: Array<{ path: string; section: string | null }> = [];
  // Match backticks + optional following "§<section>" or "章" or line anchor
  const re = /`([^`]+)`(?:\s*§\s*([^+\n]+?)(?=\s*\+|$))?/g;
  let match: RegExpExecArray | null = re.exec(line);
  while (match !== null) {
    const pathValue = match[1].trim();
    const rawSection = match[2]?.trim();
    // Keep only file-like paths (has extension or contains slash)
    if (isFileLikePath(pathValue)) {
      out.push({ path: pathValue, section: rawSection || null });
    }
    match = re.exec(line);
  }
  return out;
}

function isFileLikePath(value: string): boolean {
  // Must have a file-ish extension or contain a path separator.
  // Also exclude strings that look like code snippets (contain [ ] or { })
  if (/[[\]{}]/.test(value)) return false;
  return /\.[a-zA-Z0-9]+$/.test(value) || value.includes("/");
}

/**
 * Validate refs against a filesystem interface.
 *
 * `fileExists(path)` returns true iff the file exists on disk.
 * `readFile(path)` returns the file content if the ref has a `section`
 * hint (used for section existence check).
 *
 * Section check: if section hint is non-null and file is `.md`, search
 * the content for a heading line `## <section>` or `### <section>` or
 * a bolded paragraph pattern `**<section>**`. Best-effort, non-fatal.
 */
export function validateInfraRefs(
  refs: readonly InfraRef[],
  fs: {
    fileExists: (p: string) => boolean;
    readFile: (p: string) => string;
  },
): InfraRefVerdict[] {
  return refs.map((ref) => {
    if (!fs.fileExists(ref.path)) {
      return { ref, valid: false, reason: "file does not exist" };
    }
    if (ref.section && /\.md$/.test(ref.path)) {
      const content = fs.readFile(ref.path);
      if (!sectionExists(content, ref.section)) {
        return {
          ref,
          valid: false,
          reason: `section "§${ref.section}" not found in file`,
        };
      }
    }
    return { ref, valid: true };
  });
}

function sectionExists(content: string, section: string): boolean {
  // Normalize section name (trim whitespace, remove any leading hashes)
  const needle = section.replace(/^#+\s*/, "").trim();
  if (needle.length === 0) return true;

  // Try heading matches (## / ### / #### ...)
  const headingRe = new RegExp(`^#{2,6}\\s+${escapeRegex(needle)}\\b`, "mi");
  if (headingRe.test(content)) return true;

  // Try bolded paragraph match (some sections are **Name** format)
  const boldRe = new RegExp(`\\*\\*${escapeRegex(needle)}\\b`, "i");
  if (boldRe.test(content)) return true;

  // Plain text fallback — only for section names that look like anchors
  // (e.g. "Step 4a", "§3.5", "Check Item 5"), NOT for generic words that
  // could appear anywhere in prose.
  if (isAnchorLikeSection(needle)) {
    return content.includes(needle);
  }

  return false;
}

/**
 * Heuristic: a section name is "anchor-like" (and safe to match in prose)
 * when it contains a digit, a §, or is multi-word with a structural prefix.
 * Single generic words like "Subcommands" are NOT anchor-like.
 */
function isAnchorLikeSection(needle: string): boolean {
  if (/\d/.test(needle)) return true;
  if (needle.includes("§")) return true;
  // Chinese sections like "执行流程" are safe (won't coincidentally match English prose)
  if (/[\u4e00-\u9fff]/.test(needle)) return true;
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
