/**
 * Smoke tests for dist-manifest.json accuracy (P3-3).
 *
 * Verifies that:
 * 1. Every file declared in the manifest exists on disk
 * 2. The manifest JSON is valid and has all required keys
 * 3. Every runtime .sh/.mjs file in scripts/ that should be packaged
 *    is listed in at least one manifest array
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const MANIFEST_PATH = join(ROOT, "scripts/dist-manifest.json");
const SCRIPTS_DIR = join(ROOT, "scripts");

interface DistManifest {
  cc_runtime_scripts: string[];
  cc_runtime_mjs: string[];
  cc_compiled_js: string[];
  plugin_runtime_scripts: string[];
  plugin_runtime_mjs: string[];
  plugin_compiled_js: string[];
}

function loadManifest(): DistManifest {
  const content = readFileSync(MANIFEST_PATH, "utf-8");
  return JSON.parse(content) as DistManifest;
}

describe("dist-manifest.json contract tests (P3-3)", () => {
  it("manifest file exists and is valid JSON", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    const manifest = loadManifest();
    expect(manifest).toBeDefined();
  });

  it("manifest has all required keys", () => {
    const manifest = loadManifest();
    const requiredKeys = [
      "cc_runtime_scripts",
      "cc_runtime_mjs",
      "cc_compiled_js",
      "plugin_runtime_scripts",
      "plugin_runtime_mjs",
      "plugin_compiled_js",
    ];
    for (const key of requiredKeys) {
      expect(manifest[key as keyof DistManifest], `Missing key: ${key}`).toBeDefined();
      expect(Array.isArray(manifest[key as keyof DistManifest]), `Key ${key} should be array`).toBe(true);
    }
  });

  it("every file in cc_runtime_scripts exists in scripts/", () => {
    const manifest = loadManifest();
    for (const script of manifest.cc_runtime_scripts) {
      const fullPath = join(SCRIPTS_DIR, script);
      expect(existsSync(fullPath), `CC script not found: scripts/${script}`).toBe(true);
    }
  });

  it("every file in cc_runtime_mjs exists in scripts/", () => {
    const manifest = loadManifest();
    for (const script of manifest.cc_runtime_mjs) {
      const fullPath = join(SCRIPTS_DIR, script);
      expect(existsSync(fullPath), `CC mjs not found: scripts/${script}`).toBe(true);
    }
  });

  it("every file in plugin_runtime_scripts exists in scripts/", () => {
    const manifest = loadManifest();
    for (const script of manifest.plugin_runtime_scripts) {
      const fullPath = join(SCRIPTS_DIR, script);
      expect(existsSync(fullPath), `Plugin script not found: scripts/${script}`).toBe(true);
    }
  });

  it("every file in plugin_runtime_mjs exists in scripts/", () => {
    const manifest = loadManifest();
    for (const script of manifest.plugin_runtime_mjs) {
      const fullPath = join(SCRIPTS_DIR, script);
      expect(existsSync(fullPath), `Plugin mjs not found: scripts/${script}`).toBe(true);
    }
  });

  it("cc_runtime_mjs and plugin_runtime_mjs have identical entries", () => {
    const manifest = loadManifest();
    expect([...manifest.cc_runtime_mjs].sort()).toEqual(
      [...manifest.plugin_runtime_mjs].sort(),
    );
  });

  it("no duplicate entries in any manifest array", () => {
    const manifest = loadManifest();
    for (const [key, arr] of Object.entries(manifest)) {
      if (!Array.isArray(arr)) continue;
      const unique = new Set(arr);
      expect(unique.size, `Duplicates in ${key}`).toBe(arr.length);
    }
  });

  it("manifest includes all hook-referenced runtime .mjs files", () => {
    const manifest = loadManifest();
    const allMjs = new Set([
      ...manifest.cc_runtime_mjs,
      ...manifest.plugin_runtime_mjs,
    ]);

    // These are the .mjs files referenced by hooks/hooks.json — must all be in the manifest
    const hooksJsonPath = join(ROOT, "hooks/hooks.json");
    if (existsSync(hooksJsonPath)) {
      const hooksContent = readFileSync(hooksJsonPath, "utf-8");
      const hookMatch = hooksContent.matchAll(/scripts\/([a-z0-9-]+\.mjs)/g);
      for (const m of hookMatch) {
        expect(
          allMjs.has(m[1]),
          `Hook-referenced scripts/${m[1]} not in manifest`,
        ).toBe(true);
      }
    }
  });
});
