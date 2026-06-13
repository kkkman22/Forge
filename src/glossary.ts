/**
 * Glossary Registry — types, parser, and renderer for the Forge shared
 * domain glossary.
 *
 * The glossary lives in `.forge/glossary.md` (Open zone) and is consumed by
 * `forge-spec`, `forge-plan`, `forge-learn`, and `forge-decide` to keep
 * naming consistent across multi-session work. This module provides the
 * pure file-format layer only: parsing a markdown document into a
 * `Glossary` structure and rendering that structure back to markdown.
 *
 * The module is intentionally IO-free. All file access is expected to be
 * performed by caller / driver code.
 *
 * File format:
 *
 * ```
 * ---
 * schema_version: 1
 * updated: "2026-05-05"
 * ---
 *
 * # Forge Glossary
 *
 * ## Tier
 * **定义**: Forge 三维路由中的复杂度维度。
 * **别名**: 档位, 复杂度档位
 * **避免**: PRD（PRD 是产品需求文档...）
 * **关系**: → Plan: Tier 决定运行的命令序列
 * **歧义记录**: 无
 * **更新**: 2026-05-05
 * **来源**: 初始预置
 *
 * ## Spec
 * **定义**: 需求锁定的产物。
 * **更新**: 2026-05-05
 * ```
 *
 * **Validates: Requirements 1.1, 1.2**
 */

import { extractNumericField, extractStringField, parseFrontmatter } from "./frontmatter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single entry in the glossary.
 *
 * Required fields:
 *   - term:          canonical name, used as the H2 heading
 *   - definition:    concise description (single line recommended)
 *   - last_updated:  ISO 8601 date string (e.g. "2026-05-05")
 *
 * Optional fields:
 *   - aliases:        alternative names that map to the same term
 *   - source_session: filename in `.forge/knowledge/sessions/` that
 *                     introduced the term, when available
 */
export interface GlossaryTerm {
  term: string;
  definition: string;
  aliases?: string[];
  /** 禁用的同义词列表及原因。Agent 输出中使用这些词时应警告 */
  avoided_terms?: string[];
  /** 与其他术语的关系。格式：`→ <术语>: <关系描述>` */
  relations?: string[];
  /** 曾经有过的术语争论和结论。防止未来重新争论 */
  ambiguity_notes?: string[];
  last_updated: string;
  source_session?: string;
}

/**
 * Full glossary document structure.
 *
 *   - schema_version: positive integer used for future migrations
 *   - updated:        ISO 8601 date of the last glossary update
 *   - terms:          ordered list of active `GlossaryTerm` entries
 *   - archivedTerms:  optional ordered list of archived entries shown
 *                      under a trailing `## Archived` section. Terms are
 *                      moved here by {@link archiveTerm} when the learn
 *                      skill decides they are stale.
 *
 * On-disk, the archived section is sentinel-delimited: a literal
 * (case-sensitive) `## Archived` H2 line divides active entries above
 * from archived entries below. The name `Archived` is reserved and must
 * not be used as an ordinary term name.
 */
