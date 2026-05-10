import { describe, it, expect } from "vitest";

// We test the parsing behavior by constructing content strings and checking
// that loadGlossary (or the underlying parseGlossaryFile) produces correct entries.

// Since parseGlossaryFile is private, we test through loadGlossary with a mock FS.

import type { EnabledPacks, FileSystem } from "../../src/pack/types.js";
import { loadGlossary } from "../../src/glossary/registry.js";

function createMockFs(files: Record<string, string>): FileSystem {
  return {
    exists: (path: string) => Promise.resolve(path in files),
    readFile: (path: string) => {
      if (!(path in files)) return Promise.reject(new Error(`Not found: ${path}`));
      return Promise.resolve(files[path]);
    },
    readdir: (path: string) => {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const names = new Set<string>();
      for (const p of Object.keys(files)) {
        if (p.startsWith(prefix)) {
          const rest = p.slice(prefix.length);
          const fileName = rest.split("/")[0];
          if (fileName && !fileName.includes("/")) names.add(fileName);
        }
      }
      return Promise.resolve([...names]);
    },
    writeFile: () => Promise.resolve(),
    stat: () => Promise.reject(new Error("not implemented")),
  };
}

function packEnabled(rootPath: string, _files: Record<string, string>): EnabledPacks {
  return {
    order: ["test-pack"],
    entries: [
      {
        name: "test-pack",
        rootPath,
        extends: {
          glossary: `${rootPath}/glossary`,
          contexts: `${rootPath}/contexts`,
          scenarios: `${rootPath}/scenarios`,
          bannedPatterns: `${rootPath}/banned-patterns.yaml`,
          stateMachines: `${rootPath}/state-machines`,
          lintRules: `${rootPath}/lint-rules`,
        },
        featureFlags: {},
      } as any,
    ],
    customLayerRoot: "/custom",
  };
}

const emptyEnabled: EnabledPacks = {
  order: [],
  entries: [],
  customLayerRoot: "/custom",
};

describe("Glossary format compatibility", () => {
  describe("aggregated format (PMS Pack style)", () => {
    it("parses terms from aggregated frontmatter", async () => {
      const files: Record<string, string> = {
        "/pack/glossary/reservations.md": `---
name: reservations
description: "Reservations Context 术语"
terms:
  - term: Reservation
    aliases: [预订, 订房]
    definition: "客人对酒店住宿服务的预订单"
  - term: Room Type
    aliases: [房型]
    definition: "按面积、设施、床型分类的房间类别"
---`,
      };
      const fs = createMockFs(files);
      const packs = packEnabled("/pack", files);
      const registry = await loadGlossary(packs, fs);
      expect(registry.entries.size).toBe(2);
      expect(registry.byTerm.has("Reservation")).toBe(true);
      expect(registry.byTerm.has("Room Type")).toBe(true);
    });

    it("indexes aliases", async () => {
      const files: Record<string, string> = {
        "/pack/glossary/reservations.md": `---
name: reservations
terms:
  - term: Reservation
    aliases: [预订, 订房]
    definition: "预订单"
---`,
      };
      const fs = createMockFs(files);
      const packs = packEnabled("/pack", files);
      const registry = await loadGlossary(packs, fs);
      expect(registry.byTerm.has("预订")).toBe(true);
      expect(registry.byTerm.has("订房")).toBe(true);
    });

    it("handles empty terms array with warning", async () => {
      const files: Record<string, string> = {
        "/pack/glossary/empty.md": `---
name: empty
terms: []
---`,
      };
      const fs = createMockFs(files);
      const packs = packEnabled("/pack", files);
      const registry = await loadGlossary(packs, fs);
      expect(registry.entries.size).toBe(0);
    });
  });

  describe("per-term format (Sprint 1 original)", () => {
    it("parses terms from ## sections with inline frontmatter", async () => {
      const files: Record<string, string> = {
        "/pack/glossary/shared.md": `## Reservation
---
term: Reservation
aliases: [预订]
updated: 2026-01-01
source: test
---
## 定义
客人对酒店住宿服务的预订单

## Room Type
---
term: Room Type
aliases: [房型]
updated: 2026-01-01
source: test
---
## 定义
按面积分类的房间类别`,
      };
      const fs = createMockFs(files);
      const packs = packEnabled("/pack", files);
      const registry = await loadGlossary(packs, fs);
      expect(registry.entries.size).toBe(2);
    });
  });

  describe("mixed format", () => {
    it("prefers aggregated when terms array is present", async () => {
      const files: Record<string, string> = {
        "/pack/glossary/mixed.md": `---
name: mixed
terms:
  - term: AggregatedTerm
    aliases: []
    definition: "from aggregated"
---
## SomeHeading
---
term: PerTerm
aliases: []
updated: 2026-01-01
---
## 定义
from per-term`,
      };
      const fs = createMockFs(files);
      const packs = packEnabled("/pack", files);
      const registry = await loadGlossary(packs, fs);
      expect(registry.entries.size).toBe(1);
      expect(registry.byTerm.has("AggregatedTerm")).toBe(true);
    });
  });

  describe("no recognized format", () => {
    it("produces empty for unrecognized frontmatter", async () => {
      const files: Record<string, string> = {
        "/pack/glossary/bad.md": `---
name: bad
description: "no terms here"
---`,
      };
      const fs = createMockFs(files);
      const packs = packEnabled("/pack", files);
      const registry = await loadGlossary(packs, fs);
      expect(registry.entries.size).toBe(0);
    });
  });

  describe("Zero-Pack", () => {
    it("returns empty registry with no packs", async () => {
      const fs = createMockFs({});
      const registry = await loadGlossary(emptyEnabled, fs);
      expect(registry.entries.size).toBe(0);
    });
  });
});
