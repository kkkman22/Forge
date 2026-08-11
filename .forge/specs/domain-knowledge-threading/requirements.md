---
status: locked
feature: domain-knowledge-threading
layout: requirements
created: 2026-06-29
tier: full
spec_ref: ".forge/decisions/2026-06-27-domain-example-reference-impl.md §7 (slice B)"
---

# Requirements — Domain Knowledge Threading (Slice B)

## Introduction

Slice B closes the loop on a foundational gap: Forge's pack system (`src/pack/`,
`src/context/`, `src/state-machine/`, `src/glossary/`) is a **complete but
unwired** library. Every loader function (`loadPackRegistry`,
`parseEnabledPacks`, `loadContexts`, `loadGlossary`, `loadStateMachineDefinition`)
is defined and unit-tested, but **no runtime path reads `.forge/config.md`'s
`packs:` field and no decide/plan/build/review phase skill consumes any of it.**
The glossary check still reads the flat `.forge/glossary.md`; `src/index.ts`
exports none of the pack machinery; R4.5.5 (`/forge plan` consumes state-machines)
is the documented unfinished seam (`atomic-task-format.md:149-152`).

This spec delivers the **last mile of wiring**: a runtime loader, the missing
pack-aware state-machine loader (R4.5.5), public API exports, a bundle composer,
and integration points in the four phase instructions — so an enabled PMS pack
actually shapes decide/plan/build/review, with Zero-Pack-Zero-Impact preserved.

Source decision: `.forge/decisions/2026-06-27-domain-example-reference-impl.md`
§7 (slice B) + §5 (state-machine 角色). User confirmed scope: full-stack wiring
(2026-06-29).

## Glossary

- **Enabled_Packs**: the resolved, validated set of packs a project has turned
  on, read from `.forge/config.md` frontmatter `packs:` field. Represented by
  the `EnabledPacks` type (`src/pack/types.ts`).
- **Zero-Pack-Zero-Impact**: invariant — when no pack is enabled, Forge's
  behavior is byte-identical to today (no pack data injected, no errors). The
  flat `.forge/glossary.md` remains the sole glossary source when `packs:` is
  empty. Existing `test/pack/zero-pack-invariant.test.ts` guards this.
- **Domain_Knowledge_Bundle**: the aggregate of contexts + glossary +
  state-machine definitions resolved from `EnabledPacks` at runtime, ready to
  inject into a phase prompt.
- **loadStateMachineDefinitions (plural)**: the **missing** pack-aware loader
  declared by pms-pack-v1 R4.5 (`atomic-task-format.md:149`). Reads every
  `*.yaml` under each enabled pack's `state_machines` directory, returning
  validated `StateMachineDefinition[]`. Distinct from the existing singular
  `loadStateMachineDefinition(yamlContent, filePath)` which loads one YAML
  string.

## Requirements

### REQ-1: Runtime enabled-packs loader

**User Story:** As the Forge runtime, I want a single function that reads
`.forge/config.md` from disk, discovers packs, and returns a validated
`EnabledPacks`, so phases do not each re-implement the discovery chain.

1. THE module `src/pack/runtime.ts` SHALL expose
   `loadEnabledPacks(rootDir, fs): Promise<{ enabled: EnabledPacks; errors: string[]; warnings: string[] }>`.
2. `loadEnabledPacks` SHALL compose the existing pure functions:
   `loadPackRegistry(rootDir, fs)` → `parseEnabledPacks(configContent, registry, customLayerRoot)`.
   It SHALL read `.forge/config.md` via the injected `FileSystem`.
3. WHEN `.forge/config.md` has no `packs:` field, `loadEnabledPacks` SHALL
   return `enabled.order = []` with empty errors (Zero-Pack path).
4. WHEN `.forge/config.md` is absent entirely, `loadEnabledPacks` SHALL return
   empty enabled + a warning (non-fatal; the repo may not be Forge-initialized).
5. WHEN a declared pack name is not in the registry, the error string SHALL
   list available packs (delegated to existing `parseEnabledPacks` behavior).
