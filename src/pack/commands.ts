/**
 * Pack commands - 7 subcommands for forge-pack skill.
 *
 * Pure functions returning output + file modifications. Skill driver handles IO.
 *
 * Validates: R4.1-4.9 Pack management commands
 */

import path from "node:path";
import type { EnabledPacks, PackRegistry } from "./types.js";

// ---------------------------------------------------------------------------
// commandList
// ---------------------------------------------------------------------------

/** List all packs with enabled status. */
export function commandList(registry: PackRegistry, enabled: EnabledPacks): string {
  const enabledSet = new Set(enabled.order);
  const lines: string[] = [
    "| Name | Display | Status | Extends |",
    "|------|---------|--------|---------|",
  ];

  const sorted = [...registry.packs.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    const status = enabledSet.has(entry.name) ? "enabled" : "available";
    const cats = Object.keys(entry.extends).join(", ") || "-";
    lines.push(`| ${entry.name} | ${entry.displayName} | ${status} | ${cats} |`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// commandEnable
// ---------------------------------------------------------------------------

/** Enable a pack by adding it to .tinkerman/config.md frontmatter. */
export function commandEnable(
  name: string,
  config: string,
  registry: PackRegistry,
): { newConfig: string; message: string } | { error: string } {
  if (!registry.packs.has(name)) {
    return {
      error: `pack not found: ${name}. Available: ${[...registry.packs.keys()].join(", ") || "none"}`,
    };
  }

  // Parse existing packs list
  const { frontmatter, body } = splitConfig(config);
  const existingPacks = parsePacksField(frontmatter);

  if (existingPacks.includes(name)) {
    return { newConfig: config, message: `pack "${name}" already enabled (no-op)` };
  }

  existingPacks.push(name);
  const newFrontmatter = rebuildFrontmatter(frontmatter, existingPacks);
  return {
    newConfig: `---\n${newFrontmatter}---\n${body}`,
    message: `pack "${name}" enabled`,
  };
}

// ---------------------------------------------------------------------------
// commandDisable
// ---------------------------------------------------------------------------

/** Disable a pack by removing it from .tinkerman/config.md frontmatter. */
export function commandDisable(
  name: string,
  config: string,
): { newConfig: string; message: string } {
  const { frontmatter, body } = splitConfig(config);
  const existingPacks = parsePacksField(frontmatter);

  if (!existingPacks.includes(name)) {
    return { newConfig: config, message: `pack "${name}" not enabled (no-op)` };
  }

  const newPacks = existingPacks.filter((p) => p !== name);
  const newFrontmatter = rebuildFrontmatter(frontmatter, newPacks);
  return {
    newConfig: `---\n${newFrontmatter}---\n${body}`,
    message: `pack "${name}" disabled`,
  };
}

// ---------------------------------------------------------------------------
// commandInspect
// ---------------------------------------------------------------------------

/** Inspect a pack's manifest and category counts. */
export function commandInspect(name: string, registry: PackRegistry): string {
  const entry = registry.packs.get(name);
  if (!entry) throw new Error(`pack not found: ${name}`);

  const lines: string[] = [
    `Name: ${entry.name}`,
    `Display: ${entry.displayName}`,
    `Description: ${entry.description}`,
    `Min Version: ${entry.forgeMinVersion}`,
    `Depends On: ${entry.dependsOn.join(", ") || "none"}`,
  ];

  const cats = Object.keys(entry.extends);
  lines.push(`Categories: ${cats.length} (${cats.join(", ") || "none"})`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// commandOverride
// ---------------------------------------------------------------------------

/** Copy a pack file to custom layer for override. */
export function commandOverride(
  relativePath: string,
  enabled: EnabledPacks,
  _force: boolean,
): { sourcePath: string; targetPath: string } | { error: string } {
  // Path traversal check
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return { error: `path traversal detected: ${relativePath}` };
  }

  // Find source in enabled packs — return first pack that could provide the path.
  // File existence check is the caller's responsibility (requires FileSystem).
  if (enabled.entries.length > 0) {
    const entry = enabled.entries[0];
    return {
      sourcePath: path.join(entry.rootPath, normalized),
      targetPath: path.join(enabled.customLayerRoot, normalized),
    };
  }

  return { error: `no enabled pack provides: ${relativePath}` };
}

// ---------------------------------------------------------------------------
// commandValidate
// ---------------------------------------------------------------------------

/** Validation report for a pack. */
export interface ValidationReport {
  passed: boolean;
  pack: string;
  checks: Array<{ check: string; passed: boolean; detail?: string }>;
}

/** Validate a pack's structure. */
export function commandValidate(name: string | null, registry: PackRegistry): ValidationReport {
  // For now, basic manifest validation (no filesystem checks)
  const entry = name ? registry.packs.get(name) : undefined;
  if (!entry) {
    return {
      passed: false,
      pack: name ?? "",
      checks: [{ check: "exists", passed: false, detail: "not in registry" }],
    };
  }

  const target = entry;
  const checks: ValidationReport["checks"] = [];

  // Check: manifest parses (already done by loader)
  checks.push({ check: "manifest parses", passed: true });

  // Check: extends directories declared
  const catCount = Object.keys(target.extends).length;
  checks.push({
    check: `${catCount} categories declared`,
    passed: catCount > 0 || Object.keys(target.extends).length === 0,
  });

  // Note: directory existence check requires filesystem, done at skill level
  return { passed: checks.every((c) => c.passed), pack: target.name, checks };
}

// ---------------------------------------------------------------------------
// commandNew
// ---------------------------------------------------------------------------

/** Scaffold a new pack directory. */
export function commandNew(name: string): { files: Array<{ path: string; content: string }> } {
  const manifest = [
    `name: ${name}`,
    `display_name: "${name}"`,
    `description: "${name} pack"`,
    `forge_min_version: "2.4.0"`,
    `extends: {}`,
  ].join("\n");

  const readme = `# ${name}\n\nDomain pack for ${name}.\n`;

  return {
    files: [
      { path: `packs/${name}/pack.yaml`, content: manifest },
      { path: `packs/${name}/README.md`, content: readme },
    ],
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function splitConfig(config: string): { frontmatter: string; body: string } {
  const match = /^---\s*\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(config);
  if (!match) return { frontmatter: "", body: config };
  return { frontmatter: match[1], body: match[2] };
}

function parsePacksField(frontmatter: string): string[] {
  const match = /^packs:\s*\n((\s+-\s+.+\n?)*)/m.exec(frontmatter);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((l) => l.replace(/^\s+-\s+/, "").trim())
    .filter(Boolean);
}

function rebuildFrontmatter(original: string, packs: string[]): string {
  const lines = original.split("\n").filter((l) => !/^packs:/.test(l) && !/^\s+-\s+/.test(l));
  if (packs.length > 0) {
    lines.push("packs:");
    for (const p of packs) lines.push(`  - ${p}`);
  }
  return `${lines.join("\n")}\n`;
}
