import { describe, expect, it } from "vitest";
import {
  commandDisable,
  commandEnable,
  commandInspect,
  commandList,
  commandNew,
  commandOverride,
  commandValidate,
} from "../../src/pack/commands.js";
import type { EnabledPacks, PackEntry, PackRegistry } from "../../src/pack/types.js";

function makeEntry(name: string, categories: Record<string, string> = {}): PackEntry {
  return {
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    description: `${name} pack`,
    forgeMinVersion: "2.4.0",
    dependsOn: [],
    extends: categories,
    featureFlags: {},
    manifestPath: `/packs/${name}/pack.yaml`,
    rootPath: `/packs/${name}`,
  };
}

function makeRegistry(entries: PackEntry[]): PackRegistry {
  const packs = new Map<string, PackEntry>();
  for (const e of entries) packs.set(e.name, e);
  return { packs, warnings: [] };
}

function makeEnabled(order: string[], entries: PackEntry[]): EnabledPacks {
  return { order, entries, customLayerRoot: "/custom" };
}

describe("commandList", () => {
  it("lists all packs with status", () => {
    const pms = makeEntry("pms", { contexts: "/c" });
    const registry = makeRegistry([pms]);
    const enabled = makeEnabled(["pms"], [pms]);
    const output = commandList(registry, enabled);
    expect(output).toContain("pms");
    expect(output).toContain("enabled");
  });

  it("shows available for non-enabled pack", () => {
    const pms = makeEntry("pms");
    const registry = makeRegistry([pms]);
    const enabled = makeEnabled([], []);
    const output = commandList(registry, enabled);
    expect(output).toContain("available");
  });
});

describe("commandEnable", () => {
  it("adds pack to config frontmatter", () => {
    const registry = makeRegistry([makeEntry("pms")]);
    const config = "---\nproject: Forge\n---\nbody";
    const result = commandEnable("pms", config, registry);
    if ("error" in result) throw new Error("unexpected error");
    expect(result.newConfig).toContain("packs:");
    expect(result.newConfig).toContain("pms");
    expect(result.message).toContain("enabled");
  });

  it("is idempotent for already enabled pack", () => {
    const registry = makeRegistry([makeEntry("pms")]);
    const config = "---\npacks:\n  - pms\n---\nbody";
    const result = commandEnable("pms", config, registry);
    if ("error" in result) throw new Error("unexpected error");
    expect(result.message).toContain("already");
  });

  it("returns error for unknown pack", () => {
    const registry = makeRegistry([]);
    const config = "---\n---\nbody";
    const result = commandEnable("nonexistent", config, registry);
    expect("error" in result).toBe(true);
  });
});

describe("commandDisable", () => {
  it("removes pack from config", () => {
    const config = "---\npacks:\n  - pms\n---\nbody";
    const result = commandDisable("pms", config);
    expect(result.newConfig).not.toContain("pms");
  });

  it("is idempotent for non-enabled pack", () => {
    const config = "---\n---\nbody";
    const result = commandDisable("pms", config);
    expect(result.message).toContain("not enabled");
  });
});

describe("commandInspect", () => {
  it("shows pack details and category counts", () => {
    const entry = makeEntry("pms", {
      contexts: "/ctx",
      glossary: "/gloss",
      scenarios: "/scen",
    });
    const registry = makeRegistry([entry]);
    const output = commandInspect("pms", registry);
    expect(output).toContain("pms");
    expect(output).toContain("Categories: 3");
  });

  it("throws for unknown pack", () => {
    const registry = makeRegistry([]);
    expect(() => commandInspect("x", registry)).toThrow();
  });
});

describe("commandOverride", () => {
  it("returns source and target paths", () => {
    const entry = makeEntry("pms", { glossary: "/packs/pms/glossary" });
    const enabled = makeEnabled(["pms"], [entry]);
    const result = commandOverride("glossary/folio.md", enabled, false);
    if ("error" in result) throw new Error("unexpected error");
    expect(result.sourcePath).toContain("glossary/folio.md");
    expect(result.targetPath).toContain("custom");
  });

  it("returns error for path traversal", () => {
    const entry = makeEntry("pms", { glossary: "/packs/pms/glossary" });
    const enabled = makeEnabled(["pms"], [entry]);
    const result = commandOverride("../../etc/passwd", enabled, false);
    expect("error" in result).toBe(true);
  });
});

describe("commandValidate", () => {
  it("passes for valid pack", () => {
    const entry = makeEntry("pms", { contexts: "/ctx" });
    const registry = makeRegistry([entry]);
    const report = commandValidate("pms", registry);
    expect(report.passed).toBe(true);
  });

  it("passes for pack with declared extends (filesystem check done at skill level)", () => {
    const entry = makeEntry("pms", { contexts: "/some/path" });
    const registry = makeRegistry([entry]);
    const report = commandValidate("pms", registry);
    expect(report.passed).toBe(true);
  });
});

describe("commandNew", () => {
  it("returns scaffold file list", () => {
    const result = commandNew("demo-test");
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files[0].path).toContain("demo-test");
    expect(result.files.some((f) => f.path.endsWith("pack.yaml"))).toBe(true);
  });
});