export interface Glossary {
  schema_version: number;
  updated: string;
  terms: GlossaryTerm[];
  archivedTerms?: GlossaryTerm[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** H1 heading used as the glossary document title. */
const GLOSSARY_TITLE = "# Forge Glossary";

/**
 * Sentinel H2 heading that partitions active terms from archived terms.
 * Everything below this heading is treated as an archived entry, stored
 * under `Glossary.archivedTerms`. Match is case-sensitive so stray term
 * names like "archived" do not accidentally trigger the partition.
 */
const ARCHIVED_SENTINEL = "## Archived";

/**
 * Accept either ASCII ":" or fullwidth "：" on parse so human edits in
 * Chinese tooling are tolerated. Render always emits ASCII ":".
 */
const COLON_CLASS = "[:：]";

const H2_HEADING_REGEX = /^##\s+(.+?)\s*$/;
const FIELD_DEFINITION_REGEX = new RegExp(`^\\*\\*定义\\*\\*${COLON_CLASS}\\s*(.*)$`);
const FIELD_ALIASES_REGEX = new RegExp(`^\\*\\*别名\\*\\*${COLON_CLASS}\\s*(.*)$`);
const FIELD_AVOIDED_REGEX = new RegExp(`^\\*\\*避免\\*\\*${COLON_CLASS}\\s*(.*)$`);
const FIELD_RELATIONS_REGEX = new RegExp(`^\\*\\*关系\\*\\*${COLON_CLASS}\\s*(.*)$`);
const FIELD_AMBIGUITY_REGEX = new RegExp(`^\\*\\*歧义记录\\*\\*${COLON_CLASS}\\s*(.*)$`);
const FIELD_UPDATED_REGEX = new RegExp(`^\\*\\*更新\\*\\*${COLON_CLASS}\\s*(.*)$`);
const FIELD_SOURCE_REGEX = new RegExp(`^\\*\\*来源\\*\\*${COLON_CLASS}\\s*(.*)$`);

/** Delimiters accepted when parsing the aliases list. */
const ALIAS_SPLIT_REGEX = /[,、]/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a glossary markdown document into a `Glossary` structure.
 *
 * Behaviour:
 *   - Missing / malformed frontmatter yields an empty glossary with
 *     `schema_version=1`, `updated=""`, and `terms=[]`
 *   - Each H2 heading `## <term>` starts a new term entry
 *   - Field lines `**定义**:`, `**别名**:`, `**更新**:`, `**来源**:`
 *     populate the corresponding term fields
 *   - Terms without a `**定义**:` line are considered malformed and are
 *     dropped; no error is thrown (permissive parser)
 *   - Unknown lines inside a term block are ignored
 *
 * This function is pure: same input always yields the same output, and it
 * performs no IO.
 */
export function parseGlossary(content: string): Glossary {
  const fm = parseFrontmatter(content);
  if (fm === null) {
    return { schema_version: 1, updated: "", terms: [] };
  }

  const schema_version = extractNumericField(fm.raw, "schema_version") ?? 1;
  const updated = extractStringField(fm.raw, "updated") ?? "";
  const { active, archived } = splitBodyByArchiveSentinel(fm.body);
  const terms = parseTerms(active);
  const archivedTerms = parseTerms(archived);

  const out: Glossary = { schema_version, updated, terms };
  if (archivedTerms.length > 0) {
    out.archivedTerms = archivedTerms;
  }
  return out;
}

/**
 * Render a `Glossary` structure to its canonical markdown representation.
 *
 * The rendered output is consumable by `parseGlossary` such that
 * `parseGlossary(renderGlossary(g))` is structurally equal to `g` when `g`
 * is well-formed (see the property-based test for the equivalence
 * contract).
 *
 * Rules:
 *   - `updated` is quoted in the YAML frontmatter
 *   - `aliases` is omitted when the array is empty or undefined
 *   - `source_session` is omitted when undefined or empty
 *   - Each term is followed by a blank line for readability
 */
export function renderGlossary(glossary: Glossary): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`schema_version: ${glossary.schema_version}`);
  lines.push(`updated: "${glossary.updated}"`);
  lines.push("---");
  lines.push("");
  lines.push(GLOSSARY_TITLE);
  lines.push("");

  for (const term of glossary.terms) {
    appendTermLines(lines, term);
  }

  if (glossary.archivedTerms !== undefined && glossary.archivedTerms.length > 0) {
    lines.push(ARCHIVED_SENTINEL);
    lines.push("");
    for (const term of glossary.archivedTerms) {
      appendTermLines(lines, term);
    }
  }

  return lines.join("\n");
}

/**
 * Render a single term block (H2 heading + fields + trailing blank line)
 * into the supplied `lines` accumulator. Shared by active and archived
 * rendering paths so both sections use the same canonical format.
 */
