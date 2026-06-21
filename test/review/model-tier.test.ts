import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIER_MAP,
  type ModelTier,
  parseModelTierMap,
  renderDispatchLine,
  resolveModelTier,
} from "../../src/review/model-tier.js";

describe("parseModelTierMap", () => {
  it("returns DEFAULT_TIER_MAP when input is undefined/empty", () => {
    expect(parseModelTierMap(undefined)).toEqual(DEFAULT_TIER_MAP);
    expect(parseModelTierMap("")).toEqual(DEFAULT_TIER_MAP);
    expect(parseModelTierMap(null as unknown as string)).toEqual(DEFAULT_TIER_MAP);
  });

  it("reads all four tiers from config fragment", () => {
    const raw = `
review_model_tier_map:
  cheap: "haiku"
  standard: "sonnet"
  capable: "opus"
  inherit: "inherit"
`;
    const map = parseModelTierMap(raw);
    expect(map.cheap).toBe("haiku");
    expect(map.standard).toBe("sonnet");
    expect(map.capable).toBe("opus");
    expect(map.inherit).toBe("inherit");
  });

  it("tolerates unquoted values", () => {
    const map = parseModelTierMap("cheap: flash\nstandard: pro");
    expect(map.cheap).toBe("flash");
    expect(map.standard).toBe("pro");
  });

  it("keeps DEFAULT_TIER_MAP values for tiers not mentioned", () => {
    const map = parseModelTierMap("cheap: flash");
    expect(map.cheap).toBe("flash");
    expect(map.standard).toBe(DEFAULT_TIER_MAP.standard);
    expect(map.capable).toBe(DEFAULT_TIER_MAP.capable);
  });

  it("ignores unknown tier keys", () => {
    const map = parseModelTierMap("ultra: gpt-99\ncheap: haiku");
    expect(map.cheap).toBe("haiku");
    expect((map as Record<string, string>).ultra).toBeUndefined();
  });
});

describe("resolveModelTier", () => {
  const supportsAll = (_model: string) => true;
  const supportsNone = (model: string) => model === "inherit";

  it("resolves each tier to its mapped model when supported", () => {
    const map = { cheap: "haiku", standard: "sonnet", capable: "opus", inherit: "inherit" };
    for (const tier of ["cheap", "standard", "capable"] as ModelTier[]) {
      const r = resolveModelTier({ tier, tierMap: map, harnessSupports: supportsAll });
      expect(r.kind).toBe("resolved");
      expect(r.tier).toBe(tier);
    }
  });

  it("treats undefined tier as inherit", () => {
    const r = resolveModelTier({
      tier: undefined,
      tierMap: DEFAULT_TIER_MAP,
      harnessSupports: supportsNone,
    });
    expect(r.kind).toBe("resolved");
    expect(r.tier).toBe("inherit");
    expect(r.model).toBe("inherit");
  });

  it("fails open to inherit when harness does not support the model", () => {
    const r = resolveModelTier({
      tier: "cheap",
      tierMap: { ...DEFAULT_TIER_MAP, cheap: "haiku" },
      harnessSupports: supportsNone,
    });
    expect(r.kind).toBe("fallback");
    if (r.kind !== "fallback") throw new Error("expected fallback");
    expect(r.model).toBe("inherit");
    expect(r.fell_back).toBe(true);
    expect(r.requested).toBe("haiku");
    expect(r.reason).toContain("haiku");
  });

  it("inherit tier always resolves regardless of harness support", () => {
    const r = resolveModelTier({
      tier: "inherit",
      tierMap: DEFAULT_TIER_MAP,
      harnessSupports: supportsNone,
    });
    expect(r.kind).toBe("resolved");
    expect(r.model).toBe("inherit");
  });

  it("falls back when tier maps to unknown model and tierMap has no entry", () => {
    const map = { cheap: "", standard: "sonnet", capable: "inherit", inherit: "inherit" } as Record<
      ModelTier,
      string
    >;
    // empty string → treated as inherit by default merge
    const merged = { ...DEFAULT_TIER_MAP, ...map };
    const r = resolveModelTier({ tier: "cheap", tierMap: merged, harnessSupports: supportsNone });
    // empty maps to undefined → "inherit"
    expect(r.model).toBe("inherit");
  });
});

describe("renderDispatchLine", () => {
  it("renders resolved line as `<agent>: <tier> → <model>`", () => {
    const line = renderDispatchLine("spec-check", {
      kind: "resolved",
      tier: "cheap",
      model: "haiku",
      fell_back: false,
    });
    expect(line).toBe("spec-check: cheap → haiku");
  });

  it("appends fallback warning when fell back", () => {
    const line = renderDispatchLine("spec-check", {
      kind: "fallback",
      tier: "cheap",
      requested: "haiku",
      model: "inherit",
      fell_back: true,
      reason: "model haiku for tier cheap not supported by harness",
    });
    expect(line).toContain("spec-check: cheap → inherit");
    expect(line).toContain("⚠ model_tier cheap → haiku 不被支持，回退 inherit");
  });
});
