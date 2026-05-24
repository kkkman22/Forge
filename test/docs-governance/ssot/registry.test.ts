import { describe, expect, it } from "vitest";
import { loadSsotRegistry } from "../../../src/docs-governance/ssot/registry.js";
import type { Config, DiagnosticRecord, SsotRegistryEntry } from "../../../src/docs-governance/types.js";

const EMPTY_FILE = "" as string & { readonly [Symbol.uniqueSymbol]: void };

function makeConfig(overrides: Partial<Config["docs"]> = {}): Config {
  return {
    docs: {
      max_count: 30,
      root_whitelist: ["README.md"],
      ssot_sources: [],
      ...overrides,
    },
    staleness: {
      warning_days: 90,
      critical_days: 180,
      exempt_paths: [],
      warning_log_cap: 50,
    },
    diagnosticsFromConfigLoad: [],
  };
}

describe("loadSsotRegistry", () => {
  // ─── Happy path ───────────────────────────────────────
  it("returns entries from config.docs.ssot_sources", () => {
    const sources: readonly SsotRegistryEntry[] = [
      { topic: "commands", source: "commands/*.md", renderer: "commands-table" },
      { topic: "routing", source: "docs/_ssot/routing.json", renderer: "routing-table" },
    ];
    const config = makeConfig({ ssot_sources: sources });
    const { entries, diagnostics } = loadSsotRegistry(config);
    expect(entries).toHaveLength(2);
    expect(entries[0].topic).toBe("commands");
    expect(entries[1].topic).toBe("routing");
    expect(diagnostics).toHaveLength(0);
  });

  // ─── Missing config → defaults + warning ─────────────
  it("returns 4 default entries when ssot_sources is empty", () => {
    const config = makeConfig({ ssot_sources: [] });
    const { entries, diagnostics } = loadSsotRegistry(config);
    // config.ts provides 4 defaults — but here we pass [] so no entries come from config
    // loadSsotRegistry should detect empty and provide defaults
    expect(entries).toHaveLength(4);
    expect(diagnostics.some((d) => d.severity === "warning")).toBe(true);
  });

  it("returns 4 default entries when ssot_sources is undefined", () => {
    const config = makeConfig({ ssot_sources: undefined as unknown as readonly SsotRegistryEntry[] });
    const { entries, diagnostics } = loadSsotRegistry(config);
    expect(entries).toHaveLength(4);
    expect(diagnostics.some((d) => d.severity === "warning")).toBe(true);
  });

  // ─── Reserved topic prefix rejection ─────────────────
  it("rejects topics with reserved prefix 'internal-'", () => {
    const sources: readonly SsotRegistryEntry[] = [
      { topic: "internal-secrets", source: "secrets.json", renderer: "raw" },
      { topic: "valid-topic", source: "valid.json", renderer: "raw" },
    ];
    const config = makeConfig({ ssot_sources: sources });
    const { entries, diagnostics } = loadSsotRegistry(config);
    expect(entries).toHaveLength(1);
    expect(entries[0].topic).toBe("valid-topic");
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("internal-"))).toBe(true);
  });

  it("rejects topics with reserved prefix 'debug-'", () => {
    const sources: readonly SsotRegistryEntry[] = [
      { topic: "debug-trace", source: "trace.json", renderer: "raw" },
    ];
    const config = makeConfig({ ssot_sources: sources });
    const { entries, diagnostics } = loadSsotRegistry(config);
    expect(entries).toHaveLength(0);
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("debug-"))).toBe(true);
  });

  it("rejects topics with reserved prefix 'forge-meta-'", () => {
    const sources: readonly SsotRegistryEntry[] = [
      { topic: "forge-meta-stats", source: "stats.json", renderer: "raw" },
    ];
    const config = makeConfig({ ssot_sources: sources });
    const { entries, diagnostics } = loadSsotRegistry(config);
    expect(entries).toHaveLength(0);
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("forge-meta-"))).toBe(true);
  });

  // ─── Duplicate detection ─────────────────────────────
  it("detects duplicate topics and emits error", () => {
    const sources: readonly SsotRegistryEntry[] = [
      { topic: "commands", source: "a.json", renderer: "table" },
      { topic: "commands", source: "b.json", renderer: "table" },
    ];
    const config = makeConfig({ ssot_sources: sources });
    const { entries, diagnostics } = loadSsotRegistry(config);
    // Only the first occurrence kept
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("a.json");
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("duplicate"))).toBe(true);
  });

  // ─── Renderer validation ─────────────────────────────
  it("validates renderer names against a known registry", () => {
    const sources: readonly SsotRegistryEntry[] = [
      { topic: "valid", source: "v.json", renderer: "commands-table" },
      { topic: "invalid", source: "i.json", renderer: "nonexistent-renderer" },
    ];
    const config = makeConfig({ ssot_sources: sources });
    const knownRenderers = new Set(["commands-table", "routing-table", "security-tiers"]);
    const { entries, diagnostics } = loadSsotRegistry(config, knownRenderers);
    expect(entries).toHaveLength(1);
    expect(entries[0].topic).toBe("valid");
    expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("nonexistent-renderer"))).toBe(true);
  });

  it("accepts all renderers when no registry is passed", () => {
    const sources: readonly SsotRegistryEntry[] = [
      { topic: "custom", source: "c.json", renderer: "custom-renderer" },
    ];
    const config = makeConfig({ ssot_sources: sources });
    const { entries, diagnostics } = loadSsotRegistry(config);
    expect(entries).toHaveLength(1);
    expect(diagnostics).toHaveLength(0);
  });

  // ─── Combined: reserved + duplicate ──────────────────
  it("reports both reserved prefix and duplicate errors", () => {
    const sources: readonly SsotRegistryEntry[] = [
      { topic: "internal-foo", source: "a.json", renderer: "r" },
      { topic: "good", source: "b.json", renderer: "r" },
      { topic: "good", source: "c.json", renderer: "r" },
    ];
    const config = makeConfig({ ssot_sources: sources });
    const { entries, diagnostics } = loadSsotRegistry(config);
    expect(entries).toHaveLength(1);
    expect(entries[0].topic).toBe("good");
    const errors = diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  // ─── Defaults have expected topics ───────────────────
  it("default entries include expected topics", () => {
    const config = makeConfig({ ssot_sources: [] });
    const { entries } = loadSsotRegistry(config);
    const topics = entries.map((e) => e.topic);
    expect(topics).toContain("commands");
    expect(topics).toContain("routing");
    expect(topics).toContain("security-tiers");
    expect(topics).toContain("gate-skills");
  });

  // ─── Diagnostic file field ───────────────────────────
  it("diagnostics include script identifier", () => {
    const sources: readonly SsotRegistryEntry[] = [
      { topic: "internal-bad", source: "x.json", renderer: "r" },
    ];
    const config = makeConfig({ ssot_sources: sources });
    const { diagnostics } = loadSsotRegistry(config);
    for (const d of diagnostics) {
      expect(d.script).toBe("ssot-registry");
    }
  });
});
