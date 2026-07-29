import { describe, expect, it } from "vitest";
import { loadConfigWithDefaults } from "../../src/docs-governance/config.js";

const VALID_CONFIG = `---
docs:
  max_count: 30
  root_whitelist:
    - README.md
    - CHANGELOG.md
    - SECURITY.md
    - CONTRIBUTING.md
    - ROADMAP.md
    - AGENTS.md
    - CLAUDE.md
    - LICENSE.md
  ssot_sources:
    - topic: commands
      source: "commands/*.md"
      renderer: commands-table
    - topic: routing
      source: "docs/_ssot/routing.json"
      renderer: routing-table
    - topic: security-tiers
      source: "docs/_ssot/security-tiers.json"
      renderer: security-tiers
    - topic: gate-skills
      source: "docs/_ssot/gate-skills.json"
      renderer: commands-table
  grace_period_until: "2026-06-15"
staleness:
  warning_days: 90
  critical_days: 180
  exempt_paths:
    - LICENSE.md
    - ROADMAP.md
  warning_log_cap: 50
---
`;

describe("loadConfigWithDefaults", () => {
  it("loads valid config without diagnostics", () => {
    const config = loadConfigWithDefaults(VALID_CONFIG);
    expect(config.docs.max_count).toBe(30);
    expect(config.docs.root_whitelist).toHaveLength(8);
    expect(config.docs.ssot_sources).toHaveLength(4);
    expect(config.docs.grace_period_until).toBe("2026-06-15");
    expect(config.staleness.warning_days).toBe(90);
    expect(config.staleness.critical_days).toBe(180);
    expect(config.staleness.exempt_paths).toEqual(["LICENSE.md", "ROADMAP.md"]);
    expect(config.staleness.warning_log_cap).toBe(50);
    expect(config.diagnosticsFromConfigLoad).toHaveLength(0);
  });

  it("falls back to defaults when config is empty", () => {
    const config = loadConfigWithDefaults("");
    expect(config.docs.max_count).toBe(30);
    expect(config.docs.root_whitelist).toHaveLength(9);
    expect(config.docs.ssot_sources).toHaveLength(4);
    expect(config.staleness.warning_days).toBe(90);
    expect(config.staleness.critical_days).toBe(180);
    expect(config.staleness.warning_log_cap).toBe(50);
    // All fields should generate warnings
    expect(config.diagnosticsFromConfigLoad.length).toBeGreaterThan(0);
    for (const d of config.diagnosticsFromConfigLoad) {
      expect(d.severity).toBe("warning");
    }
  });

  it("falls back to defaults when frontmatter is missing fields", () => {
    const partial = `---\ndocs:\n  max_count: 50\n---\n`;
    const config = loadConfigWithDefaults(partial);
    expect(config.docs.max_count).toBe(50);
    expect(config.staleness.warning_days).toBe(90); // default
    expect(config.diagnosticsFromConfigLoad.length).toBeGreaterThan(0);
  });

  it("warns on invalid max_count (out of range)", () => {
    const invalid = VALID_CONFIG.replace("max_count: 30", "max_count: 0");
    const config = loadConfigWithDefaults(invalid);
    expect(config.docs.max_count).toBe(30); // default
    const diag = config.diagnosticsFromConfigLoad.find((d) => d.code === "CONFIG_FIELD_INVALID");
    expect(diag).toBeDefined();
  });

  it("warns on invalid max_count (too large)", () => {
    const invalid = VALID_CONFIG.replace("max_count: 30", "max_count: 5000");
    const config = loadConfigWithDefaults(invalid);
    expect(config.docs.max_count).toBe(30);
  });

  it("warns on non-number max_count", () => {
    const invalid = VALID_CONFIG.replace("max_count: 30", "max_count: abc");
    const config = loadConfigWithDefaults(invalid);
    expect(config.docs.max_count).toBe(30);
  });

  it("warns on invalid warning_days (out of range)", () => {
    const invalid = VALID_CONFIG.replace("warning_days: 90", "warning_days: 0");
    const config = loadConfigWithDefaults(invalid);
    expect(config.staleness.warning_days).toBe(90);
  });

  it("warns on invalid critical_days (out of range)", () => {
    const invalid = VALID_CONFIG.replace("critical_days: 180", "critical_days: 1000");
    const config = loadConfigWithDefaults(invalid);
    expect(config.staleness.critical_days).toBe(180);
  });

  it("never throws — returns defaults on parse failure", () => {
    const config = loadConfigWithDefaults("not yaml at all {{{");
    expect(config.docs.max_count).toBe(30);
    expect(config.diagnosticsFromConfigLoad.length).toBeGreaterThan(0);
  });

  it("preserves valid grace_period_until", () => {
    const config = loadConfigWithDefaults(VALID_CONFIG);
    expect(config.docs.grace_period_until).toBe("2026-06-15");
  });

  it("defaults grace_period_until to undefined", () => {
    const noGrace = VALID_CONFIG.replace('  grace_period_until: "2026-06-15"\n', "");
    const config = loadConfigWithDefaults(noGrace);
    expect(config.docs.grace_period_until).toBeUndefined();
  });

  it("falls back to default ssot_sources when missing", () => {
    const noSsot = VALID_CONFIG.replace(/ {2}ssot_sources:\n( {4}- .*\n)*/g, "");
    const config = loadConfigWithDefaults(noSsot);
    expect(config.docs.ssot_sources).toHaveLength(4);
  });

  it("warns on non-array root_whitelist", () => {
    const invalid = VALID_CONFIG.replace(
      "root_whitelist:\n    - README.md\n    - CHANGELOG.md\n    - SECURITY.md\n    - CONTRIBUTING.md\n    - ROADMAP.md\n    - AGENTS.md\n    - CLAUDE.md\n    - LICENSE.md",
      "root_whitelist: not-an-array",
    );
    const config = loadConfigWithDefaults(invalid);
    expect(config.docs.root_whitelist).toHaveLength(9); // default (incl. README.en.md)
  });
});
