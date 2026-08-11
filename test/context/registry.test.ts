import { describe, expect, it } from "vitest";
import { loadContexts } from "../../src/context/registry.js";
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
      // Scan for files that are direct children
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
      // Directories are keys with array values, or keys that are parent paths
      const val = files.get(p);
      if (Array.isArray(val)) {
        return { isFile: () => false, isDirectory: () => true };
      }
      if (typeof val === "string") {
        return { isFile: () => true, isDirectory: () => false };
      }
      // Check if it's a directory by looking for children
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

const CONTEXT_MD = `---
name: reservations
responsibility: Manage room reservations
aggregates:
  - Reservation
  - Booking
inbound_events:
  - RoomRequested
outbound_events:
  - ReservationConfirmed
upstream:
  - catalog
downstream:
  - billing
---

This context handles all reservation operations.
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadContexts", () => {
  it("returns empty registry when enabledPacks is empty and no custom contexts", async () => {
    const enabled = makeEnabled([]);
    const fs = makeMockFs(new Map());
    const registry = await loadContexts(enabled, fs);
    expect(registry.contexts.size).toBe(0);
    expect(registry.map).toEqual([]);
  });

  it("loads contexts from a single pack", async () => {
    const pack = makePackEntry();
    const enabled = makeEnabled([pack]);
    const fs = makeMockFs(
      new Map<string, string | string[]>([
        ["/packs/hotel-ops/contexts", ["reservations.md"]],
        ["/packs/hotel-ops/contexts/reservations.md", CONTEXT_MD],
      ]),
    );

    const registry = await loadContexts(enabled, fs);
    expect(registry.contexts.size).toBe(1);

    const entry = registry.contexts.get("reservations")!;
    expect(entry).toBeDefined();
    expect(entry.name).toBe("reservations");
    expect(entry.responsibility).toBe("Manage room reservations");
    expect(entry.aggregates).toEqual(["Reservation", "Booking"]);
    expect(entry.inboundEvents).toEqual(["RoomRequested"]);
    expect(entry.outboundEvents).toEqual(["ReservationConfirmed"]);
    expect(entry.upstream).toEqual(["catalog"]);
    expect(entry.downstream).toEqual(["billing"]);
    expect(entry.sourceLayer).toBe("pack:hotel-ops");
    expect(entry.body).toContain("reservation operations");
  });

  it("custom layer overrides pack layer for same context name", async () => {
    const pack = makePackEntry();
    const enabled = makeEnabled([pack]);

    const customContext = `---
name: reservations
responsibility: Custom reservation management
aggregates:
  - CustomReservation
---

Custom body.
`;

    const fs = makeMockFs(
      new Map<string, string | string[]>([
        ["/packs/hotel-ops/contexts", ["reservations.md"]],
        ["/packs/hotel-ops/contexts/reservations.md", CONTEXT_MD],
        [`${CUSTOM_ROOT}/contexts`, ["reservations.md"]],
        [`${CUSTOM_ROOT}/contexts/reservations.md`, customContext],
      ]),
    );

    const registry = await loadContexts(enabled, fs);
    expect(registry.contexts.size).toBe(1);

    const entry = registry.contexts.get("reservations")!;
    expect(entry.responsibility).toBe("Custom reservation management");
    expect(entry.aggregates).toEqual(["CustomReservation"]);
    expect(entry.sourceLayer).toBe("custom");
  });

  it("earlier pack wins over later pack for same context name", async () => {
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

    const alphaContext = `---
name: reservations
responsibility: Alpha reservations
---

Alpha body.
`;
    const betaContext = `---
name: reservations
responsibility: Beta reservations
---

Beta body.
`;

    const fs = makeMockFs(
      new Map<string, string | string[]>([
        ["/packs/alpha/contexts", ["reservations.md"]],
        ["/packs/alpha/contexts/reservations.md", alphaContext],
        ["/packs/beta/contexts", ["reservations.md"]],
        ["/packs/beta/contexts/reservations.md", betaContext],
      ]),
    );

    const registry = await loadContexts(enabled, fs);
    expect(registry.contexts.size).toBe(1);

    const entry = registry.contexts.get("reservations")!;
    expect(entry.responsibility).toBe("Alpha reservations");
    expect(entry.sourceLayer).toBe("pack:alpha");
  });

  it("missing directory returns empty without error", async () => {
    const pack = makePackEntry({
      extends: { contexts: "/nonexistent/contexts" },
    });
    const enabled = makeEnabled([pack]);
    const fs = makeMockFs(new Map());

    const registry = await loadContexts(enabled, fs);
    expect(registry.contexts.size).toBe(0);
  });

  it("skips _map.yaml files in context directory", async () => {
    const pack = makePackEntry();
    const enabled = makeEnabled([pack]);
    const fs = makeMockFs(
      new Map<string, string | string[]>([
        ["/packs/hotel-ops/contexts", ["reservations.md", "_map.yaml"]],
        ["/packs/hotel-ops/contexts/reservations.md", CONTEXT_MD],
        ["/packs/hotel-ops/contexts/_map.yaml", "edges: []"],
      ]),
    );

    const registry = await loadContexts(enabled, fs);
    expect(registry.contexts.size).toBe(1);
    expect(registry.contexts.has("reservations")).toBe(true);
  });

  it("pack without contexts extension is skipped", async () => {
    const pack = makePackEntry({
      extends: { glossary: "/packs/hotel-ops/glossary" },
    });
    const enabled = makeEnabled([pack]);
    const fs = makeMockFs(new Map());

    const registry = await loadContexts(enabled, fs);
    expect(registry.contexts.size).toBe(0);
  });
});
