/**
 * Enforcement glossary loader (spec glossary-enforcement-bridge REQ-2).
 *
 * The single-call loader a phase skill driver uses to produce the glossary fed to
 * `runGlossaryCheck`. Composes the flat (authoritative) glossary with enabled-pack
 * glossary terms via {@link mergeGlossaries}, so enforcement covers the full domain
 * vocabulary. Zero-Pack fast path: no enabled pack → flat glossary unchanged, zero
 * pack-file reads.
 *
 * **fs-contract note**: the flat driver `ensureGlossaryExists` uses a *sync* `GlossaryFs`,
 * while the pack loaders use an *async* `FileSystem`. To avoid an unsafe sync/async
 * cast, this loader reads the flat file via the async `fs`, parses with `parseGlossary`,
 * and only seeds (via `renderGlossary` + async `fs.writeFile`) when the file is absent.
 *
 * @module glossary/enforcement
 */

import path from "node:path";
import type { Glossary, GlossaryTerm } from "../glossary.js";
import { parseGlossary, renderGlossary } from "../glossary.js";
import { DEFAULT_GLOSSARY_PATH, INITIAL_GLOSSARY_TERMS } from "../glossary-driver.js";
import { loadEnabledPacks } from "../pack/runtime.js";
import type { FileSystem } from "../pack/types.js";
import { mergeGlossaries } from "./merge.js";
import { loadGlossary } from "./registry.js";

/**
 * Result of loading the enforcement glossary.
 */
export interface EnforcementGlossary {
  /** Merged glossary (flat + appended pack terms) — feed to `runGlossaryCheck`. */
  glossary: Glossary;
  /** Number of pack entries actually appended (post-merge, i.e. non-covered). */
  packTermCount: number;
  /** Non-fatal discovery warnings (missing config, unknown packs, etc.). */
  warnings: string[];
}

/**
 * Options for {@link loadEnforcementGlossary}.
 */
export interface LoadEnforcementGlossaryOptions {
  /** Override the flat glossary path (default `.tinkerman/glossary.md`). */
  glossaryPath?: string;
  /** Timestamp for the seed's `last_updated` / `updated` when seeding. */
  now?: Date;
}

/**
 * Load the enforcement glossary: flat `.tinkerman/glossary.md` (authoritative) merged
 * with enabled-pack glossary terms.
 *
 * - Flat is read (or seeded with the 12 core terms if absent) first.
 * - Enabled packs are resolved; when none, the flat glossary is returned unchanged
 *   with `packTermCount: 0` and zero pack-file reads (Zero-Pack-Zero-Impact).
 * - Otherwise pack glossary entries are merged (flat wins on collision).
 *
 * @param rootDir  Absolute repository root.
 * @param fs       Injected filesystem.
 * @param options  Optional path/timestamp overrides.
 * @returns The merged enforcement glossary + counts + warnings.
 *
 * @example
 * ```ts
 * const { glossary } = await loadEnforcementGlossary(rootDir, fs);
 * const result = runGlossaryCheck({ phase: "plan", glossary, ... });
 * ```
 */
export async function loadEnforcementGlossary(
  rootDir: string,
  fs: FileSystem,
  options: LoadEnforcementGlossaryOptions = {},
): Promise<EnforcementGlossary> {
  const warnings: string[] = [];
  const glossaryPath = options.glossaryPath
    ? path.resolve(rootDir, options.glossaryPath)
    : path.join(rootDir, DEFAULT_GLOSSARY_PATH);

  // 1. Flat glossary (authoritative) — async read; seed only if absent.
  const flat = await loadOrSeedFlat(fs, glossaryPath, options.now);

  // 2. Enabled packs (Zero-Pack fast path).
  const { enabled, warnings: epWarnings } = await loadEnabledPacks(rootDir, fs);
  warnings.push(...epWarnings);
  if (enabled.order.length === 0) {
    return { glossary: flat, packTermCount: 0, warnings };
  }

  // 3. Pack glossary + merge.
  //    Note: loadGlossary returns a GlossaryRegistry ({entries, byTerm}) with no
  //    warnings channel — malformed pack glossary files are silently skipped by it.
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

/**
 * Read the flat glossary via async `fs`; seed it with the core terms if absent.
 * Mirrors `ensureGlossaryExists` semantics but on the async `FileSystem` contract.
 */
async function loadOrSeedFlat(
  fs: FileSystem,
  glossaryPath: string,
  now: Date | undefined,
): Promise<Glossary> {
  const exists = await fs.exists(glossaryPath);
  if (exists) {
    return parseGlossary(await fs.readFile(glossaryPath));
  }

  const stamp = (now ?? new Date()).toISOString().slice(0, 10);
  const terms: GlossaryTerm[] = INITIAL_GLOSSARY_TERMS.map((t) => ({
    ...t,
    last_updated: stamp,
  }));
  const seeded: Glossary = { schema_version: 1, updated: stamp, terms };
  await fs.writeFile(glossaryPath, renderGlossary(seeded));
  return seeded;
}
