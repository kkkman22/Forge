/**
 * P2 R4 (T8): host-aware version gating — Zcode bypasses the CC semver gate.
 *
 * The Claude Code semver gate (compatibility.ts checkClaudeVersion) must only
 * produce a `fail` verdict on the Claude host. On Zcode there is no Claude CLI
 * to version-check, so the host-aware wrapper downgrades fail → warn
 * (informational), preserving the Claude-side gate byte-for-byte.
 *
 * Validates: requirements R4-AC3, R4-AC4 (compatibility).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { checkClaudeVersion, checkHostVersion, FORGE_VERSION_RANGE } from "../../src/compatibility";
import { resetHostAdapter } from "../../src/host/detect";

const ENV_KEYS = ["ZCODE_PLUGIN_ROOT", "ZCODE_SESSION_ID", "CLAUDE_PLUGIN_ROOT"];

describe("checkClaudeVersion — unchanged CC gate (Claude host)", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    resetHostAdapter();
  });

  it("fails when Claude version is below minimum", () => {
    const r = checkClaudeVersion("2.1.100", FORGE_VERSION_RANGE);
    expect(r.verdict).toBe("fail");
  });

  it("passes when Claude version meets minimum", () => {
    const r = checkClaudeVersion("2.1.163", FORGE_VERSION_RANGE);
    expect(r.verdict).toBe("pass");
  });
});

describe("checkHostVersion — Zcode bypasses CC semver gate", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    resetHostAdapter();
  });

  it("Claude host + low version → fail (gate applies)", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/cc"; // Claude host signal-free → claude-code
    const r = checkHostVersion("2.1.100", FORGE_VERSION_RANGE);
    expect(r.verdict).toBe("fail");
  });

  it("Zcode host + any version → not fail (bypass; warn/unknown allowed)", () => {
    process.env.ZCODE_PLUGIN_ROOT = "/zc";
    // Even a "below minimum" Claude version must not fail on Zcode.
    const r = checkHostVersion("2.1.100", FORGE_VERSION_RANGE);
    expect(r.verdict).not.toBe("fail");
  });

  it("Zcode host + null version → not fail (no Claude CLI to check)", () => {
    process.env.ZCODE_PLUGIN_ROOT = "/zc";
    const r = checkHostVersion(null, FORGE_VERSION_RANGE);
    expect(r.verdict).not.toBe("fail");
  });

  it("Claude host + passing version → pass (gate byte-equal)", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/cc";
    const r = checkHostVersion("2.1.163", FORGE_VERSION_RANGE);
    expect(r.verdict).toBe("pass");
  });
});
