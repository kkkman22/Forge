/**
 * Runtime enabled-packs loader (spec domain-knowledge-threading REQ-1).
 *
 * The pack discovery chain (`loadPackRegistry` → `parseEnabledPacks`) exists as
 * pure functions but had **no production caller that reads `.tinkerman/config.md`
 * from disk**. This module is that caller — it composes the two pure functions
 * behind a single injectable-`FileSystem` entry point so phase skills can
 * resolve the project's enabled packs in one call.
 *
 * @module pack/runtime
 */

import path from "node:path";
import { parseEnabledPacks } from "./config.js";
import { loadPackRegistry } from "./loader.js";
import type { EnabledPacks, FileSystem } from "./types.js";

/**
 * Result of loading enabled packs from a project's `.tinkerman/config.md`.
 */
export interface LoadEnabledPacksResult {
  /** Resolved, validated enabled packs (empty when none configured). */
  enabled: EnabledPacks;
  /** Validation errors (e.g. declared pack not in registry). Non-fatal. */
  errors: string[];
  /** Discovery warnings (missing config, duplicate packs, parse issues). */
  warnings: string[];
}

/**
 * Read `.tinkerman/config.md`, discover packs, and return a validated
 * {@link EnabledPacks}.
 *
 * Composes the existing pure functions {@link loadPackRegistry} +
 * {@link parseEnabledPacks}. `customLayerRoot` resolves to
 * `<rootDir>/.tinkerman/custom`.
 *
 * Behavior:
 * - `.tinkerman/config.md` absent → warning + empty enabled (non-fatal; the repo
 *   may not be Forge-initialized).
 * - `packs:` field absent → empty enabled, no errors (Zero-Pack path).
 * - Declared pack not in registry → error lists available packs (delegated to
 *   `parseEnabledPacks`).
 * - Registry warnings (duplicate packs, manifest parse errors) bubble up.
 *
 * @param rootDir  Absolute repository root.
 * @param fs       Injected filesystem (no `node:fs` direct import — INV-3).
 * @returns Enabled packs with any errors/warnings.
 *
 * @example
 * ```ts
 * const { enabled, errors } = await loadEnabledPacks(rootDir, realFs);
 * if (errors.length > 0) console.error(errors);
 * for (const name of enabled.order) console.log(name);
 * ```
 */
export async function loadEnabledPacks(
  rootDir: string,
  fs: FileSystem,
): Promise<LoadEnabledPacksResult> {
  const warnings: string[] = [];
  const customLayerRoot = path.join(rootDir, ".tinkerman", "custom");

  const configPath = path.join(rootDir, ".tinkerman", "config.md");
  let configContent: string;
  try {
    configContent = await fs.readFile(configPath);
  } catch (_err: unknown) {
    return {
      enabled: { order: [], entries: [], customLayerRoot },
      errors: [],
      warnings: [`.tinkerman/config.md not found at ${configPath}`],
    };
  }

  const registry = await loadPackRegistry(rootDir, fs);
  warnings.push(...registry.warnings);

  const { enabled, errors } = parseEnabledPacks(configContent, registry, customLayerRoot);
  return { enabled, errors, warnings };
}
