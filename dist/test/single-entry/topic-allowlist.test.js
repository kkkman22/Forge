import { describe, it, expect } from "vitest";
import { dispatchForgeSubcommand } from "../../src/forge-dispatcher.js";
const VALID = [
    "build",
    "review",
    "plan",
    "ship",
    "learn",
    "decide",
    "spec",
    "test",
    "debug",
    "loop",
    "status",
    "resume",
    "abort",
    "fix",
    "refactor",
    "router",
    "verify",
    "accept",
    "recap",
    "zoom-out",
    "mutate",
    "grill",
    "storm",
    "control-cli",
    "control-ui",
    "decide-teams",
    "build-light",
    "fix-conflicts",
    "pack",
];
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
describe("R2.1: topic allowlist enforces 29 sub names", () => {
    it.each(VALID)("accepts valid sub: %s", async (sub) => {
        const r = await dispatchForgeSubcommand(sub, { mode: "test" });
        expect(r.code).not.toBe("E_UNKNOWN_SUB");
    });
    it.each(ATTACKS)("rejects attack: %s", async (attack) => {
        const r = await dispatchForgeSubcommand(attack, { mode: "test" });
        expect(r.code).toBe("E_UNKNOWN_SUB");
    });
});
//# sourceMappingURL=topic-allowlist.test.js.map