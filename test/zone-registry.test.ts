import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ZONE_RULES,
  formatZoneRegistry,
  loadZoneRegistry,
  loadZoneRegistryCached,
  resetZoneRegistryCache,
} from "../src/zone-registry.js";

const tempRoots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "zone-registry-test-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".tinkerman"), { recursive: true });
  return root;
}

beforeEach(() => resetZoneRegistryCache());
afterEach(() => {
  resetZoneRegistryCache();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("loadZoneRegistry (frozen-zone-structured-feedback R4.1/R4.2)", () => {
  it("falls back to DEFAULT_ZONE_RULES when .tinkerman/config.md is missing (R4.2)", () => {
    const root = tempRoot();
    rmSync(join(root, ".tinkerman", "config.md"), { force: true });
    const rules = loadZoneRegistry(root);
    expect(rules).toHaveLength(DEFAULT_ZONE_RULES.length);
    expect(rules.some((r) => r.pattern === "specs/")).toBe(true);
    expect(rules.some((r) => r.pattern === "plans/")).toBe(true);
    expect(rules.some((r) => r.pattern === "config.md")).toBe(true);
  });

  it("falls back to defaults when config.md has no frozen_zone field (field optional)", () => {
    const root = tempRoot();
    writeFileSync(
      join(root, ".tinkerman", "config.md"),
      '---\nproject: "demo"\ntier: "standard"\n---\n# config\n',
    );
    const rules = loadZoneRegistry(root);
    expect(rules).toHaveLength(DEFAULT_ZONE_RULES.length);
  });

  it("parses the frozen_zone frontmatter list into rules (R4.1 single source of truth)", () => {
    const root = tempRoot();
    writeFileSync(
      join(root, ".tinkerman", "config.md"),
      [
        "---",
        "project: demo",
        "frozen_zone:",
        "  - specs/",
        "  - plans/",
        "  - config.md",
        "  - custom-frozen-dir/",
        "---",
        "# config",
      ].join("\n"),
    );
    const rules = loadZoneRegistry(root);
    expect(rules).toHaveLength(4);
    expect(rules.some((r) => r.pattern === "custom-frozen-dir/")).toBe(true);
    // classifyPattern infers category from the pattern text.
    const custom = rules.find((r) => r.pattern === "custom-frozen-dir/");
    expect(custom?.category).toBe("frozen-spec"); // no spec/plan/config keyword → default frozen-spec
    expect(custom?.reason_code).toBe("ZONE_OVERRIDE_MISSING");
  });

  it("falls back to defaults on unparseable frontmatter (R4.2)", () => {
    const root = tempRoot();
    writeFileSync(join(root, ".tinkerman", "config.md"), "this is not yaml frontmatter at all");
    const rules = loadZoneRegistry(root);
    expect(rules).toHaveLength(DEFAULT_ZONE_RULES.length);
  });
});

describe("loadZoneRegistryCached (R4.5 in-process cache)", () => {
  it("returns the same parsed result on repeated calls with the same root", () => {
    const root = tempRoot();
    writeFileSync(join(root, ".tinkerman", "config.md"), "---\nfrozen_zone:\n  - specs/\n---\n");
    const first = loadZoneRegistryCached(root);
    const second = loadZoneRegistryCached(root);
    expect(second).toBe(first); // same reference → cache hit
  });

  it("re-parses when the forgeRoot changes (cache invalidates)", () => {
    const rootA = tempRoot();
    const rootB = tempRoot();
    writeFileSync(join(rootA, ".tinkerman", "config.md"), "---\nfrozen_zone:\n  - specs/\n---\n");
    writeFileSync(join(rootB, ".tinkerman", "config.md"), "---\nfrozen_zone:\n  - plans/\n---\n");
    const a = loadZoneRegistryCached(rootA);
    const b = loadZoneRegistryCached(rootB);
    expect(a).not.toBe(b);
    expect(a[0].pattern).toBe("specs/");
    expect(b[0].pattern).toBe("plans/");
  });
});

describe("formatZoneRegistry (R4.4 flat listing)", () => {
  it("renders <pattern> <category> <reason_code> rows", () => {
    const out = formatZoneRegistry([
      { pattern: "specs/", category: "frozen-spec", reason_code: "SPEC_LOCKED" },
      { pattern: "config.md", category: "frozen-config", reason_code: "CONFIG_ROOT" },
    ]);
    expect(out).toContain("specs/ frozen-spec SPEC_LOCKED");
    expect(out).toContain("config.md frozen-config CONFIG_ROOT");
    expect(out.split("\n")).toHaveLength(2);
  });
});
