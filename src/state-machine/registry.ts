/**
 * Pack-aware state-machine registry loader (pms-pack-v1 R4.5.5).
 *
 * The singular {@link loadStateMachineDefinition} loads one YAML string. R4.5.5
 * requires a **plural, pack-aware** loader that reads every `*.yaml` under
 * each enabled pack's `state_machines` extends directory in one call, so
 * `/forge plan` (and other phases) can reference the real
 * transitions/invariants of state-driven modules. This is that loader — the
 * seam previously documented as "未实现" in
 * `skills/forge/lib/plan/references/atomic-task-format.md`.
 *
 * **Module independence**: the state-machine module stays pack-agnostic. This
 * loader defines structurally-compatible local input types rather than
 * importing from `src/pack/types.ts`, so the state-machine project compiles
 * standalone (it does not pull in the pack layer). The real `EnabledPacks` /
 * `FileSystem` from `src/pack/types.ts` satisfy these contracts structurally.
 *
 * @module state-machine/registry
 */

import path from "node:path";
import { loadStateMachineDefinition } from "./loader.js";
import type { StateMachineDefinition } from "./types.js";
import { validateDefinition } from "./validator.js";

/**
 * Minimal filesystem contract this loader needs (structurally compatible with
 * `FileSystem` from `src/pack/types.ts`). Defined locally to keep the
 * state-machine module pack-agnostic. Exported so typedoc can document the
 * function signature that references it.
 */
export interface RegistryFileSystem {
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
}

/**
 * Minimal view of a pack entry this loader reads. Structurally compatible with
 * the `PackEntry.extends` shape from `src/pack/types.ts`.
 */
export interface RegistryPackEntry {
  name: string;
  extends: { state_machines?: string };
}

/**
 * Minimal enabled-packs contract this loader needs (structurally compatible
 * with `EnabledPacks` from `src/pack/types.ts`).
 */
export interface RegistryEnabledPacks {
  order: string[];
  entries: RegistryPackEntry[];
}

/**
 * A state-machine definition loaded from an enabled pack, with provenance.
 */
export interface LoadedStateMachine {
  /** Parsed, validated definition. */
  definition: StateMachineDefinition;
  /** Absolute path to the source YAML file. */
  sourcePath: string;
  /** Layer the definition came from, e.g. `pack:pms`. */
  sourceLayer: string;
}

/**
 * Result of loading state-machine definitions from enabled packs.
 */
export interface LoadStateMachineDefinitionsResult {
  /** All successfully parsed + validated definitions. */
  machines: LoadedStateMachine[];
  /** Validation/parse errors (malformed YAML degrades gracefully, not thrown). */
  errors: string[];
}

/**
 * Load all `*.yaml` state-machine definitions from enabled packs.
 *
 * For each enabled pack entry with an `extends.state_machines` directory,
 * reads every `*.yaml` file (sorted), parses it via the singular
 * {@link loadStateMachineDefinition}, and validates it via
 * {@link validateDefinition}. Malformed files are collected into `errors`
 * rather than thrown (a broken pack YAML degrades gracefully).
 *
 * - Empty `enabledPacks.order` → empty result (Zero-Pack-Zero-Impact).
 * - Pack entry without `state_machines` extends → skipped (not an error).
 *
 * @param enabledPacks  Resolved enabled packs.
 * @param fs            Injected filesystem (no `node:fs` direct import — INV-3).
 * @returns Loaded machines with any errors.
 *
 * @example
 * ```ts
 * const { machines, errors } = await loadStateMachineDefinitions(enabled, fs);
 * if (errors.length > 0) console.warn(errors);
 * for (const m of machines) console.log(m.definition.name, m.sourcePath);
 * ```
 */
export async function loadStateMachineDefinitions(
  enabledPacks: RegistryEnabledPacks,
  fs: RegistryFileSystem,
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
      continue; // unreadable dir — skip silently
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
        machines.push({
          definition,
          sourcePath: filePath,
          sourceLayer: `pack:${entry.name}`,
        });
      } catch (err: unknown) {
        errors.push(
          `state-machine ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return { machines, errors };
}
