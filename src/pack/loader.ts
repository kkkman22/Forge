/**
 * Pack loader - scans packs/<name>/pack.yaml and builds an in-memory PackRegistry.
 *
 * Pure function with injected FileSystem for testability. Failed packs go into
 * warnings, never throw (honors Zero_Pack_Invariant).
 *
 * Validates: R1.1-1.6 Pack discovery and manifest parsing
 */

import path from "node:path";
import { parse as parseYaml } from "yaml";
import { isWithinBase } from "./resolver.js";
import type { FileSystem, PackEntry, PackManifest, PackRegistry } from "./types.js";

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

/** Required fields in pack.yaml. */
const REQUIRED_FIELDS: Array<keyof PackManifest> = [
  "name",
  "display_name",
  "description",
  "forge_min_version",
  "extends",
];

/** Kebab-case pattern. */
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Validate a parsed manifest has all required fields with correct types.
 * Returns an array of error strings (empty = valid).
 */
export function validateManifest(raw: Record<string, unknown>): string[] {
  const errors: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    if (raw[field] === undefined || raw[field] === null) {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (raw.name !== undefined && typeof raw.name === "string") {
    if (!KEBAB_RE.test(raw.name)) {
      errors.push("name must be kebab-case (lowercase, digits, hyphens)");
    }
  }

  if (raw.extends !== undefined && typeof raw.extends !== "object") {
    errors.push("extends must be an object");
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Pack loading
// ---------------------------------------------------------------------------

/**
 * Scan packs/<name>/pack.yaml and build an in-memory PackRegistry.
 *
 * @param reposRoot - Absolute path to repository root
 * @param fs - Injected filesystem interface
 * @returns PackRegistry with discovered packs and warnings
 *
 * @example
 * ```ts
 * const registry = await loadPackRegistry("/my/repo", realFs);
 * for (const [name, entry] of registry.packs) {
 *   console.log(name, entry.displayName);
 * }
 * ```
 */
export async function loadPackRegistry(reposRoot: string, fs: FileSystem): Promise<PackRegistry> {
  const packsDir = path.join(reposRoot, "packs");
  const packs = new Map<string, PackEntry>();
  const warnings: string[] = [];

  let subdirs: string[];
  try {
    subdirs = (await fs.readdir(packsDir)).sort();
  } catch (_err: unknown) {
    return { packs, warnings };
  }

  for (const dir of subdirs) {
    const manifestPath = path.join(packsDir, dir, "pack.yaml");
    const rootPath = path.join(packsDir, dir);

    let content: string;
    try {
      content = await fs.readFile(manifestPath);
    } catch (_: unknown) {
      continue;
    }

    let raw: Record<string, unknown>;
    try {
      raw = parseYaml(content) as Record<string, unknown>;
      if (raw === null || typeof raw !== "object") {
        throw new Error("parsed value is not an object");
      }
    } catch (err) {
      warnings.push(
        `pack: ${dir} invalid manifest — parse error: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    const validationErrors = validateManifest(raw);
    if (validationErrors.length > 0) {
      warnings.push(`pack: ${dir} invalid manifest — ${validationErrors.join("; ")}`);
      continue;
    }

    const manifest = raw as unknown as PackManifest;
    const name = manifest.name;

    if (packs.has(name)) {
      const existing = packs.get(name);
      warnings.push(
        `pack: ${name} duplicate — keeping ${existing ? path.basename(existing.rootPath) : "first"}, ignoring ${dir}`,
      );
      continue;
    }

    const resolvedExtends: Record<string, string> = {};
    if (manifest.extends && typeof manifest.extends === "object") {
      for (const [cat, relPath] of Object.entries(manifest.extends)) {
        if (typeof relPath === "string") {
          const resolved = path.resolve(rootPath, relPath);
          // Path-traversal guard: a pack's extends.* category must stay within
          // the pack's own rootPath. A malicious pack.yaml cannot point
          // state_machines/contexts/glossary at ../../etc — such a category is
          // dropped and a warning is recorded (does not throw; Zero_Pack safety).
          if (!isWithinBase(resolved, rootPath)) {
            warnings.push(
              `pack: ${name} extends.${cat} path "${relPath}" escapes pack root — skipped (path traversal blocked)`,
            );
            continue;
          }
          resolvedExtends[cat] = resolved;
        }
      }
    }

    const entry: PackEntry = {
      name,
      displayName: manifest.display_name,
      description: manifest.description,
      forgeMinVersion: manifest.forge_min_version,
      dependsOn: manifest.depends_on ?? [],
      extends: resolvedExtends,
      featureFlags: (manifest.feature_flags as Record<string, unknown>) ?? {},
      manifestPath,
      rootPath,
    };

    packs.set(name, entry);
  }

  return { packs, warnings };
}
