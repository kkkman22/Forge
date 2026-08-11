/**
 * Integration test: spec.ts re-exports detectSpecLeak and loadBannedPatterns
 * so forge-spec SKILL can call them during the Lock step.
 */

import { describe, expect, it } from "vitest";
import type {
  BannedPattern,
  BannedPatternRegistry,
  EnabledPacks,
  FileSystem,
  GlossaryRegistry,
} from "../../src/pack/types.js";
import { detectSpecLeak, loadBannedPatterns } from "../../src/spec.js";

function makeFs(files: Record<string, string>): FileSystem {
  const store = new Map(Object.entries(files));
  return {
    readdir: async (path: string) => {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const names = new Set<string>();
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const parts = rest.split("/");
          if (parts[0]) names.add(parts[0]);
        }
      }
      return [...names];
    },
    readFile: async (path: string) => {
      const content = store.get(path);
      if (content === undefined) throw new Error(`File not found: ${path}`);
      return content;
    },
    writeFile: async () => {},
    exists: async (path: string) => {
      if (store.has(path)) return true;
      const prefix = path.endsWith("/") ? path : `${path}/`;
      return [...store.keys()].some((k) => k.startsWith(prefix));
    },
    stat: async () => ({ isFile: () => true, isDirectory: () => false }),
  };
}

function makeEnabledPacks(): EnabledPacks {
  return { order: [], entries: [], customLayerRoot: "/project/.tinkerman/custom" };
}

const emptyGlossary: GlossaryRegistry = {
  entries: new Map(),
  byTerm: new Map(),
};

const implPattern: BannedPattern = {
  pattern: "regex:class\\s+\\w+",
  description: "Class declaration in spec",
};

const bannedRegistry: BannedPatternRegistry = {
  categories: new Map([["implementation", [implPattern]]]),
};

describe("spec.ts leak integration", () => {
  it("re-exports detectSpecLeak from spec-leak-detector", () => {
    const findings = detectSpecLeak(
      "## Proposed Change\n\nCreate a class UserService for auth.\n",
      ".forge/specs/user-auth/spec.md",
      bannedRegistry,
      emptyGlossary,
      "user-auth",
    );

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].category).toBe("implementation");
  });

  it("re-exports loadBannedPatterns from spec-leak-detector", async () => {
    const yaml = [
      "schema_version: 1",
      "categories:",
      "  infrastructure:",
      "    - pattern: mysql",
      "      description: DB name in spec",
    ].join("\n");
    const fs = makeFs({
      "/project/.tinkerman/custom/banned-patterns.yaml": yaml,
    });
    const enabled = makeEnabledPacks();
    const registry = await loadBannedPatterns(enabled, fs);

    const infraPatterns = registry.categories.get("infrastructure");
    expect(infraPatterns).toBeDefined();
    expect(infraPatterns?.length).toBe(1);
    expect(infraPatterns?.[0].pattern).toBe("mysql");
  });

  it("detectSpecLeak returns empty for clean spec text", () => {
    const findings = detectSpecLeak(
      "## Requirements\n\nWhen user submits form, show success message.\n",
      ".forge/specs/form/spec.md",
      bannedRegistry,
      emptyGlossary,
      "form",
    );

    expect(findings).toEqual([]);
  });
});
