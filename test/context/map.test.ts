import { describe, expect, it } from "vitest";
import { loadContextMap } from "../../src/context/map.js";
import type { EnabledPacks, FileSystem, PackEntry } from "../../src/pack/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CUSTOM_ROOT = "/project/.tinkerman/custom";

function makePackEntry(overrides: Partial<PackEntry> = {}): PackEntry {
  return {
    name: "hotel-ops",
    displayName: "Hotel Operations",
    description: "Hotel ops pack",
    forgeMinVersion: "2.4.0",
    dependsOn: [],
    extends: { contexts: "/packs/hotel-ops/contexts" },
    featureFlags: {},
    manifestPath: "/packs/hotel-ops/pack.yaml",
    rootPath: "/packs/hotel-ops",
    ...overrides,
  };
}

function makeEnabled(entries: PackEntry[] = [], customRoot: string = CUSTOM_ROOT): EnabledPacks {
  return {
    order: entries.map((e) => e.name),
    entries,
    customLayerRoot: customRoot,
  };
}

function makeMockFs(files: Map<string, string | string[]>): FileSystem {
  return {
    async readdir(dirPath: string): Promise<string[]> {
      const val = files.get(dirPath);
      if (Array.isArray(val)) return val;
      const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
      const children = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
          children.add(key.slice(prefix.length));
        }
      }
      return Array.from(children);
    },
    async readFile(filePath: string): Promise<string> {
      const val = files.get(filePath);
      if (typeof val === "string") return val;
      throw new Error(`File not found: ${filePath}`);
    },
    async writeFile() {},
    async exists(p: string): Promise<boolean> {
      return files.has(p);
    },
    async stat(p: string) {
      const val = files.get(p);
      if (Array.isArray(val)) {
        return { isFile: () => false, isDirectory: () => true };
      }
      if (typeof val === "string") {
        return { isFile: () => true, isDirectory: () => false };
      }
      const prefix = p.endsWith("/") ? p : `${p}/`;
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          return { isFile: () => false, isDirectory: () => true };
        }
      }
      throw new Error(`Not found: ${p}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadContextMap", () => {
  it("returns empty array when no _map.yaml exists", async () => {
    const enabled = makeEnabled([makePackEntry()]);
    const fs = makeMockFs(new Map());
    const edges = await loadContextMap(enabled, fs);
    expect(edges).toEqual([]);
  });

  it("loads edges from a single layer", async () => {
    const pack = makePackEntry();
    const enabled = makeEnabled([pack]);
    const mapYaml = `edges:
  - source: reservations
    target: billing
    type: customer-supplier
  - source: catalog
    target: reservations
    type: partnership
`;
    const fs = makeMockFs(new Map([["/packs/hotel-ops/contexts/_map.yaml", mapYaml]]));

    const edges = await loadContextMap(enabled, fs);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toEqual({
      source: "reservations",
      target: "billing",
      type: "customer-supplier",
      sourceLayer: "pack:hotel-ops",
    });
    expect(edges[1]).toEqual({
      source: "catalog",
      target: "reservations",
      type: "partnership",
      sourceLayer: "pack:hotel-ops",
    });
  });

  it("custom layer wins for conflicting edges", async () => {
    const pack = makePackEntry();
    const enabled = makeEnabled([pack]);

    const packMap = `edges:
  - source: reservations
    target: billing
    type: customer-supplier
`;
    const customMap = `edges:
  - source: reservations
    target: billing
    type: acl
`;

    const fs = makeMockFs(
      new Map([
        ["/packs/hotel-ops/contexts/_map.yaml", packMap],
        [`${CUSTOM_ROOT}/contexts/_map.yaml`, customMap],
      ]),
    );

    const edges = await loadContextMap(enabled, fs);
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe("acl");
    expect(edges[0].sourceLayer).toBe("custom");
  });

  it("earlier pack wins over later pack for same edge", async () => {
    const pack1 = makePackEntry({
      name: "alpha",
      rootPath: "/packs/alpha",
      extends: { contexts: "/packs/alpha/contexts" },
    });
    const pack2 = makePackEntry({
      name: "beta",
      rootPath: "/packs/beta",
      extends: { contexts: "/packs/beta/contexts" },
    });
    const enabled = makeEnabled([pack1, pack2]);

    const alphaMap = `edges:
  - source: reservations
    target: billing
    type: partnership
`;
    const betaMap = `edges:
  - source: reservations
    target: billing
    type: conformist
`;

    const fs = makeMockFs(
      new Map([
        ["/packs/alpha/contexts/_map.yaml", alphaMap],
        ["/packs/beta/contexts/_map.yaml", betaMap],
      ]),
    );

    const edges = await loadContextMap(enabled, fs);
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe("partnership");
    expect(edges[0].sourceLayer).toBe("pack:alpha");
  });

  it("merges non-conflicting edges from multiple layers", async () => {
    const pack = makePackEntry();
    const enabled = makeEnabled([pack]);

    const packMap = `edges:
  - source: reservations
    target: billing
    type: customer-supplier
`;
    const customMap = `edges:
  - source: catalog
    target: reservations
    type: partnership
`;

    const fs = makeMockFs(
      new Map([
        ["/packs/hotel-ops/contexts/_map.yaml", packMap],
        [`${CUSTOM_ROOT}/contexts/_map.yaml`, customMap],
      ]),
    );

    const edges = await loadContextMap(enabled, fs);
    expect(edges).toHaveLength(2);
  });

  it("handles malformed _map.yaml gracefully", async () => {
    const pack = makePackEntry();
    const enabled = makeEnabled([pack]);
    const fs = makeMockFs(new Map([["/packs/hotel-ops/contexts/_map.yaml", "{{invalid yaml"]]));

    const edges = await loadContextMap(enabled, fs);
    expect(edges).toEqual([]);
  });

  it("pack without contexts extension is skipped", async () => {
    const pack = makePackEntry({
      extends: { glossary: "/packs/hotel-ops/glossary" },
    });
    const enabled = makeEnabled([pack]);
    const fs = makeMockFs(new Map());

    const edges = await loadContextMap(enabled, fs);
    expect(edges).toEqual([]);
  });

  it("empty enabled packs with no custom map returns empty", async () => {
    const enabled = makeEnabled([]);
    const fs = makeMockFs(new Map());
    const edges = await loadContextMap(enabled, fs);
    expect(edges).toEqual([]);
  });
});