function appendTermLines(lines: string[], term: GlossaryTerm): void {
  lines.push(`## ${term.term}`);
  lines.push(`**定义**: ${term.definition}`);
  if (term.aliases && term.aliases.length > 0) {
    lines.push(`**别名**: ${term.aliases.join(", ")}`);
  }
  if (term.avoided_terms && term.avoided_terms.length > 0) {
    lines.push(`**避免**: ${term.avoided_terms.join("; ")}`);
  }
  if (term.relations && term.relations.length > 0) {
    lines.push(`**关系**: ${term.relations.join("; ")}`);
  }
  if (term.ambiguity_notes && term.ambiguity_notes.length > 0) {
    lines.push(`**歧义记录**: ${term.ambiguity_notes.join("; ")}`);
  }
  lines.push(`**更新**: ${term.last_updated}`);
  if (term.source_session && term.source_session.length > 0) {
    lines.push(`**来源**: ${term.source_session}`);
  }
  lines.push("");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Mutable accumulator used while collecting a single term's fields. */
interface TermAccumulator {
  term: string;
  definition: string;
  aliases?: string[];
  avoided_terms?: string[];
  relations?: string[];
  ambiguity_notes?: string[];
  last_updated: string;
  source_session?: string;
}

/**
 * Parse the body (everything after the closing frontmatter delimiter) into
 * an ordered list of `GlossaryTerm` entries.
 */
export function parseTerms(body: string): GlossaryTerm[] {
  const terms: GlossaryTerm[] = [];
  const lines = body.split("\n");
  let current: TermAccumulator | null = null;

  const flush = (): void => {
    if (current === null) return;
    // Drop malformed terms: a term must have at least a non-empty name
    // and a definition to be committed.
    if (current.term.length > 0 && current.definition.length > 0) {
      const entry: GlossaryTerm = {
        term: current.term,
        definition: current.definition,
        last_updated: current.last_updated,
      };
      if (current.aliases !== undefined) {
        entry.aliases = current.aliases;
      }
      if (current.avoided_terms !== undefined) {
        entry.avoided_terms = current.avoided_terms;
      }
      if (current.relations !== undefined) {
        entry.relations = current.relations;
      }
      if (current.ambiguity_notes !== undefined) {
        entry.ambiguity_notes = current.ambiguity_notes;
      }
      if (current.source_session !== undefined) {
        entry.source_session = current.source_session;
      }
      terms.push(entry);
    }
    current = null;
  };

  for (const line of lines) {
    const h2Match = line.match(H2_HEADING_REGEX);
    if (h2Match !== null) {
      flush();
      current = { term: h2Match[1].trim(), definition: "", last_updated: "" };
      continue;
    }

    if (current === null) continue;

    const defMatch = line.match(FIELD_DEFINITION_REGEX);
    if (defMatch !== null) {
      current.definition = defMatch[1].trim();
      continue;
    }

    const aliasMatch = line.match(FIELD_ALIASES_REGEX);
    if (aliasMatch !== null) {
      const raw = aliasMatch[1].trim();
      if (raw.length > 0) {
        const items = raw
          .split(ALIAS_SPLIT_REGEX)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (items.length > 0) {
          current.aliases = items;
        }
      }
      continue;
    }

    const avoidedMatch = line.match(FIELD_AVOIDED_REGEX);
    if (avoidedMatch !== null) {
      const raw = avoidedMatch[1].trim();
      if (raw.length > 0) {
        // 避免 field: extract the avoided synonym(s) before the parenthetical reason
        // e.g. "PRD（PRD 是产品需求文档...）" → ["PRD"]
        const items = raw
          .split(/[;；]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (items.length > 0) {
          current.avoided_terms = items;
        }
      }
      continue;
    }

    const relationsMatch = line.match(FIELD_RELATIONS_REGEX);
    if (relationsMatch !== null) {
      const raw = relationsMatch[1].trim();
      if (raw.length > 0) {
        // 关系 field: semicolon-separated relations
        const items = raw
          .split(/[;；]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (items.length > 0) {
          current.relations = items;
        }
      }
      continue;
    }

    const ambiguityMatch = line.match(FIELD_AMBIGUITY_REGEX);
    if (ambiguityMatch !== null) {
      const raw = ambiguityMatch[1].trim();
      if (raw.length > 0) {
        current.ambiguity_notes = [raw];
      }
      continue;
    }

    const updatedMatch = line.match(FIELD_UPDATED_REGEX);
    if (updatedMatch !== null) {
      current.last_updated = updatedMatch[1].trim();
      continue;
    }

    const sourceMatch = line.match(FIELD_SOURCE_REGEX);
    if (sourceMatch !== null) {
      const raw = sourceMatch[1].trim();
      if (raw.length > 0) {
        current.source_session = raw;
      }
    }
  }

  flush();
  return terms;
}

/**
 * Partition the body (everything after the frontmatter) into the text
 * above and below the `## Archived` sentinel heading.
 *
 * The sentinel itself is consumed (it appears in neither side). When the
 * sentinel does not appear, `active` holds the full body and `archived`
 * is the empty string.
 *
 * Matching rules:
 *   - case-sensitive match on the literal line `## Archived`
 *   - trailing whitespace on the line is tolerated so minor editor
 *     quirks (e.g. stray spaces) do not silently break partitioning
 *   - only the first occurrence acts as a divider; subsequent
 *     `## Archived` lines below the first one are treated as ordinary
 *     content inside the archived section (they would be dropped by
 *     `parseTerms` since "Archived" fails the term-block requirements)
 */
export function splitBodyByArchiveSentinel(body: string): { active: string; archived: string } {
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trimEnd() === ARCHIVED_SENTINEL) {
      const active = lines.slice(0, i).join("\n");
      const archived = lines.slice(i + 1).join("\n");
      return { active, archived };
    }
  }
  return { active: body, archived: "" };
}

// ---------------------------------------------------------------------------

/**
 * Result of {@link detectConflict}.
 *
 *   - `hasConflict` is `true` only when a conflict is found
 *   - `conflictingTerm` is the existing glossary term that clashes with the
 *     candidate (omitted when there is no conflict)
 *   - `reason` identifies the kind of conflict:
 *       * `same_term_different_definition` — candidate term name matches an
 *         existing term name (case-insensitive) but definitions differ
 *       * `same_alias_different_term` — an alias on the candidate already
 *         belongs to a different term (as that term's name or as one of its
 *         aliases)
 */
export interface ConflictResult {
  hasConflict: boolean;
  conflictingTerm?: GlossaryTerm;
  reason?: "same_term_different_definition" | "same_alias_different_term";
}

/**
 * Look up a term by its canonical name or any of its aliases.
 *
 * Matching is case-insensitive and whitespace-insensitive at the edges. The
 * first matching term (in glossary order) is returned. Returns `null` when
 * no term matches or the query is blank.
 *
 * This function is pure.
 */
export function findTerm(glossary: Glossary, query: string): GlossaryTerm | null {
  const needle = normalize(query);
  if (needle.length === 0) return null;

  for (const term of glossary.terms) {
    if (normalize(term.term) === needle) return term;
    if (term.aliases !== undefined) {
      for (const alias of term.aliases) {
        if (normalize(alias) === needle) return term;
      }
    }
  }
  return null;
}

/**
 * Detect whether adding `candidate` to `glossary` would clash with an
 * existing entry.
 *
 * Two kinds of conflict are reported, in priority order:
 *
 *   1. `same_term_different_definition` — the candidate's canonical name
 *      matches an existing term (case-insensitive) but their definitions
 *      differ. Trimmed comparison.
 *   2. `same_alias_different_term` — any of the candidate's aliases already
 *      appears in the glossary under a different term, either as that
 *      term's canonical name or as one of its aliases.
 *
 * When the candidate is a no-op extension of an existing term (same name
 * and same definition), no conflict is reported. This function is pure and
 * never mutates its inputs.
 */
export function detectConflict(glossary: Glossary, candidate: GlossaryTerm): ConflictResult {
  const candidateTerm = normalize(candidate.term);
  const candidateDefinition = candidate.definition.trim();

  // Build inverted index: normalized name/alias → existing term
  // This converts the O(n³) nested loop into O(n) index build + O(1) lookups
  const termByName = new Map<string, GlossaryTerm>();
  const aliasMap = new Map<string, GlossaryTerm>();
  for (const existing of glossary.terms) {
    termByName.set(normalize(existing.term), existing);
    if (existing.aliases !== undefined) {
      for (const alias of existing.aliases) {
        const norm = normalize(alias);
        if (norm.length > 0) {
          aliasMap.set(norm, existing);
        }
      }
    }
  }

  // 1. Same-term / different-definition check
  const existingMatch = termByName.get(candidateTerm);
  if (existingMatch !== undefined) {
    if (existingMatch.definition.trim() !== candidateDefinition) {
      return {
        hasConflict: true,
        conflictingTerm: existingMatch,
        reason: "same_term_different_definition",
      };
    }
  }

  // 2. Alias collision check: any candidate alias matching another term's
  //    canonical name or alias (O(1) per alias via inverted index).
  if (candidate.aliases !== undefined) {
    for (const alias of candidate.aliases) {
      const needle = normalize(alias);
      if (needle.length === 0) continue;
      // An alias that equals the candidate's own term is not a collision.
      if (needle === candidateTerm) continue;

      // Check if alias matches another term's canonical name
      const termHit = termByName.get(needle);
      if (termHit !== undefined && normalize(termHit.term) !== candidateTerm) {
        return {
          hasConflict: true,
          conflictingTerm: termHit,
          reason: "same_alias_different_term",
        };
      }

      // Check if alias matches another term's alias
      const aliasHit = aliasMap.get(needle);
      if (aliasHit !== undefined && normalize(aliasHit.term) !== candidateTerm) {
        return {
          hasConflict: true,
          conflictingTerm: aliasHit,
          reason: "same_alias_different_term",
        };
      }
    }
  }

  return { hasConflict: false };
}

/**
 * Merge a `candidate` term into a glossary using the requested `strategy`.
 *
 * Strategies:
 *   - `append`    — add `candidate` when no existing term shares its name
 *                   (case-insensitive). No-op when the name already exists.
 *   - `replace`   — replace the existing same-named term with `candidate`.
 *                   Adds `candidate` when the name is not present.
 *   - `add_alias` — merge `candidate.aliases` into the existing same-named
 *                   term's alias list, preserving order and deduplicating
 *                   case-insensitively. No-op when the name is not present
 *                   or when `candidate` has no aliases.
 *
 * All three strategies are idempotent: applying the same merge twice
 * yields the same glossary as applying it once. This function is pure and
 * returns a new glossary; neither argument is mutated.
 */
export function mergeTerm(
  glossary: Glossary,
  candidate: GlossaryTerm,
  strategy: "append" | "replace" | "add_alias",
): Glossary {
  const candidateName = normalize(candidate.term);
  const existingIndex = glossary.terms.findIndex((t) => normalize(t.term) === candidateName);

  switch (strategy) {
    case "append": {
      if (existingIndex !== -1) return glossary;
      return { ...glossary, terms: [...glossary.terms, candidate] };
    }
    case "replace": {
      if (existingIndex === -1) {
        return { ...glossary, terms: [...glossary.terms, candidate] };
      }
      const next = glossary.terms.slice();
      next[existingIndex] = candidate;
      return { ...glossary, terms: next };
    }
    case "add_alias": {
      if (existingIndex === -1) return glossary;
      if (candidate.aliases === undefined || candidate.aliases.length === 0) {
        return glossary;
      }
      const existing = glossary.terms[existingIndex];
      const merged = mergeAliases(existing.aliases, candidate.aliases);
      if (aliasesEqual(existing.aliases, merged)) return glossary;

      const nextTerm: GlossaryTerm = { ...existing, aliases: merged };
      const next = glossary.terms.slice();
      next[existingIndex] = nextTerm;
      return { ...glossary, terms: next };
    }
  }
}

/**
 * Return the subset of terms whose `last_updated` is older than
 * `maxAgeDays` days before `now`.
 *
 * Terms with a malformed or missing `last_updated` are treated as stale
 * (they cannot be proven fresh). The default `maxAgeDays` is 30, matching
 * the glossary maintenance window described in Requirement 1.11.
 *
 * This function is pure. The returned array is a (possibly empty) subset
 * of `glossary.terms` in their original order.
 */
export function findStaleterms(
  glossary: Glossary,
  now: Date,
  maxAgeDays: number = 30,
): GlossaryTerm[] {
  const nowMs = now.getTime();
  const thresholdMs = maxAgeDays * MS_PER_DAY;
  return glossary.terms.filter((term) => {
    const updatedMs = parseIsoDate(term.last_updated);
    if (updatedMs === null) return true;
    return nowMs - updatedMs > thresholdMs;
  });
}

/**
 * Move a term from the active glossary into the `## Archived` section.
 *
 * Behaviour:
 *   - When the term is not found in `glossary.terms` (case-insensitive
 *     match on canonical name), the glossary is returned unchanged.
 *   - When the term is found, it is removed from `terms` and appended to
 *     `archivedTerms`. Existing order among the other active terms is
 *     preserved; the archived entry is placed at the end of the archived
 *     list.
 *   - When an archived entry with the same canonical name already
 *     exists, it is replaced by the newly archived term (re-archiving is
 *     idempotent and always uses the most recent definition).
 *
 * Matching is case- and whitespace-insensitive on the canonical term
 * name only; aliases are not considered because archival acts on a
 * specific entry rather than on a concept.
 *
 * This function is pure and returns a new `Glossary`; the input is
 * never mutated.
 *
 * **Validates: Requirements 1.11**
 */
export function archiveTerm(glossary: Glossary, termName: string): Glossary {
  const needle = normalize(termName);
  if (needle.length === 0) return glossary;

  const index = glossary.terms.findIndex((t) => normalize(t.term) === needle);
  if (index === -1) return glossary;

  const archived = glossary.terms[index];
  const remaining = [...glossary.terms.slice(0, index), ...glossary.terms.slice(index + 1)];

  const priorArchived = glossary.archivedTerms ?? [];
  const filteredArchived = priorArchived.filter((t) => normalize(t.term) !== needle);
  const nextArchived = [...filteredArchived, archived];

  return {
    ...glossary,
    terms: remaining,
    archivedTerms: nextArchived,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers (query / conflict / merge / stale)
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Case- and whitespace-insensitive normalization used for name lookups. */
export function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Deduplicate the combination of existing aliases and new ones while
 * preserving the order of first appearance. Comparison is
 * case-insensitive; the first surface form wins.
 */
export function mergeAliases(existing: string[] | undefined, incoming: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  if (existing !== undefined) {
    for (const alias of existing) push(alias);
  }
  for (const alias of incoming) push(alias);

  return out;
}

/** Structural equality for optional alias arrays. */
function aliasesEqual(a: string[] | undefined, b: string[]): boolean {
  if (a === undefined) return b.length === 0;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Parse an ISO 8601 date (YYYY-MM-DD or full timestamp) to epoch
 * milliseconds. Returns `null` on any parse failure, including empty input.
 */
function parseIsoDate(value: string): number | null {
  if (value === undefined || value === null || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
