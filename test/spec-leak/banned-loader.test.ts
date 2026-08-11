/**
 * Unit tests for loadBannedPatterns (banned pattern loader).
 *
 * Covers: empty enabled, single layer, multi-layer union, deduplication.
 */

import { describe, expect, it } from "vitest";
import type { EnabledPacks, FileSystem, PackEntry } from "../../src/pack/types.js";
import { loadBannedPatterns } from "../../src/spec-leak-detector.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePackEntry(overrides: Partial<PackEntry> = {}): PackEntry {
  return {
    name: "hotel-ops",
    displayName: "Hotel Operations",
    description: "Hotel ops pack",
    forgeMinVersion: "2.4.0",
    dependsOn: [],
    extends: { banned_patterns: "banned_patterns" },
    featureFlags: {},
    manifestPath: "/packs/hotel-ops/pack.yaml",
    rootPath: "/packs/hotel-ops",
    ...overrides,
  };
}

const CUSTOM_ROOT = "/project/.tinkerman/custom";

function makeEnabled(entries: PackEntry[] = [], customRoot: string = CUSTOM_ROOT): EnabledPacks {
  return {
    order: entries.map((e) => e.name),
    entries,
    customLayerRoot: customRoot,
  };
}

function createMockFs(files: Record<string, string | null>): FileSystem {
  return {
    readdir: async (dir: string) => {
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
    },
    readFile: async (f: string) => {
      const content = files[f];
      if (content === undefined || content === null) throw new Error(`ENOENT: ${f}`);
      return content;
    },
    writeFile: async () => {},
    exists: async (f: string) => f in files && files[f] !== null,
    stat: async () => ({ isFile: () => true, isDirectory: () => false }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadBannedPatterns", () => {
  it("returns empty registry when no packs enabled and no custom file", async () => {
    const enabled = makeEnabled([]);
    const fs = createMockFs({});

    const registry = await loadBannedPatterns(enabled, fs);

    expect(registry.categories.size).toBe(0);
  });

  it("returns empty registry when no packs enabled and custom file does not exist", async () => {
    const enabled = makeEnabled([]);
    const fs = createMockFs({ "/project/.tinkerman/custom/other.yaml": "foo: bar" });

    const registry = await loadBannedPatterns(enabled, fs);

    expect(registry.categories.size).toBe(0);
  });

  it("single layer: loads patterns correctly from one pack", async () => {
    const pack = makePackEntry({
      name: "hotel-ops",
      rootPath: "/packs/hotel-ops",
    });
    const enabled = makeEnabled([pack]);

    const yamlContent = [
      "schema_version: 1",
      "categories:",
      "  code:",
      "    - pattern: UserService",
      "      description: implementation class",
      "      suggestion_template: Use 'user service' instead",
      "  infrastructure:",
      "    - pattern: regex:POST\\s+/api/",
      "      description: API endpoint in spec",
    ].join("\n");

    const fs = createMockFs({
      "/packs/hotel-ops/banned-patterns.yaml": yamlContent,
    });

    const registry = await loadBannedPatterns(enabled, fs);

    expect(registry.categories.size).toBe(2);

    const code = registry.categories.get("code")!;
    expect(code).toHaveLength(1);
    expect(code[0].pattern).toBe("UserService");
    expect(code[0].description).toBe("implementation class");
    expect(code[0].suggestion_template).toBe("Use 'user service' instead");

    const infra = registry.categories.get("infrastructure")!;
    expect(infra).toHaveLength(1);
    expect(infra[0].pattern).toBe("regex:POST\\s+/api/");
  });

  it("multi-layer union: all patterns from all layers present", async () => {
    const pack1 = makePackEntry({ name: "alpha", rootPath: "/packs/alpha" });
    const pack2 = makePackEntry({ name: "beta", rootPath: "/packs/beta" });
    const enabled = makeEnabled([pack1, pack2]);

    const fs = createMockFs({
      "/project/.tinkerman/custom/banned-patterns.yaml": [
        "schema_version: 1",
        "categories:",
        "  code:",
        "    - pattern: CustomImpl",
        "      description: custom layer impl",
      ].join("\n"),
      "/packs/alpha/banned-patterns.yaml": [
        "schema_version: 1",
        "categories:",
        "  code:",
        "    - pattern: AlphaService",
        "      description: alpha impl",
        "  infrastructure:",
        "    - pattern: Kafka",
        "      description: message broker",
      ].join("\n"),
      "/packs/beta/banned-patterns.yaml": [
        "schema_version: 1",
        "categories:",
        "  framework:",
        "    - pattern: Express",
        "      description: web framework",
        "  code:",
        "    - pattern: BetaHelper",
        "      description: beta utility",
      ].join("\n"),
    });

    const registry = await loadBannedPatterns(enabled, fs);

    // code has patterns from custom + alpha + beta
    const code = registry.categories.get("code")!;
    expect(code).toHaveLength(3);
    const codePatterns = code.map((p) => p.pattern).sort();
    expect(codePatterns).toEqual(["AlphaService", "BetaHelper", "CustomImpl"]);

    expect(registry.categories.get("infrastructure")!).toHaveLength(1);
    expect(registry.categories.get("framework")!).toHaveLength(1);
  });

  it("deduplication: same pattern string from multiple layers yields one entry", async () => {
    const pack = makePackEntry({ name: "alpha", rootPath: "/packs/alpha" });
    const enabled = makeEnabled([pack]);

    const yaml = [
      "schema_version: 1",
      "categories:",
      "  code:",
      "    - pattern: UserService",
      "      description: impl class",
    ].join("\n");

    const fs = createMockFs({
      "/project/.tinkerman/custom/banned-patterns.yaml": yaml,
      "/packs/alpha/banned-patterns.yaml": yaml,
    });

    const registry = await loadBannedPatterns(enabled, fs);

    const code = registry.categories.get("code")!;
    expect(code).toHaveLength(1);
    expect(code[0].pattern).toBe("UserService");
  });

  it("deduplication: different descriptions still dedupe by pattern string", async () => {
    const pack = makePackEntry({ name: "alpha", rootPath: "/packs/alpha" });
    const enabled = makeEnabled([pack]);

    const fs = createMockFs({
      "/project/.tinkerman/custom/banned-patterns.yaml": [
        "schema_version: 1",
        "categories:",
        "  code:",
        "    - pattern: UserService",
        "      description: first description",
      ].join("\n"),
      "/packs/alpha/banned-patterns.yaml": [
        "schema_version: 1",
        "categories:",
        "  code:",
        "    - pattern: UserService",
        "      description: second description",
      ].join("\n"),
    });

    const registry = await loadBannedPatterns(enabled, fs);

    const code = registry.categories.get("code")!;
    // First occurrence wins
    expect(code).toHaveLength(1);
    expect(code[0].description).toBe("first description");
  });

  it("skips invalid entries (missing pattern field)", async () => {
    const pack = makePackEntry({ name: "alpha", rootPath: "/packs/alpha" });
    const enabled = makeEnabled([pack]);

    const fs = createMockFs({
      "/packs/alpha/banned-patterns.yaml": [
        "schema_version: 1",
        "categories:",
        "  code:",
        "    - description: missing pattern field",
        "    - pattern: ValidPattern",
        "      description: this one is valid",
      ].join("\n"),
    });

    const registry = await loadBannedPatterns(enabled, fs);

    const code = registry.categories.get("code")!;
    expect(code).toHaveLength(1);
    expect(code[0].pattern).toBe("ValidPattern");
  });
});
