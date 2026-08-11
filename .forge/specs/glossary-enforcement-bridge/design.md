---
feature: glossary-enforcement-bridge
layout: design
created: 2026-06-29
---

# Design — Glossary Enforcement Bridge (Slice C)

## Overview

Slice B split glossary into two paths: **advisory** (pack terms injected into phase
context, read-only) and **enforcement** (`runGlossaryCheck` against the flat
`.forge/glossary.md` only). This slice reunifies them: enforcement now sees pack
terms too, via a merge that keeps the flat file authoritative.

```
                         runGlossaryCheck({ glossary, ... })
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │  loadEnforcementGlossary       │  ← src/glossary/enforcement.ts (NEW)
                    └──────┬─────────────────────┬───┘
                           │                     │
              ensureGlossaryExists              mergeGlossaries(flat, packEntries)
              (flat, authoritative)              ← src/glossary/merge.ts (NEW)
                           │                     │
                  .forge/glossary.md      loadGlossary(enabledPacks, fs)
                                                  │
                                          loadEnabledPacks (slice B)
```

`runGlossaryCheck` itself is **unchanged** — it already takes a `Glossary` and
iterates `glossary.terms`. The bridge just feeds it a richer `Glossary`.

## Components and Interfaces

### Component 1: `src/glossary/merge.ts` (REQ-1)

Pure merge — flat authoritative, pack supplements.

```ts
import type { Glossary, GlossaryTerm } from "../glossary.js";
import type { GlossaryEntry } from "../pack/types.js";

/**
 * Merge the flat (authoritative) glossary with enabled-pack glossary entries.
 * Flat wins on name/alias collision (pack skipped); pack fills gaps flat doesn't
 * cover. Empty packEntries → identity (Zero-Pack).
 */
export function mergeGlossaries(flat: Glossary, packEntries: GlossaryEntry[]): Glossary {
  // Build the covered-key set from flat terms + aliases (normalized).
  const covered = new Set<string>();
  for (const t of flat.terms) {
    covered.add(normalize(t.term));
    if (t.aliases) for (const a of t.aliases) covered.add(normalize(a));
  }

  const appended: GlossaryTerm[] = [];
  for (const entry of packEntries) {
    // Skip if the pack entry's term OR any alias is already covered by flat.
    const keys = [normalize(entry.term), ...entry.aliases.map(normalize)];
    if (keys.some((k) => covered.has(k))) continue;
    appended.push({
      term: entry.term,
      definition: entry.definition,
      ...(entry.aliases.length > 0 ? { aliases: entry.aliases } : {}),
      last_updated: entry.updated,
      source_session: entry.source ?? entry.sourceLayer,
    });
  }

  if (appended.length === 0) return flat; // identity — no allocation
  return {
    schema_version: flat.schema_version,
    updated: flat.updated,
    terms: [...flat.terms, ...appended],
  };
}
```

