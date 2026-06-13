/**
 * Per-context glossary registry loader.
 *
 * Reads glossary markdown files from enabled packs and the custom layer,
 * builds a `GlossaryRegistry` keyed by `context::term` and by term name.
 * Supports backward compatibility with the legacy single-file `.forge/glossary.md`.
 *
 * **Validates: R1 Glossary loading, R2 Backward compat, R3 Custom override**
 */

import type { EnabledPacks, FileSystem, GlossaryEntry, GlossaryRegistry } from "../pack/types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load glossary entries from enabled packs and the custom layer.
 *
 * Pack glossary files live at `<pack.rootPath>/<pack.extends.glossary>/*.md`.
 * Custom glossary files live at `<customLayerRoot>/glossary/*.md`.
 *
 * Backward compat: when `enabledPacks.order` is empty AND
 * `customLayerRoot/glossary/` doesn't exist, falls back to reading
 * `.forge/glossary.md` as the `_shared` context.
 */
export async function loadGlossary(
  enabledPacks: EnabledPacks,
  fs: FileSystem,
): Promise<GlossaryRegistry> {
  const entries = new Map<string, GlossaryEntry>();
  const byTerm = new Map<string, GlossaryEntry[]>();

  // Backward compatibility shortcut
  if (
    enabledPacks.order.length === 0 &&
    !(await fs.exists(`${enabledPacks.customLayerRoot}/glossary`))
  ) {
    const legacyPath = `${enabledPacks.customLayerRoot.replace(/\/custom$/, "")}/glossary.md`;
    if (await fs.exists(legacyPath)) {
      const content = await fs.readFile(legacyPath);
      parseLegacyGlossary(content, legacyPath, entries, byTerm);
    }
    return { entries, byTerm };
  }

  // 1. Load from enabled packs (in order)
  for (const pack of enabledPacks.entries) {
    const glossaryDir = pack.extends.glossary;
    if (!glossaryDir) continue;

    const files = await listMdFiles(glossaryDir, fs);
    for (const file of files) {
      const context = fileNameToContext(file);
      const filePath = `${glossaryDir}/${file}`;
      const content = await fs.readFile(filePath);
      parseGlossaryFile(content, context, filePath, `pack:${pack.name}`, entries, byTerm);
    }
  }

  // 2. Load from custom layer (overrides pack entries)
  const customGlossaryDir = `${enabledPacks.customLayerRoot}/glossary`;
  if (await fs.exists(customGlossaryDir)) {
    const files = await listMdFiles(customGlossaryDir, fs);
    for (const file of files) {
      const context = fileNameToContext(file);
      const filePath = `${customGlossaryDir}/${file}`;
      const content = await fs.readFile(filePath);
      parseGlossaryFile(content, context, filePath, "custom", entries, byTerm);
    }
  }

  return { entries, byTerm };
}

// ---------------------------------------------------------------------------
// File parsing
// ---------------------------------------------------------------------------

/**
 * Parse a glossary markdown file with multiple `## <Term>` sections.
 *
 * Each section has YAML frontmatter:
 * ```
 * ---
 * term: Foo
 * aliases: [Bar, Baz]
 * updated: 2025-01-01
 * source: some-ref
 * ---
 * ```
 * followed by a `## 定义` heading whose paragraph is the definition.
 */
function parseGlossaryFile(
  content: string,
  context: string,
  sourcePath: string,
  sourceLayer: "custom" | `pack:${string}`,
  entries: Map<string, GlossaryEntry>,
  byTerm: Map<string, GlossaryEntry[]>,
): void {
  const fm = extractFirstFrontmatter(content);

  // Format A: aggregated (Sprint 2 PMS Pack style)
  if (fm && Array.isArray(fm.terms) && fm.terms.length > 0) {
    parseAggregatedFormat(
      fm as { terms: AggregatedTerm[] },
      context,
      sourcePath,
      sourceLayer,
      entries,
      byTerm,
    );
    return;
  }

  // Format B: per-term (Sprint 1 original style)
  if (fm && typeof fm.term === "string") {
    parsePerTermFormat(content, context, sourcePath, sourceLayer, entries, byTerm);
    return;
  }

  // Fallback: try per-term scanning even without top-level frontmatter match
  // (original behavior for files without aggregated/per-term indicators)
  const headingPattern = /^##\s+(?!定义)(.+?)\s*$/gm;
  const termPositions: { name: string; start: number }[] = [];
  let hMatch: RegExpExecArray | null = headingPattern.exec(content);
  while (hMatch !== null) {
    termPositions.push({ name: hMatch[1].trim(), start: hMatch.index });
    hMatch = headingPattern.exec(content);
  }

  if (termPositions.length > 0) {
    parsePerTermFormat(content, context, sourcePath, sourceLayer, entries, byTerm);
  }
}

