import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadPackRegistry, validateManifest } from "../../src/pack/loader.js";
import type { FileSystem } from "../../src/pack/types.js";

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
      if (content === undefined) throw new Error(`ENOENT: ${f}`);
      if (content === null) throw new Error(`ENOENT: ${f}`);
      return content;
    }),
    writeFile: vi.fn(),
    exists: vi.fn(async (f: string) => f in files && files[f] !== null),
    stat: vi.fn(async () => ({ isFile: () => true, isDirectory: () => false })),
  };
}

const REPOS_ROOT = "/repos";
const PACKS_DIR = path.join(REPOS_ROOT, "packs");

describe("loadPackRegistry", () => {
  it("returns empty registry for empty packs directory", async () => {
    const fs = createMockFs({});
    const result = await loadPackRegistry(REPOS_ROOT, fs);
    expect(result.packs.size).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("returns empty registry when packs directory does not exist", async () => {
    const fs = createMockFs({});
    // readdir throws for non-existent directory
    (fs.readdir as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ENOENT"));
    const result = await loadPackRegistry(REPOS_ROOT, fs);
    expect(result.packs.size).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("loads a valid pack with all required fields", async () => {
    const fs = createMockFs({
      [path.join(PACKS_DIR, "demo", "pack.yaml")]: [
        "name: demo",
        "display_name: Demo",
        "description: A demo pack",
        "forge_min_version: '2.4.0'",
        "extends:",
        "  contexts: ./contexts",
      ].join("\n"),
    });
    const result = await loadPackRegistry(REPOS_ROOT, fs);
    expect(result.packs.size).toBe(1);
    const entry = result.packs.get("demo")!;
    expect(entry.name).toBe("demo");
    expect(entry.displayName).toBe("Demo");
    expect(entry.forgeMinVersion).toBe("2.4.0");
    expect(entry.extends.contexts).toBeDefined();
  });

  it("blocks path traversal in extends.* (security: a pack cannot escape its rootPath)", async () => {
    const fs = createMockFs({
      [path.join(PACKS_DIR, "evil", "pack.yaml")]: [
        "name: evil",
        "display_name: Evil",
        "description: malicious pack",
        "forge_min_version: '2.4.0'",
        "extends:",
        "  state_machines: ../../../etc", // resolves to /etc — escapes pack root
        "  contexts: ./contexts", // legitimate — stays within root
      ].join("\n"),
    });
    const result = await loadPackRegistry(REPOS_ROOT, fs);
    const entry = result.packs.get("evil")!;
    // traversal-blocked category is dropped
    expect(entry.extends.state_machines).toBeUndefined();
    // legitimate category is kept
    expect(entry.extends.contexts).toBeDefined();
    // a warning records the blocked traversal
    expect(
      result.warnings.some((w) => w.includes("state_machines") && w.includes("escapes pack root")),
    ).toBe(true);
  });

  it("excludes pack with missing required fields and adds warning", async () => {
    const fs = createMockFs({
      [path.join(PACKS_DIR, "bad", "pack.yaml")]: [
        "name: bad",
        "display_name: Bad",
        "# missing description, forge_min_version, extends",
      ].join("\n"),
    });
    const result = await loadPackRegistry(REPOS_ROOT, fs);
    expect(result.packs.size).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("bad");
  });

  it("excludes pack with unparseable yaml and adds warning", async () => {
    const fs = createMockFs({
      [path.join(PACKS_DIR, "broken", "pack.yaml")]: "name: [invalid: yaml: {{{",
    });
    const result = await loadPackRegistry(REPOS_ROOT, fs);
    expect(result.packs.size).toBe(0);
    expect(result.warnings.some((w) => w.includes("broken"))).toBe(true);
  });

  it("dedupes packs with same name, keeps first alphabetically", async () => {
    const makeYaml = (name: string) =>
      [
        `name: shared-name`,
        `display_name: ${name}`,
        `description: ${name}`,
        `forge_min_version: '2.4.0'`,
        `extends: {}`,
      ].join("\n");
    const fs = createMockFs({
      [path.join(PACKS_DIR, "beta", "pack.yaml")]: makeYaml("Beta"),
      [path.join(PACKS_DIR, "alpha", "pack.yaml")]: makeYaml("Alpha"),
    });
    const result = await loadPackRegistry(REPOS_ROOT, fs);
    expect(result.packs.size).toBe(1);
    expect(result.packs.get("shared-name")?.displayName).toBe("Alpha");
    expect(result.warnings.some((w) => w.includes("duplicate"))).toBe(true);
  });

  it("registry is safely serializable to JSON", async () => {
    const fs = createMockFs({
      [path.join(PACKS_DIR, "demo", "pack.yaml")]: [
        "name: demo",
        "display_name: Demo",
        "description: Desc",
        "forge_min_version: '2.4.0'",
        "extends: {}",
      ].join("\n"),
    });
    const result = await loadPackRegistry(REPOS_ROOT, fs);
    const json = JSON.stringify(result, (_, v) => (v instanceof Map ? [...v.entries()] : v));
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe("validateManifest", () => {
  it("returns errors for missing name", () => {
    const errors = validateManifest({
      display_name: "X",
      description: "X",
      forge_min_version: "1.0.0",
      extends: {},
    });
    expect(errors).toContainEqual(expect.stringContaining("name"));
  });

  it("returns errors for missing forge_min_version", () => {
    const errors = validateManifest({
      name: "test",
      display_name: "X",
      description: "X",
      extends: {},
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns empty array for valid manifest", () => {
    const errors = validateManifest({
      name: "test",
      display_name: "Test",
      description: "A test",
      forge_min_version: "2.4.0",
      extends: {},
    });
    expect(errors).toEqual([]);
  });

  it("returns errors for non-kebab-case name", () => {
    const errors = validateManifest({
      name: "BadName",
      display_name: "Bad",
      description: "Bad",
      forge_min_version: "2.4.0",
      extends: {},
    });
    expect(errors.some((e) => e.includes("kebab-case"))).toBe(true);
  });
});
