import { describe, it, expect } from "vitest";
import { validateTopic, ALLOW_LIST } from "../../src/forge-dispatcher/allowlist.js";

describe("allowlist", () => {
  it("should contain all expected subcommands", () => {
    expect(ALLOW_LIST).toContain("build");
    expect(ALLOW_LIST).toContain("plan");
    expect(ALLOW_LIST).toContain("review");
    expect(ALLOW_LIST).toContain("decide");
  });

  it("should reject unknown subcommands", () => {
    const result = validateTopic("nonexistent-command");
    expect(result.ok).toBe(false);
  });

  it("should suggest close matches for typos", () => {
    const result = validateTopic("buid");
    if (!result.ok) {
      expect(result.suggestion).toBe("build");
    }
  });

  it('should accept "charter" as valid subcommand', () => {
    const result = validateTopic("charter");
    expect(result).toEqual({ ok: true, value: "charter" });
  });
});
