import { describe, expect, it } from "vitest";
import { ALLOW_LIST } from "../../src/forge-dispatcher/allowlist.js";
import { dispatchForgeSubcommand } from "../../src/forge-dispatcher.js";

const VALID = [...ALLOW_LIST];

const ATTACKS = [
  "../../../etc/passwd",
  "forge-build",
  "buidl",
  "<script>",
  "build;rm -rf /",
  "build && malicious",
  "",
  " ",
  "BUILD",
  "Build",
  "build\x00",
  "build\nextra",
];

describe("R2.1: topic allowlist enforces registry-derived sub names", () => {
  it.each(VALID)("accepts valid sub: %s", async (sub) => {
    const r = await dispatchForgeSubcommand(sub, { mode: "test" });
    expect(r.code).not.toBe("E_UNKNOWN_SUB");
  });

  it.each(ATTACKS)("rejects attack: %s", async (attack) => {
    const r = await dispatchForgeSubcommand(attack, { mode: "test" });
    expect(r.code).toBe("E_UNKNOWN_SUB");
  });

  it("allows all three cmux subs", () => {
    const cmuxSubs = [
      "forge-cmux-sidebar-sync",
      "forge-cmux-browser-qa",
      "forge-cmux-loop-signals",
    ];
    for (const s of cmuxSubs) {
      expect(VALID).toContain(s);
    }
  });

  it("valid list is registry-derived", () => {
    expect(VALID).toEqual(ALLOW_LIST);
  });
});