6. `customLayerRoot` SHALL resolve to `<rootDir>/.forge/custom`.
7. THE function SHALL be pure with respect to `fs` (injectable `FileSystem`),
   matching the testing pattern of `loadPackRegistry`.

### REQ-2: Pack-aware state-machine loader (R4.5.5)

**User Story:** As `/forge plan`, I want to load every state-machine definition
from enabled packs in one call, so plan tasks that touch a state-driven module
can reference the real transitions/invariants instead of guessing.

1. THE module `src/state-machine/registry.ts` SHALL expose
   `loadStateMachineDefinitions(enabledPacks, fs): Promise<{ machines: LoadedStateMachine[]; errors: string[] }>`
   where `LoadedStateMachine = { definition: StateMachineDefinition; sourcePath: string; sourceLayer: string }`.
2. `loadStateMachineDefinitions` SHALL iterate each enabled pack entry, read
   `entry.extends.state_machines` (absolute dir from the already-resolved
   `PackEntry.extends`), and parse every `*.yaml` file via the existing singular
   `loadStateMachineDefinition(content, filePath)`.
3. EACH loaded definition SHALL be validated via `validateDefinition(definition)`;
   validation errors SHALL be collected into the returned `errors: string[]`
   rather than thrown (a malformed pack YAML degrades gracefully).
4. WHEN `enabledPacks.order` is empty, the function SHALL return an empty list
   with empty errors (Zero-Pack-Zero-Impact).
5. WHEN a pack entry has no `state_machines` extends category, it SHALL be
   skipped (not an error).
6. THE module SHALL be re-exported from `src/state-machine/index.ts` alongside
   the existing singular loader.

### REQ-3: Public API exports

**User Story:** As a phase skill driver, I want to import the wiring functions
from the public barrel `src/index.ts`, so skill instructions can name a stable
entry point.

1. `src/index.ts` SHALL re-export: `loadEnabledPacks`, `loadContexts`,
   `loadStateMachineDefinitions`, and the `LoadedStateMachine` type.
2. `loadGlossary` SHALL additionally be re-exported (it is currently private to
   its module). The flat-file glossary path used by `runGlossaryCheck` is
   unchanged in this slice (see REQ-6 scope note).
3. `composeDomainKnowledgeBundle` and the `DomainKnowledgeBundle` type (REQ-4)
   SHALL be re-exported.

### REQ-4: Domain knowledge bundle composer

**User Story:** As a phase skill, I want one function that produces a compact,
injectable bundle from enabled packs, so I do not have to call three loaders
and merge by hand.

1. THE module `src/pack/domain-bundle.ts` SHALL expose
   `composeDomainKnowledgeBundle(enabledPacks, fs): Promise<DomainKnowledgeBundle>`.
2. `DomainKnowledgeBundle` SHALL contain: `contexts: ContextEntry[]`,
   `glossaryTerms: GlossaryEntry[]`, `stateMachines: LoadedStateMachine[]`,
   `enabledPackNames: string[]`, and `empty: boolean` (true when no pack
   enabled → caller skips injection).
3. THE composer SHALL call `loadContexts`, `loadGlossary`, and
   `loadStateMachineDefinitions` and flatten their registry outputs into arrays.
4. WHEN `enabledPacks.order` is empty, the composer SHALL return
   `{ empty: true, ... }` without reading any pack files (fast no-op).

### REQ-5: Phase instruction integration — decide / plan / build / review

**User Story:** As a Forge user with the PMS pack enabled, I want decide/plan/
build/review to actually see my domain's contexts, glossary, and state machines,
so their output reflects my domain rather than generic guidance.

