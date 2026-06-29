/**
 * Domain knowledge bundle composer (spec domain-knowledge-threading REQ-4).
 *
 * Phase skills (decide/plan/build/review) need the aggregate of a project's
 * enabled-pack domain knowledge — contexts, glossary, state machines — in a
 * single injectable shape. This composer calls the three existing loaders
 * (`loadContexts`, `loadGlossary`, `loadStateMachineDefinitions`) and flattens
 * their registry outputs into arrays, with a Zero-Pack fast no-op path.
 *
 * @module pack/domain-bundle
 */

import type { ContextEntry, EnabledPacks, FileSystem, GlossaryEntry } from "./types.js";
import { loadContexts } from "../context/registry.js";
import { loadGlossary } from "../glossary/registry.js";
import {
  loadStateMachineDefinitions,
  type LoadedStateMachine,
} from "../state-machine/registry.js";

/**
 * Flattened, injectable view of a project's enabled-pack domain knowledge.
 */
export interface DomainKnowledgeBundle {
  /** Bounded contexts from enabled packs (flattened from the registry map). */
  contexts: ContextEntry[];
  /** Glossary terms from enabled packs (advisory; enforcement stays on the
   * flat `.forge/glossary.md` — see spec REQ-6). */
  glossaryTerms: GlossaryEntry[];
  /** State-machine definitions from enabled packs (R4.5.5). */
  stateMachines: LoadedStateMachine[];
  /** Names of enabled packs, in declaration order. */
  enabledPackNames: string[];
  /** True when no pack is enabled → caller skips injection (Zero-Pack). */
  empty: boolean;
}

/**
 * Compose a {@link DomainKnowledgeBundle} from enabled packs.
 *
 * Calls `loadContexts`, `loadGlossary`, and `loadStateMachineDefinitions`
 * concurrently (`Promise.all`) and flattens their registry outputs into arrays.
 *
 * - Empty `enabledPacks.order` → returns `{ empty: true, ... }` **before** any
 *   loader runs, so zero pack files are read (Zero-Pack-Zero-Impact, INV-1).
 *
 * @param enabledPacks  Resolved enabled packs.
 * @param fs            Injected filesystem.
 * @returns The flattened domain knowledge bundle.
 *
 * @example
 * ```ts
 * const bundle = await composeDomainKnowledgeBundle(enabled, fs);
 * if (bundle.empty) return; // no pack — skip injection
 * for (const c of bundle.contexts) console.log(c.name, c.responsibility);
 * ```
 */
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
