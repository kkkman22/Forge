/**
 * Glossary merge bridge (spec glossary-enforcement-bridge REQ-1).
 *
 * Closes the advisory/enforcement split left by slice B's REQ-6: enforcement
 * (`runGlossaryCheck`) previously saw only the flat `.forge/glossary.md`. This pure
 * function merges the flat (authoritative) glossary with enabled-pack glossary
 * entries into one `Glossary` so conflict detection covers the full domain
 * vocabulary.
 *
 * **Flat sovereignty**: on name/alias collision the flat definition wins — the pack
 * entry is skipped (never overrides, never merges aliases). Pack terms only fill
 * gaps the flat file doesn't cover. Empty `packEntries` → identity return (Zero-Pack).
 *
 * @module glossary/merge
 */

import type { Glossary, GlossaryTerm } from "../glossary.js";
import { normalize } from "../glossary.js";
import type { GlossaryEntry } from "../pack/types.js";

/**
 * Merge the flat (authoritative) glossary with enabled-pack glossary entries.
 *
 * - Flat terms are kept as-is; their terms + aliases form the "covered" set.
 * - A pack entry is **covered** (and skipped) when its normalized term OR any
 *   normalized alias is already in the covered set.
 * - Non-covered pack entries are appended (mapped to `GlossaryTerm`).
 * - When nothing is appended, the input `flat` is returned by reference (Zero-Pack
 *   identity — no allocation).
 *
 * @param flat         The authoritative flat glossary (from `.forge/glossary.md`).
 * @param packEntries  Glossary entries from enabled packs (read-only supplements).
 * @returns A merged `Glossary` (flat + appended pack terms). `flat` unchanged when
 *          `packEntries` is empty or fully covered.
 *
 * @example
 * ```ts
 * const merged = mergeGlossaries(flatGlossary, [...packRegistry.entries.values()]);
 * // feed `merged` to runGlossaryCheck as the `glossary` input
 * ```
 */
export function mergeGlossaries(flat: Glossary, packEntries: GlossaryEntry[]): Glossary {
  // Build the covered-key set from flat terms + aliases (normalized).
  const covered = new Set<string>();
  for (const t of flat.terms) {
    covered.add(normalize(t.term));
    if (t.aliases !== undefined) {
      for (const a of t.aliases) {
        const norm = normalize(a);
        if (norm.length > 0) covered.add(norm);
      }
    }
  }

  const appended: GlossaryTerm[] = [];
  for (const entry of packEntries) {
    // Skip if the pack entry's term OR any alias is already covered by flat.
    const keys = [normalize(entry.term), ...entry.aliases.map((a) => normalize(a))];
    if (keys.some((k) => covered.has(k))) continue;

    appended.push({
      term: entry.term,
      definition: entry.definition,
      ...(entry.aliases.length > 0 ? { aliases: entry.aliases } : {}),
      last_updated: entry.updated,
      source_session: entry.source ?? entry.sourceLayer,
    });
  }

  if (appended.length === 0) return flat; // identity — no allocation (Zero-Pack)
  return {
    schema_version: flat.schema_version,
    updated: flat.updated,
    terms: [...flat.terms, ...appended],
  };
}
