import { describe, expect, it } from "vitest";
import type {
  BannedPatternRegistry,
  EnabledPacks,
  FileSystem,
  GlossaryRegistry,
  PackEntry,
} from "../src/pack/types.js";
import { detectSpecLeak, loadBannedPatterns } from "../src/spec-leak-detector.js";

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
    extends: { banned_patterns: "/packs/hotel-ops/banned_patterns" },
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

function emptyGlossary(): GlossaryRegistry {
  return { entries: new Map(), byTerm: new Map() };
}

function makeBannedRegistry(
  categories: Record<
    string,
    { pattern: string; description: string; suggestion_template?: string }[]
  >,
): BannedPatternRegistry {
  const map = new Map<
    string,
    { pattern: string; description: string; suggestion_template?: string }[]
  >();
  for (const [name, patterns] of Object.entries(categories)) {
    map.set(name, patterns);
  }
  return { categories: map };
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
// detectSpecLeak tests
// ---------------------------------------------------------------------------

describe("detectSpecLeak", () => {
  it("code block exemption: implementation details inside ``` block produce no findings", () => {
    const specText = [
      "# User Service Spec",
      "",
      "The system should handle users:",
      "```typescript",
      "const userService = new UserService();",
      "await userService.createUser({ name: 'Alice' });",
      "```",
      "",
      "That is all.",
    ].join("\n");

    const banned = makeBannedRegistry({
      code: [{ pattern: "UserService", description: "implementation class name" }],
    });

    const findings = detectSpecLeak(specText, "spec.md", banned, emptyGlossary(), "booking");

    expect(findings).toEqual([]);
  });

  it("literal match: UserService in prose produces a finding with category 'code'", () => {
    const specText = "The UserService handles all user operations.";

    const banned = makeBannedRegistry({
      code: [
        {
          pattern: "UserService",
          description: "implementation class name",
          suggestion_template: "Use 'user management system' instead",
        },
      ],
    });

    const findings = detectSpecLeak(specText, "spec.md", banned, emptyGlossary(), "booking");

    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("code");
    expect(findings[0].file).toBe("spec.md");
    expect(findings[0].line).toBe(1);
    expect(findings[0].matchedTerm).toBe("UserService");
    expect(findings[0].suggestedRewrite).toBe("Use 'user management system' instead");
  });

  it("regex match: POST /api/users produces a finding with category 'infrastructure'", () => {
    const specText = "When a guest checks in, the system calls POST /api/users to create a record.";

    const banned = makeBannedRegistry({
      infrastructure: [
        {
          pattern: "regex:POST\\s+/api/",
          description: "API endpoint in spec",
        },
      ],
    });

    const findings = detectSpecLeak(specText, "spec.md", banned, emptyGlossary(), "booking");

    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("infrastructure");
    expect(findings[0].matchedTerm).toBe("POST /api/");
  });

  it("glossary whitelist: term defined in matching specContext is not a finding", () => {
    const specText = "The ReservationService manages all booking lifecycle events.";

    const banned = makeBannedRegistry({
      code: [{ pattern: "ReservationService", description: "implementation class" }],
    });

    const glossary: GlossaryRegistry = {
      entries: new Map(),
      byTerm: new Map([
        [
          "ReservationService",
          [
            {
              term: "ReservationService",
              context: "booking",
              definition: "Core booking service",
              aliases: [],
              updated: "2026-01-01",
              source: null,
              sourcePath: "",
              sourceLayer: "core",
            },
          ],
        ],
      ]),
    };

    const findings = detectSpecLeak(specText, "spec.md", banned, glossary, "booking");

    expect(findings).toEqual([]);
  });

  it("glossary whitelist: _shared context also whitelists", () => {
    const specText = "The KafkaProducer sends events.";

    const banned = makeBannedRegistry({
      infrastructure: [{ pattern: "KafkaProducer", description: "infra detail" }],
    });

    const glossary: GlossaryRegistry = {
      entries: new Map(),
      byTerm: new Map([
        [
          "KafkaProducer",
          [
            {
              term: "KafkaProducer",
              context: "_shared",
              definition: "Shared infra term",
              aliases: [],
              updated: "2026-01-01",
              source: null,
              sourcePath: "",
              sourceLayer: "core",
            },
          ],
        ],
      ]),
    };

    const findings = detectSpecLeak(specText, "spec.md", banned, glossary, "booking");
    expect(findings).toEqual([]);
  });

  it("empty banned registry returns empty results", () => {
    const specText = "UserService and POST /api/users everywhere";
    const banned: BannedPatternRegistry = { categories: new Map() };

    const findings = detectSpecLeak(specText, "spec.md", banned, emptyGlossary(), "booking");

    expect(findings).toEqual([]);
  });

  it("findings are sorted by line number", () => {
    const specText = [
      "Line one has UserService",
      "Line two is clean",
      "Line three has POST /api/users",
    ].join("\n");

    const banned = makeBannedRegistry({
      code: [{ pattern: "UserService", description: "impl class" }],
      infrastructure: [{ pattern: "regex:POST\\s+/api/", description: "API endpoint" }],
    });

    const findings = detectSpecLeak(specText, "spec.md", banned, emptyGlossary(), "booking");

    expect(findings).toHaveLength(2);
    expect(findings[0].line).toBeLessThan(findings[1].line);
    expect(findings[0].line).toBe(1);
    expect(findings[1].line).toBe(3);
  });

  it("multi-category: patterns from multiple categories all detected", () => {
    const specText = "Uses UserService and connects to Redis and Express framework.";

    const banned = makeBannedRegistry({
      code: [{ pattern: "UserService", description: "impl class" }],
      infrastructure: [{ pattern: "Redis", description: "infra detail" }],
      framework: [{ pattern: "Express", description: "framework detail" }],
    });

    const findings = detectSpecLeak(specText, "spec.md", banned, emptyGlossary(), "booking");

    expect(findings).toHaveLength(3);
    const categories = findings.map((f) => f.category).sort();
    expect(categories).toEqual(["code", "framework", "infrastructure"]);
  });
});

// ---------------------------------------------------------------------------
// loadBannedPatterns integration tests
// ---------------------------------------------------------------------------

describe("loadBannedPatterns", () => {
  it("returns empty registry when no packs enabled and no custom file", async () => {
    const enabled = makeEnabled([]);
    const fs = createMockFs({});

    const registry = await loadBannedPatterns(enabled, fs);

    expect(registry.categories.size).toBe(0);
  });

  it("loads patterns from a single pack layer", async () => {
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
      "      description: implementation class name",
      "      suggestion_template: Use 'user management' instead",
    ].join("\n");

    const fs = createMockFs({
      "/packs/hotel-ops/banned-patterns.yaml": yamlContent,
    });

    const registry = await loadBannedPatterns(enabled, fs);

    expect(registry.categories.size).toBe(1);
    const codePatterns = registry.categories.get("code")!;
    expect(codePatterns).toHaveLength(1);
    expect(codePatterns[0].pattern).toBe("UserService");
    expect(codePatterns[0].suggestion_template).toBe("Use 'user management' instead");
  });

  it("multi-layer union: patterns from multiple layers all present", async () => {
    const pack1 = makePackEntry({ name: "alpha", rootPath: "/packs/alpha" });
    const pack2 = makePackEntry({ name: "beta", rootPath: "/packs/beta" });
    const enabled = makeEnabled([pack1, pack2]);

    const fs = createMockFs({
      "/project/.tinkerman/custom/banned-patterns.yaml": [
        "schema_version: 1",
        "categories:",
        "  code:",
        "    - pattern: CustomImpl",
        "      description: custom impl",
      ].join("\n"),
      "/packs/alpha/banned-patterns.yaml": [
        "schema_version: 1",
        "categories:",
        "  infrastructure:",
        "    - pattern: regex:POST\\s+/api/",
        "      description: API endpoint",
        "  code:",
        "    - pattern: AlphaService",
        "      description: alpha impl",
      ].join("\n"),
      "/packs/beta/banned-patterns.yaml": [
        "schema_version: 1",
        "categories:",
        "  framework:",
        "    - pattern: Express",
        "      description: framework detail",
      ].join("\n"),
    });

    const registry = await loadBannedPatterns(enabled, fs);

    expect(registry.categories.get("code")!).toHaveLength(2);
    expect(registry.categories.get("infrastructure")!).toHaveLength(1);
    expect(registry.categories.get("framework")!).toHaveLength(1);
  });

  it("deduplicates identical pattern strings within same category", async () => {
    const pack = makePackEntry({ name: "alpha", rootPath: "/packs/alpha" });
    const enabled = makeEnabled([pack]);

    // Both custom and pack define the same pattern
    const sameYaml = [
      "schema_version: 1",
      "categories:",
      "  code:",
      "    - pattern: UserService",
      "      description: impl class",
    ].join("\n");

    const fs = createMockFs({
      "/project/.tinkerman/custom/banned-patterns.yaml": sameYaml,
      "/packs/alpha/banned-patterns.yaml": sameYaml,
    });

    const registry = await loadBannedPatterns(enabled, fs);

    const codePatterns = registry.categories.get("code")!;
    expect(codePatterns).toHaveLength(1);
    expect(codePatterns[0].pattern).toBe("UserService");
  });

  it("skips files with wrong schema_version", async () => {
    const pack = makePackEntry({ name: "alpha", rootPath: "/packs/alpha" });
    const enabled = makeEnabled([pack]);

    const fs = createMockFs({
      "/packs/alpha/banned-patterns.yaml": [
        "schema_version: 2",
        "categories:",
        "  code:",
        "    - pattern: UserService",
        "      description: impl",
      ].join("\n"),
    });

    const registry = await loadBannedPatterns(enabled, fs);
    expect(registry.categories.size).toBe(0);
  });

  it("skips non-existent files gracefully", async () => {
    const pack = makePackEntry({ name: "alpha", rootPath: "/packs/alpha" });
    const enabled = makeEnabled([pack]);
    const fs = createMockFs({});

    const registry = await loadBannedPatterns(enabled, fs);
    expect(registry.categories.size).toBe(0);
  });
});