`normalize` is imported from `../glossary.js` (the existing `normalize` used by
`detectConflict` — reuse, don't duplicate). Check: it's case/whitespace-insensitive.

**Design notes**:
- Flat sovereignty (INV-5): a pack entry whose term/alias collides with flat is
  skipped entirely — flat definition wins, no override, no alias-merge. This is the
  conservative choice that avoids enforcement false-positives from pack/flat drift.
- `appended.length === 0` → return `flat` by reference (Zero-Pack identity, no
  allocation — INV-1).
- `detectConflict` iterates `glossary.terms`, so the merged list is enforced as one.

### Component 2: `src/glossary/enforcement.ts` (REQ-2)

Single-call loader composing flat + pack + merge.

```ts
import type { Glossary } from "../glossary.js";
import type { FileSystem } from "../pack/types.js";
import { ensureGlossaryExists, type GlossaryFs } from "../glossary-driver.js";
import { loadEnabledPacks } from "../pack/runtime.js";
import { loadGlossary } from "./registry.js";
import { mergeGlossaries } from "./merge.js";

export interface EnforcementGlossary {
  glossary: Glossary;        // merged — feed to runGlossaryCheck
  packTermCount: number;     // pack entries actually appended (post-merge)
  warnings: string[];        // non-fatal discovery warnings
}

export async function loadEnforcementGlossary(
  rootDir: string,
  fs: FileSystem,
  options: { glossaryPath?: string; now?: Date } = {},
): Promise<EnforcementGlossary> {
  const warnings: string[] = [];

  // 1. Flat glossary (authoritative) — reuse the existing driver + its fs contract.
  const flat = ensureGlossaryExists(fs as GlossaryFs, {
    path: options.glossaryPath,
    now: options.now,
  });

  // 2. Enabled packs (Zero-Pack fast path: empty → flat unchanged).
  const { enabled, warnings: epWarnings } = await loadEnabledPacks(rootDir, fs);
  warnings.push(...epWarnings);
  if (enabled.order.length === 0) {
    return { glossary: flat, packTermCount: 0, warnings };
  }

  // 3. Pack glossary + merge.
  const packRegistry = await loadGlossary(enabled, fs);
  const packEntries = [...packRegistry.entries.values()];
  const before = flat.terms.length;
  const glossary = mergeGlossaries(flat, packEntries);

  return {
    glossary,
    packTermCount: glossary.terms.length - before,
    warnings,
  };
}
```

**Design notes**:
- `ensureGlossaryExists` takes `GlossaryFs` (a narrower sync interface:
  `exists/readFile/writeFile`). `FileSystem` (pack) is async + superset. The cast
  `fs as GlossaryFs` is **not** safe (async vs sync). Resolution: provide a tiny
  sync adapter inline OR — cleaner — read the flat file via `fs.readFile` (async)
  and `parseGlossary` directly, seeding only if absent. See "fs-contract mismatch"
  in Edge Cases below — the implementation will use the async read path and only
  delegate seeding to `ensureGlossaryExists` when the file is absent (where its
  sync contract is acceptable for the seed write).
- `packTermCount = glossary.terms.length - before` counts appended terms (post-merge),
  matching REQ-2.4.
- Zero-Pack path returns before any pack loader runs → zero pack-file reads (INV-1).

### Component 3: Public API (REQ-3)

`src/index.ts` — append to the existing aggregated re-export block:
```ts
export { mergeGlossaries } from "./glossary/merge.js";
export { loadEnforcementGlossary } from "./glossary/enforcement.js";
export type { EnforcementGlossary } from "./glossary/enforcement.js";
```
No new `export` statement — symbols merge into the existing block (barrel stays 20/20).

### Component 4: Phase instruction wiring (REQ-4)

Update every phase that feeds `glossary` to `runGlossaryCheck`. The change is to the
**source** of the `glossary` argument:

- `skills/forge/lib/{spec,decide,plan,grill,build,review}/references/function-contracts.md`:
  change "`glossary` — Parsed `.forge/glossary.md` structure" → "`glossary` —
  `loadEnforcementGlossary(rootDir, fs)` result (flat `.forge/glossary.md` + enabled
  pack glossary terms; flat is authoritative)".
- Corresponding `instructions.md` glossary-hook call sites: note that the glossary
  now comes from `loadEnforcementGlossary`.
- Add a one-line note: pack terms are read-only supplements; the flat file remains
  the only write target (`/forge learn` writes back to `.forge/glossary.md`, never to
  packs).

**Affected files** (from grep): spec/decide/plan/grill/build/review `instructions.md`
+ their `function-contracts.md` references.

## Edge Cases

| Case | Handling |
|------|----------|
| No enabled pack | `loadEnforcementGlossary` returns flat unchanged, 0 reads (INV-1) |
| Pack term collides with flat term | skipped (flat wins, INV-5) |
| Pack term collides with flat alias | skipped |
| Pack term collides with another pack term | first-wins (insertion order; both already in packEntries, second is covered by first) |
| Flat file absent | `ensureGlossaryExists` seeds the 12 core terms (existing behavior) |
| Malformed pack glossary | `loadGlossary` warnings bubble; merge proceeds with what parsed |

### fs-contract mismatch (design resolution)

`ensureGlossaryExists` uses a **sync** `GlossaryFs` (`exists/readFile/writeFile` all
sync). `loadEnabledPacks`/`loadGlossary` use an **async** `FileSystem`. Mixing them
in one loader requires care. Resolution: in `loadEnforcementGlossary`, read the flat
file via the **async** `fs.exists`/`fs.readFile`; if absent, seed via a small async
seed-write (reusing `INITIAL_GLOSSARY_TERMS` + `renderGlossary`), OR construct a sync
shim around the async fs for the one seed call. The implementation will prefer the
async read + `parseGlossary` path and only seed on absence, keeping the function
fully async (no blocking). This avoids the unsafe `as GlossaryFs` cast flagged above.

## Conflict semantics (the deliberate behavior change)

Pre-slice-C: enforcement saw only flat terms. Post: enforcement sees flat + non-
covered pack terms. This means a user text using a pack-defined term in a way that
conflicts with the pack definition will now be flagged (it wasn't before). This is
the intended closure of the advisory/enforcement split (slice B REQ-6's stated reason
for deferral). The block policy is unchanged (plan/review/build never block;
spec/decide/grill/learn block only in interactive mode), so autonomous runs are not
newly disrupted.
