import { describe, expect, it, vi } from "vitest";
import { parsePolicyProfileConfig } from "../src/config.js";

describe("policy profile config", () => {
  it("defaults missing policy_profile to team", () => {
    expect(parsePolicyProfileConfig(undefined)).toEqual({
      policy_profile: "team",
      diagnostics: [],
    });
    expect(parsePolicyProfileConfig("---\nreview.subagent_concurrency: 3\n---\n")).toEqual({
      policy_profile: "team",
      diagnostics: [],
    });
  });

  it("parses solo, team, and enterprise profiles", () => {
    expect(parsePolicyProfileConfig("policy_profile: solo").policy_profile).toBe("solo");
    expect(parsePolicyProfileConfig("policy_profile: team").policy_profile).toBe("team");
    expect(parsePolicyProfileConfig("policy_profile: enterprise").policy_profile).toBe(
      "enterprise",
    );
  });

  it("falls back safely with a diagnostic for invalid values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const parsed = parsePolicyProfileConfig("policy_profile: ultra");

    expect(parsed.policy_profile).toBe("team");
    expect(parsed.diagnostics).toEqual([
      {
        code: "INVALID_POLICY_PROFILE",
        message: "policy_profile invalid in config.md (ultra); falling back to team",
      },
    ]);
    expect(warn).toHaveBeenCalledWith(
      "policy_profile invalid in config.md (ultra); falling back to team",
    );

    warn.mockRestore();
  });
});
