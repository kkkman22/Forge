---
feature: domain-knowledge-threading
layout: design
created: 2026-06-29
---

# Design — Domain Knowledge Threading (Slice B)

## Overview

The entire pack stack (`loadPackRegistry` → `parseEnabledPacks` → `EnabledPacks`
→ `loadContexts` / `loadGlossary` / `resolvePath`) is already implemented and
unit-tested but **never called from production**. R4.5.5's plural
`loadStateMachineDefinitions` is documented as unimplemented
(`atomic-task-format.md:149-152`). This slice adds the "last mile":

```
┌──────────────────────────────────────────────────────────────────┐
│  skills/forge/lib/{decide,plan,build,review}/instructions.md     │
│        "Domain Knowledge Injection" subsection (REQ-5)            │
└───────────────┬──────────────────────────────────────────────────┘
                │ calls (via src/index.ts barrel)
                ▼
┌──────────────────────────────────────────────────────────────────┐
│  composeDomainKnowledgeBundle (REQ-4)  ← src/pack/domain-bundle.ts│
└──────┬───────────────┬───────────────────────────┬───────────────┘
       │               │                           │
       ▼               ▼                           ▼
 loadContexts    loadGlossary          loadStateMachineDefinitions (R4.5.5)
 (existing)      (existing)            ← src/state-machine/registry.ts (NEW)
       │               │                           │
       └───────────────┴───────────┬───────────────┘
                                   ▼
                          loadEnabledPacks (REQ-1)
                          ← src/pack/runtime.ts (NEW)
                                   │
                     composes loadPackRegistry + parseEnabledPacks (existing)
                                   │
                          reads .forge/config.md
```

## Components and Interfaces

### Component 1: `src/pack/runtime.ts` (REQ-1)

Runtime loader turning `.forge/config.md` into a validated `EnabledPacks`.

```ts
import path from "node:path";
import type { EnabledPacks, FileSystem } from "./types.js";
import { loadPackRegistry } from "./loader.js";
import { parseEnabledPacks } from "./config.js";

export interface LoadEnabledPacksResult {
  enabled: EnabledPacks;
  errors: string[];
  warnings: string[];
}

/**
 * Read .forge/config.md, discover packs, and return validated EnabledPacks.
 * Composes the existing pure functions loadPackRegistry + parseEnabledPacks.
 * @example
 * const { enabled, errors } = await loadEnabledPacks(rootDir, realFs);
 */
export async function loadEnabledPacks(
  rootDir: string,
  fs: FileSystem,
): Promise<LoadEnabledPacksResult> {
  const warnings: string[] = [];
  const customLayerRoot = path.join(rootDir, ".forge", "custom");

  const configPath = path.join(rootDir, ".forge", "config.md");
  let configContent: string;
  try {
    configContent = await fs.readFile(configPath);
  } catch (_err: unknown) {
    return {
      enabled: { order: [], entries: [], customLayerRoot },
      errors: [],
      warnings: [`.forge/config.md not found at ${configPath}`],
    };
  }

  const registry = await loadPackRegistry(rootDir, fs);
  warnings.push(...registry.warnings);

  const { enabled, errors } = parseEnabledPacks(configContent, registry, customLayerRoot);
  return { enabled, errors, warnings };
}
```

**Design notes**:
- No `node:fs` import — `fs` injected (INV-3). The real-fs adapter is the one
  already used by `loadPackRegistry`'s callers in tests.
- Missing config.md → warning (non-fatal), empty enabled. Matches "repo may not
  be Forge-initialized" reality.
- `registry.warnings` (duplicate packs, parse errors) bubble up.

### Component 2: `src/state-machine/registry.ts` (REQ-2, R4.5.5)

The missing pack-aware plural loader.

