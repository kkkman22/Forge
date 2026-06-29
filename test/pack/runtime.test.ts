import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadEnabledPacks } from "../../src/pack/runtime.js";
import type { FileSystem } from "../../src/pack/types.js";

/**
 * In-memory FileSystem stub matching the pattern in test/pack/loader.test.ts.
 * `files` maps absolute path → content (null = ENOENT).
 */
function createMockFs(files: Record<string, string | null>): FileSystem {
  return {
    readdir: vi.fn(async (dir: string) => {
      const dirPrefix = dir.endsWith("/") ? dir : `${dir}/`;
      const entries = new Set<string>();
      for (const f of Object.keys(files)) {
        if (f.startsWith(dirPrefix)) {
          const rest = f.slice(dirPrefix.length);
          const firstSegment = rest.split("/")[0];
          if (firstSegment) entries.add(firstSegment);
        }
      }
      return [...entries];
    }),
    readFile: vi.fn(async (f: string) => {
      const content = files[f];
      if (content === undefined || content === null) throw new Error(`ENOENT: ${f}`);
      return content;
    }),
    writeFile: vi.fn(),
    exists: vi.fn(async (f: string) => f in files && files[f] !== null),
    stat: vi.fn(async () => ({ isFile: () => true, isDirectory: () => false })),
  };
}

const REPOS_ROOT = "/repos";
const PACKS_DIR = path.join(REPOS_ROOT, "packs");
const CONFIG_PATH = path.join(REPOS_ROOT, ".forge", "config.md");

/** Minimal valid pms pack.yaml content. */
function pmsPackYaml(): string {
  return [
    "name: pms",
    "display_name: PMS",
    "description: Hotel PMS domain pack",
    "forge_min_version: '2.4.0'",
    "extends:",
    "  contexts: ./contexts",
    "  state_machines: ./state-machines",
  ].join("\n");
}

describe("loadEnabledPacks", () => {
  it("returns empty enabled when config.md has no packs field", async () => {
    const fs = createMockFs({
      [CONFIG_PATH]: "---\nproject: Forge\n---\nbody",
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: pmsPackYaml(),
    });
    const result = await loadEnabledPacks(REPOS_ROOT, fs);
    expect(result.enabled.order).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("enables packs declared in config.md packs field", async () => {
    const fs = createMockFs({
      [CONFIG_PATH]: "---\nproject: Forge\npacks:\n  - pms\n---\nbody",
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: pmsPackYaml(),
    });
    const result = await loadEnabledPacks(REPOS_ROOT, fs);
    expect(result.enabled.order).toEqual(["pms"]);
    expect(result.enabled.entries).toHaveLength(1);
    expect(result.errors).toEqual([]);
    // customLayerRoot resolves to <rootDir>/.forge/custom
    expect(result.enabled.customLayerRoot).toBe(
      path.join(REPOS_ROOT, ".forge", "custom"),
    );
  });

  it("returns warning + empty enabled when config.md is absent", async () => {
    const fs = createMockFs({
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: pmsPackYaml(),
    });
    const result = await loadEnabledPacks(REPOS_ROOT, fs);
    expect(result.enabled.order).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("config.md");
  });

  it("returns error listing available packs for unknown pack name", async () => {
    const fs = createMockFs({
      [CONFIG_PATH]: "---\npacks:\n  - nonexistent\n---\nbody",
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: pmsPackYaml(),
    });
    const result = await loadEnabledPacks(REPOS_ROOT, fs);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("nonexistent");
    // available packs listed in error
    expect(result.errors[0]).toContain("pms");
  });

  it("bubbles registry warnings (e.g. duplicate packs)", async () => {
    // Two directories claiming name: pms → loader warns duplicate
    const fs = createMockFs({
      [CONFIG_PATH]: "---\npacks:\n  - pms\n---\nbody",
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: pmsPackYaml(),
      [path.join(PACKS_DIR, "pms-alt", "pack.yaml")]: pmsPackYaml(),
    });
    const result = await loadEnabledPacks(REPOS_ROOT, fs);
    expect(result.enabled.order).toEqual(["pms"]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
