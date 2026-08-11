---
status: locked
feature: glossary-enforcement-bridge
layout: requirements
created: 2026-06-29
tier: full
spec_ref: ".forge/specs/domain-knowledge-threading/requirements.md REQ-6 (deferred to slice C)"
---

# Requirements — Glossary Enforcement Bridge (Slice C)

## Introduction

Slice B's REQ-6 explicitly **deferred** one item to slice C: *"Bridging the layered
`loadGlossary` into `runGlossaryCheck` enforcement is a separate follow-up (slice C)
because it changes the check's semantics and risks false positives."*

Slice B closed the **advisory** half — phase instructions now inject pack glossary
terms as read-only summaries. But **enforcement** still runs only against the flat
`.forge/glossary.md`: the pack's domain terms (e.g. PMS's "Reservation"/"Booking")
do not participate in conflict detection. The advisory and enforcement paths are
split — an agent can see a pack term in its injected context yet `runGlossaryCheck`
won't catch a conflicting usage of that same term.

This slice closes that split by **merging** the flat glossary (authoritative) with
enabled-pack glossary entries into a single `Glossary` that `runGlossaryCheck`
consumes. Flat stays the write-sovereignty source; pack terms are read-only
supplements that fill gaps the flat file doesn't cover.

Source: slice B spec `.forge/specs/domain-knowledge-threading/requirements.md` REQ-6.

## Glossary

- **Flat glossary**: `.forge/glossary.md` — the single authoritative, writable
  glossary. Parsed by `ensureGlossaryExists` (`glossary-driver.ts`) into a `Glossary`
  (`Glossary.terms: GlossaryTerm[]`). This is the **write-sovereignty source**.
- **Pack glossary**: per-pack `glossary/` entries loaded by `loadGlossary(enabledPacks)`
  → `GlossaryRegistry.entries: Map<string, GlossaryEntry>`. Read-only supplements.
- **Enforcement glossary**: the merged `Glossary` fed to `runGlossaryCheck` — flat
  terms plus pack terms that the flat file doesn't already define (by name or alias).
- **mergeGlossaries**: the pure bridge function (flat + packEntries → Glossary).
- **loadEnforcementGlossary**: the single-call loader a skill driver uses to produce
  the enforcement glossary (composes ensureGlossaryExists + loadEnabledPacks +
  loadGlossary + mergeGlossaries).

## Requirements

### REQ-1: mergeGlossaries pure bridge function

**User Story:** As `runGlossaryCheck`, I want a merged glossary containing both the
flat file's terms and the enabled packs' terms, so conflict detection covers the
full domain vocabulary, not just the flat file.

1. THE module `src/glossary/merge.ts` SHALL expose
   `mergeGlossaries(flat: Glossary, packEntries: GlossaryEntry[]): Glossary`.
2. THE returned `Glossary` SHALL reuse `flat.schema_version` and `flat.updated`;
   its `terms` SHALL be `flat.terms` followed by the pack entries the flat file
   does not already cover.
3. A pack entry is **covered** (and thus skipped) when its normalized `term` OR any
   normalized `alias` matches a normalized term or alias already present in `flat`.
   Normalization SHALL be case- and whitespace-insensitive (matching `glossary.ts`'s
   `normalize`).
4. Non-covered pack entries SHALL be appended as `GlossaryTerm` with fields mapped:
   `term`, `definition`, `aliases` (omitted when empty), `last_updated` ← `updated`,
   `source_session` ← `source ?? sourceLayer`.
5. WHEN `packEntries` is empty, `mergeGlossaries` SHALL return `flat` unchanged
   (Zero-Pack identity — INV-1).
6. THE function SHALL be pure (no filesystem, no I/O).

### REQ-2: loadEnforcementGlossary loader

**User Story:** As a phase skill driver, I want one function that produces the
enforcement glossary, so I do not reassemble flat + pack loading + merge by hand.

1. THE module `src/glossary/enforcement.ts` SHALL expose
   `loadEnforcementGlossary(rootDir, fs, options?): Promise<{ glossary: Glossary; packTermCount: number; warnings: string[] }>`.