```ts
import type { EnabledPacks, FileSystem } from "../pack/types.js";
import type { StateMachineDefinition } from "./types.js";
import { loadStateMachineDefinition } from "./loader.js";
import { validateDefinition } from "./validator.js";

export interface LoadedStateMachine {
  definition: StateMachineDefinition;
  sourcePath: string;
  sourceLayer: string; // "pack:<name>"
}

export interface LoadStateMachineDefinitionsResult {
  machines: LoadedStateMachine[];
  errors: string[];
}

/**
 * Load all *.yaml state-machine definitions from enabled packs.
 * Validates each; collects errors instead of throwing (graceful degrade).
 * Empty enabledPacks.order → empty result (Zero-Pack-Zero-Impact).
 */
export async function loadStateMachineDefinitions(
  enabledPacks: EnabledPacks,
  fs: FileSystem,
): Promise<LoadStateMachineDefinitionsResult> {
  const machines: LoadedStateMachine[] = [];
  const errors: string[] = [];

  for (const entry of enabledPacks.entries) {
    const dir = entry.extends.state_machines;
    if (!dir) continue; // no state_machines category — skip, not an error

    let files: string[];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".yaml")).sort();
    } catch (_err: unknown) {
      continue; // unreadable dir — skip
    }

    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const content = await fs.readFile(filePath);
        const definition = loadStateMachineDefinition(content, filePath);
        const report = validateDefinition(definition);
        if (!report.valid) {
          errors.push(
            `state-machine ${filePath}: ${report.errors.map((e) => e.message).join("; ")}`,
          );
          continue;
        }
        machines.push({ definition, sourcePath: filePath, sourceLayer: `pack:${entry.name}` });
      } catch (err: unknown) {
        errors.push(
          `state-machine ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return { machines, errors };
}
```

**Design notes**:
- Reuses the singular `loadStateMachineDefinition` + `validateDefinition` —
  no new parsing logic (INV-3, compose existing).
- Empty `order` → loop body never executes → empty result (Zero-Pack).
- `state_machines` absent on a pack entry → `dir` undefined → `continue`.

### Component 3: `src/pack/domain-bundle.ts` (REQ-4)

Single-call composer flattening the three registries into arrays.

```ts
import type { ContextEntry, FileSystem, GlossaryEntry } from "./types.js";
import type { LoadedStateMachine } from "../state-machine/registry.js";
import type { EnabledPacks } from "./types.js";
import { loadContexts } from "../context/registry.js";
import { loadGlossary } from "../glossary/registry.js";
import { loadStateMachineDefinitions } from "../state-machine/registry.js";

export interface DomainKnowledgeBundle {
  contexts: ContextEntry[];
  glossaryTerms: GlossaryEntry[];
  stateMachines: LoadedStateMachine[];
  enabledPackNames: string[];
  empty: boolean;
}

export async function composeDomainKnowledgeBundle(
  enabledPacks: EnabledPacks,
  fs: FileSystem,
): Promise<DomainKnowledgeBundle> {
  if (enabledPacks.order.length === 0) {
    return {
      contexts: [],
      glossaryTerms: [],
      stateMachines: [],
      enabledPackNames: [],
      empty: true,
    };
  }

  const [contextRegistry, glossaryRegistry, smResult] = await Promise.all([
    loadContexts(enabledPacks, fs),
    loadGlossary(enabledPacks, fs),
    loadStateMachineDefinitions(enabledPacks, fs),
  ]);

  return {
    contexts: [...contextRegistry.contexts.values()],
    glossaryTerms: [...glossaryRegistry.entries.values()],
    stateMachines: smResult.machines,
    enabledPackNames: enabledPacks.order,
    empty: false,
  };
}
```

**Design notes**:
- Empty-order fast no-op returns BEFORE any `load*` call → zero file reads
  (INV-1, verified by T5 counting-fs test).
- `Promise.all` — the three loaders are independent.

### Component 4: Public API (REQ-3)

`src/index.ts` additions and `src/state-machine/index.ts` re-export.

`src/state-machine/index.ts`:
```ts
export { loadStateMachineDefinitions } from "./registry.js";
export type { LoadedStateMachine, LoadStateMachineDefinitionsResult } from "./registry.js";
```

`src/index.ts` (append to existing exports):
```ts
export { loadEnabledPacks } from "./pack/runtime.js";
export type { LoadEnabledPacksResult } from "./pack/runtime.js";
export { composeDomainKnowledgeBundle } from "./pack/domain-bundle.js";
export type { DomainKnowledgeBundle } from "./pack/domain-bundle.js";
export { loadContexts } from "./context/registry.js";
export { loadGlossary } from "./glossary/registry.js";
export { loadStateMachineDefinitions } from "./state-machine/index.js";
export type { LoadedStateMachine } from "./state-machine/index.js";
```

### Component 5: Phase instruction integration (REQ-5)

A canonical **"Domain Knowledge Injection"** subsection added to all four
`skills/forge/lib/{decide,plan,build,review}/instructions.md`. Shared body:

```markdown
### Domain Knowledge Injection

