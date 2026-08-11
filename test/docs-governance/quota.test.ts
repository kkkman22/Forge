import { describe, expect, it } from "vitest";
import { checkQuota, countDocPairs } from "../../src/docs-governance/quota.js";
import type { Config } from "../../src/docs-governance/types.js";

describe("countDocPairs", () => {
  it("counts md files as pairs (cn+en=1)", () => {
    const files = ["docs/guide.md", "docs/guide.en.md", "docs/api.md"];
    const result = countDocPairs(files);
    expect(result.count).toBe(2); // guide pair + api solo
  });

  it("excludes INDEX*.md and README.md", () => {
    const files = ["docs/guide.md", "docs/INDEX.md", "docs/INDEX.en.md", "docs/README.md"];
    const result = countDocPairs(files);
    expect(result.count).toBe(1); // only guide.md
  });

  it("excludes .mdx files", () => {
    const files = ["docs/guide.md", "docs/component.mdx"];
    const result = countDocPairs(files);
    expect(result.count).toBe(1);
  });
});

describe("checkQuota", () => {
  const baseConfig = (maxCount: number): Config => ({
    docs: {
      max_count: maxCount,
      root_whitelist: [],
      ssot_sources: [],
    },
    staleness: {
      warning_days: 90,
      critical_days: 180,
      exempt_paths: [],
      warning_log_cap: 50,
    },
    diagnosticsFromConfigLoad: [],
  });

  it("passes when count < max_count - 1", () => {
    const files = ["docs/a.md"];
    const diags = checkQuota(files, baseConfig(30));
    expect(diags).toHaveLength(0);
  });

  it("warns when count = max_count - 1", () => {
    const files = ["docs/a.md"];
    const diags = checkQuota(files, baseConfig(2));
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe("warning");
  });

  it("errors when count >= max_count", () => {
    const files = ["docs/a.md", "docs/b.md"];
    const diags = checkQuota(files, baseConfig(2));
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.some((d) => d.severity === "error")).toBe(true);
  });

  it("errors when --allow-grow used without ADR path", () => {
    const files = ["docs/a.md", "docs/b.md"];
    const diags = checkQuota(files, baseConfig(1), { allowGrow: "true" });
    expect(diags.some((d) => d.severity === "error")).toBe(true);
    expect(diags.some((d) => d.code === "QUOTA_ALLOW_GROW_NO_ADR")).toBe(true);
  });

  it("accepts --allow-grow with valid ADR path", () => {
    const files = ["docs/a.md", "docs/b.md"];
    const diags = checkQuota(files, baseConfig(1), {
      allowGrow: ".tinkerman/decisions/ADR-0042-quota-raise.md",
    });
    // Should not have the NO_ADR error
    expect(diags.every((d) => d.code !== "QUOTA_ALLOW_GROW_NO_ADR")).toBe(true);
  });
});