2. THE loader SHALL compose: the flat-glossary load (`ensureGlossaryExists`
   *semantics* — read `.forge/glossary.md`; seed the 12 core terms if absent) →
   `loadEnabledPacks(rootDir, fs)` → when `enabled.order.length > 0`,
   `loadGlossary(enabled, fs)` → `mergeGlossaries(flat, [...packRegistry.entries.values()])`.
   *(Implementation note: because `ensureGlossaryExists` uses a sync `GlossaryFs`
   while the pack loaders use an async `FileSystem`, the loader re-implements the
   flat read+seed on the async contract — behavior-equivalent to
   `ensureGlossaryExists`. See design.md "fs-contract mismatch".)*
3. WHEN no pack is enabled, the loader SHALL return the flat glossary unchanged
   with `packTermCount: 0` and perform zero pack-file reads (Zero-Pack-Zero-Impact).
4. `packTermCount` SHALL equal the number of pack entries actually appended
   (post-merge, i.e. non-covered ones).
5. `warnings` SHALL aggregate `loadEnabledPacks` + `loadGlossary` warnings
   (missing config, unknown packs, etc.) — non-fatal.

### REQ-3: Public API exports

**User Story:** As a phase skill, I want to import the bridge from the public barrel.

1. `src/index.ts` SHALL re-export `mergeGlossaries`, `loadEnforcementGlossary`, and
   the `EnforcementGlossary` result type — merged into the existing re-export block
   (no new `export` statement; barrel budget preserved).

### REQ-4: Phase instruction wiring

**User Story:** As a Forge user with the PMS pack enabled, I want `runGlossaryCheck`
to actually enforce pack glossary terms, so a conflicting usage of "Reservation" is
caught, not just advisory-noted.

1. THE phase instructions / function-contracts that describe the `glossary` input to
   `runGlossaryCheck` SHALL be updated to source it from `loadEnforcementGlossary`
   (flat + enabled pack) instead of the flat file alone.
2. Affected phases: spec, decide, plan, grill, build, review (every phase that calls
   `runGlossaryCheck`).
3. THE wiring SHALL preserve the **flat write-sovereignty**: pack terms are
   read-only supplements; the flat `.forge/glossary.md` remains the only file
   `runGlossaryCheck` / `learn` ever writes back to.
4. WHEN no pack is enabled, behavior SHALL be byte-identical to pre-slice-C
   (Zero-Pack — INV-1).

### REQ-5: Zero-Pack invariance verification

**User Story:** As a project without any pack, I want proof the enforcement path is
unchanged.

1. THE existing glossary-hook / registry tests SHALL continue to pass unchanged.
2. A new `test/glossary/enforcement-zero-pack.test.ts` SHALL assert that
   `loadEnforcementGlossary` + `mergeGlossaries` with no enabled pack returns the
   flat glossary unchanged (`packTermCount: 0`, identity), performing zero pack-file
   reads (counting fs).

## Invariants (INV)

- **INV-1 (Zero-Pack-Zero-Impact)**: no enabled pack → enforcement glossary is the
  flat glossary byte-for-byte; no pack file read; `runGlossaryCheck` behavior
  identical to pre-slice-C.
- **INV-2 (Emits to dist)**: new modules are production `src/`, emit to dist, covered
  by `npm run check` / typedoc / `tsc -p tsconfig.build.json`.
- **INV-3 (Pure + injected fs)**: `mergeGlossaries` is pure; `loadEnforcementGlossary`
  composes existing loaders with injected fs; no `node:fs` direct import.
- **INV-4 (Backward compat)**: flat `.forge/glossary.md` stays the write-sovereignty
  source and enforcement baseline; existing conflict records / advisories remain valid.
- **INV-5 (Flat sovereignty)**: pack terms are NEVER written back to
  `.forge/glossary.md`; on name/alias collision, the flat definition wins (pack does
  not override). `packTermCount` counts only genuinely-appended (non-covered) terms.

## Out of Scope

- Migrating the flat `.forge/glossary.md` to the layered model (flat stays primary).
- Auto-promoting high-frequency pack terms into the flat file (a future `/forge learn`
  enhancement).
- Context / state-machine enforcement (this slice is glossary-only; contexts/state-
  machines remain advisory per slice B).
- The remaining 7 PMS bounded-context reference aggregates (separate batch).