At phase entry, resolve enabled domain packs and inject a structured summary
so phase output reflects the active domain rather than generic guidance.

1. Call `loadEnabledPacks(rootDir, fs)` (from `src/index.ts`).
2. IF `enabled.order.length === 0` → skip this subsection entirely (Zero-Pack;
   current behavior preserved).
3. ELSE call `composeDomainKnowledgeBundle(enabled, fs)` and inject a compact
   summary into working context:
   - **Contexts**: name + responsibility (one line each), from `bundle.contexts`.
   - **Glossary terms**: term list (with aliases), from `bundle.glossaryTerms`.
     These are ADVISORY only — enforcement still runs through `runGlossaryCheck`
     against `.forge/glossary.md`.
   - **State machines**: name + transition count, from `bundle.stateMachines`,
     with each machine's `sourcePath` so the agent can Read the YAML on demand.
4. Inject the SUMMARY, never full file bodies. The agent reads full files via
   the provided paths only when a task requires detail.
```

**Plan-only addition (R4.5.5)** — appended to the plan instruction's subsection:

```markdown
**State-Machine-aware Task Breakdown (R4.5.5)**: during Step 3 Task Breakdown,
when a planned task's `files` touch a module whose path matches a loaded
`LoadedStateMachine` (matching convention: the task file path contains the
machine name as a segment, e.g. `reservation` in `src/domain/reservation/`),
the task step MUST:
  - reference the machine's real transitions/invariants (Read the `sourcePath`);
  - NOT invent transitions absent from the YAML.
When no machine matches, Task Breakdown proceeds as today.
```

**`atomic-task-format.md:149-152` update**: replace the "未实现" exception note
with a note that `loadStateMachineDefinitions(enabledPacks)` now exists (plural,
pack-aware) and the R4.5 integration-test requirement applies to the
`packs/<name>/state-machines/` prefix.

## Edge Cases

| Case | Handling |
|------|----------|
| `.forge/config.md` missing | `loadEnabledPacks` returns warning + empty enabled |
| `packs:` field absent | empty enabled, no errors (Zero-Pack) |
| Declared pack not in registry | error lists available packs (existing parseEnabledPacks) |
| Pack dir unreadable | registry.warnings bubbles; pack skipped |
| Malformed state-machine YAML | collected into `errors[]`, not thrown |
| Pack has no `state_machines` extends | skipped, not an error |
| Empty enabled order | bundle composer fast no-op, zero reads |

## State-machine ↔ task matching convention (R4.5.5)

The plan-time match between a task's `files` and a `LoadedStateMachine` uses a
**path-segment convention**: if any task file path contains the machine's
`definition.name` (e.g. `reservation`, `folio`, `room-status`) as a path
segment or substring, the task is considered state-driven and R4.5.5 applies.
This is intentionally simple and conservative (prefers false-negatives over
false-positives) — a missed match just means plan proceeds as today. The pack's
`mutation_critical_modules` globs are an additional signal but not required
(mutation wiring is out of scope per Out-of-Scope).