interface AggregatedTerm {
  term: string;
  aliases?: string[];
  definition?: string;
}

function extractFirstFrontmatter(content: string): Record<string, unknown> | null {
  // Standard frontmatter: ---\n...\n---
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (match) return parseFrontmatterExtended(match[1]);

  // Unclosed frontmatter: file starts with ---\n but no closing ---
  if (content.startsWith("---\n")) {
    return parseFrontmatterExtended(content.slice(4));
  }

  return null;
}

function parseAggregatedFormat(
  fm: { terms: AggregatedTerm[] },
  context: string,
  sourcePath: string,
  sourceLayer: "custom" | `pack:${string}`,
  entries: Map<string, GlossaryEntry>,
  byTerm: Map<string, GlossaryEntry[]>,
): void {
  const today = new Date().toISOString().split("T")[0];
  for (const t of fm.terms) {
    if (typeof t.term !== "string" || !t.term) continue;
    addEntry(
      {
        term: t.term,
        context,
        definition: t.definition ?? "",
        aliases: Array.isArray(t.aliases) ? t.aliases : [],
        updated: today,
        source: null,
        sourcePath,
        sourceLayer,
      },
      entries,
      byTerm,
    );
  }
}

function parsePerTermFormat(
  content: string,
  context: string,
  sourcePath: string,
  sourceLayer: "custom" | `pack:${string}`,
  entries: Map<string, GlossaryEntry>,
  byTerm: Map<string, GlossaryEntry[]>,
): void {
  const headingPattern = /^##\s+(?!定义)(.+?)\s*$/gm;
  const termPositions: { name: string; start: number }[] = [];
  let hMatch: RegExpExecArray | null = headingPattern.exec(content);
  while (hMatch !== null) {
    termPositions.push({ name: hMatch[1].trim(), start: hMatch.index });
    hMatch = headingPattern.exec(content);
  }

  for (let i = 0; i < termPositions.length; i++) {
    const start = termPositions[i].start;
    const end = i + 1 < termPositions.length ? termPositions[i + 1].start : content.length;
    const block = content.slice(start, end);

    const fmMatch = block.match(/^##\s+.+?\n---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const parsedFm = parseFrontmatter(fmMatch[1]);
    const term = (parsedFm.term as string) ?? termPositions[i].name;
    if (!parsedFm.updated) continue;

    const defMatch = block.match(/##\s+定义\s*\n+([\s\S]*?)(?=\n##|\n*$)/);
    const definition = defMatch ? defMatch[1].trim() : "";

    addEntry(
      {
        term,
        context,
        definition,
        aliases: Array.isArray(parsedFm.aliases) ? (parsedFm.aliases as string[]) : [],
        updated: parsedFm.updated as string,
        source: (parsedFm.source as string) ?? null,
        sourcePath,
        sourceLayer,
      },
      entries,
      byTerm,
    );
  }
}

/** Add a single glossary entry to both maps, handling override logic. */
function addEntry(
  entry: GlossaryEntry,
  entries: Map<string, GlossaryEntry>,
  byTerm: Map<string, GlossaryEntry[]>,
): void {
  const key = `${entry.context}::${entry.term}`;

  // Custom layer overrides pack layer
  const existing = entries.get(key);
  if (existing && existing.sourceLayer === "custom" && entry.sourceLayer !== "custom") {
    return;
  }

  entries.set(key, entry);

  // Update byTerm index
  let list = byTerm.get(entry.term);
  if (!list) {
    list = [];
    byTerm.set(entry.term, list);
  }
  const existingIdx = list.findIndex((e) => `${e.context}::${e.term}` === key);
  if (existingIdx >= 0) {
    list[existingIdx] = entry;
  } else {
    list.push(entry);
  }

  // Also index aliases
  for (const alias of entry.aliases) {
    let aliasList = byTerm.get(alias);
    if (!aliasList) {
      aliasList = [];
      byTerm.set(alias, aliasList);
    }
    if (!aliasList.some((e) => `${e.context}::${e.term}` === key)) {
      aliasList.push(entry);
    }
  }
}

/**
 * Parse legacy single-file `.forge/glossary.md` as `_shared` context.
 *
 * Legacy format uses `### <Term>` headings with inline definition paragraphs.
 */
function parseLegacyGlossary(
  content: string,
  sourcePath: string,
  entries: Map<string, GlossaryEntry>,
  byTerm: Map<string, GlossaryEntry[]>,
): void {
  // Legacy format: ### TermName followed by definition paragraph
  const sections = splitByH3(content);

  for (const section of sections) {
    const headingMatch = section.match(/^###\s+(.+?)[\s]*$/m);
    if (!headingMatch) continue;
    const term = headingMatch[1].trim();

    // Extract definition (first paragraph after heading)
    const lines = section.split("\n").slice(1);
    const defLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("#")) break;
      if (line.trim() === "" && defLines.length > 0) break;
      if (line.trim() !== "") defLines.push(line.trim());
    }
    const definition = defLines.join(" ");

    if (!definition) continue;

    const entry: GlossaryEntry = {
      term,
      context: "_shared",
      definition,
      aliases: [],
      updated: new Date().toISOString().split("T")[0],
      source: null,
      sourcePath,
      sourceLayer: "core",
    };

    const key = `_shared::${term}`;
    entries.set(key, entry);

    let list = byTerm.get(term);
    if (!list) {
      list = [];
      byTerm.set(term, list);
    }
    list.push(entry);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse simple YAML frontmatter (key: value pairs, key: [list] syntax). */
export function parseFrontmatter(yaml: string): Record<string, string | string[] | null> {
  const result: Record<string, string | string[] | null> = {};
  for (const line of yaml.split("\n")) {
    const match = line.match(/^(\w+):\s*(.*)/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      result[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else if (value) {
      result[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }
  return result;
}

/** Parse YAML frontmatter with support for nested arrays of objects (aggregated format). */
function parseFrontmatterExtended(yaml: string): Record<string, unknown> | null {
  const lines = yaml.split("\n");

  // Try to detect if this is aggregated format (has terms: with nested objects)
  const termsIndex = lines.findIndex((l) => /^terms:\s*$/.test(l));
  if (termsIndex >= 0) {
    const result: Record<string, unknown> = {};
    // Parse top-level scalar fields before terms
    for (const line of lines.slice(0, termsIndex)) {
      const m = line.match(/^(\w+):\s*(.*)/);
      if (m) result[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
    // Parse terms array
    const terms: AggregatedTerm[] = [];
    let current: Partial<AggregatedTerm> | null = null;
    for (const line of lines.slice(termsIndex + 1)) {
      const termMatch = line.match(/^\s+-\s+term:\s*(.*)/);
      if (termMatch) {
        if (current?.term) terms.push(current as AggregatedTerm);
        current = { term: termMatch[1].trim().replace(/^['"]|['"]$/g, "") };
        continue;
      }
      if (!current) continue;
      const aliasMatch = line.match(/^\s+aliases:\s*\[(.*)\]/);
      if (aliasMatch) {
        current.aliases = aliasMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
          .filter(Boolean);
        continue;
      }
      const defMatch = line.match(/^\s+definition:\s*"(.*)"/);
      if (defMatch) {
        current.definition = defMatch[1];
      } else {
        const defMatch2 = line.match(/^\s+definition:\s*(.*)/);
        if (defMatch2) current.definition = defMatch2[1].trim().replace(/^['"]|['"]$/g, "");
      }
    }
    if (current?.term) terms.push(current as AggregatedTerm);
    result.terms = terms;
    return result;
  }

  // Simple scalar format — use the basic parser, typed as unknown
  const basic = parseFrontmatter(yaml);
  return basic as unknown as Record<string, unknown>;
}

/** Strip `.md` extension from filename to get context name. */
export function fileNameToContext(filename: string): string {
  return filename.replace(/\.md$/, "");
}

/** List all `*.md` files in a directory. */
async function listMdFiles(dir: string, fs: FileSystem): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (_err: unknown) {
    return [];
  }
  return names.filter((n) => n.endsWith(".md"));
}

/** Split markdown content by `### ` headings, preserving the heading. */
export function splitByH3(content: string): string[] {
  const parts = content.split(/\n(?=### )/);
  return parts.filter((p) => p.trim().length > 0);
}