1. EACH of the four phase instructions
   (`skills/forge/lib/{decide,plan,build,review}/instructions.md`) SHALL gain
   a **"Domain Knowledge Injection"** subsection that instructs the skill
   driver to:
   a. call `loadEnabledPacks(rootDir, fs)` at phase entry;
   b. when `enabled.order.length > 0`, call `composeDomainKnowledgeBundle`;
   c. inject a compact, structured summary of the bundle (context names +
      responsibilities, glossary term list, state-machine names + transition
      counts) into the phase's working context — NOT full file bodies (the
      agent reads files on demand via the provided paths);
   d. when `enabled.order.length === 0`, skip injection entirely (current
      behavior preserved).
2. THE plan instruction's new subsection SHALL additionally implement R4.5.5:
   during **Task Breakdown (Step 3)**, when a planned task's `files` touch a
   module path matching a loaded `LoadedStateMachine` (matched by convention —
   see design), the plan SHALL emit a task step referencing the relevant
   transitions/invariants, and SHALL NOT invent transitions absent from the
   YAML.
3. THE injection SHALL be additive and non-breaking: existing plans/specs/decisions
   written before this slice remain valid; the injection only adds context when
   a pack is enabled.
4. THE `atomic-task-format.md` "state-machines exception" note (lines 149-152)
   SHALL be updated to reflect that `loadStateMachineDefinitions` now exists,
   removing the "未实现" caveat.

### REQ-6: Glossary check bridge (scope-bounded)

**User Story:** As a reviewer, I want the glossary check to eventually see pack
glossary terms, but without destabilizing the current flat-file flow.

1. THIS slice SHALL NOT change `runGlossaryCheck`'s current input (the flat
   `.forge/glossary.md` via `glossary-driver.ts`). Bridging the layered
   `loadGlossary` into `runGlossaryCheck` is a **separate follow-up** (slice C)
   because it changes the check's semantics and risks false positives.
2. THIS slice SHALL only export `loadGlossary` (REQ-3) so the bridge is
   possible later, and the phase injection (REQ-5) surfaces pack glossary terms
   as advisory context (read-only summary), distinct from the enforcement
   performed by `runGlossaryCheck`.

### REQ-7: Zero-Pack-Zero-Impact verification

**User Story:** As a project without any pack enabled, I want ironclad proof
that this slice changed nothing about my workflow.

1. THE existing `test/pack/zero-pack-invariant.test.ts` SHALL continue to pass
   unchanged.
2. A new `test/pack/runtime-zero-pack.test.ts` SHALL assert that
   `loadEnabledPacks` + `composeDomainKnowledgeBundle` on a repo with no
   `packs:` field returns `empty: true` and performs zero pack-file reads
   (verified via a counting `FileSystem` stub).

## Invariants (INV)

- **INV-1 (Zero-Pack-Zero-Impact)**: A repo with no enabled pack observes
  byte-identical decide/plan/build/review behavior to pre-slice-B. No pack
  file is read; no injection occurs.
- **INV-2 (Emits to dist)**: `src/pack/runtime.ts`,
  `src/state-machine/registry.ts`, `src/pack/domain-bundle.ts` ARE production
  src/ modules (unlike slice A's `src/domain/`), so they DO emit to dist and
  ARE covered by `npm run check` / typedoc / `tsc -p tsconfig.build.json`.
  They must compile without the exclusions slice A needed.
- **INV-3 (Pure + injected fs)**: every new loader composes existing pure
  functions + injected `FileSystem`; no `node:fs` direct import in the loader
  bodies (the real-fs adapter lives in one place, matching `loadPackRegistry`'s
  pattern).
- **INV-4 (Backward compat)**: existing plans/decisions/specs/reviews authored
  before this slice remain valid; injection is purely additive.

## Out of Scope

- Bridging layered `loadGlossary` into `runGlossaryCheck` enforcement
  (slice C — REQ-6).
- Migrating `.forge/glossary.md` to the layered model (flat file stays the
  enforcement source).
- The remaining 7 PMS bounded contexts' reference code (slice A shipped only
  `reservations`; the other 7 are a later batch per decide §5).
- Banned-patterns / lint-rules / scenarios pack categories (they have loaders
  but are out of slice B's domain-knowledge-threading scope).
- Mutation testing wiring (mutation_critical_modules paths) — separate track.
