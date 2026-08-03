/**
 * P2 R1: HostAdapter interface + Claude/Zcode implementations.
 *
 * Asserts structural properties (platform, hookEvents, subagentTier) and the
 * paths()/sessionId()/hostVersion() resolution under simulated env.
 *
 * Validates: requirements R1-AC1, R1-AC2, R1-AC4, R1-AC5, R1-AC6, R1-AC7.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAUDE_CAPABILITIES, GLM52_CAPABILITIES } from "../../src/host/capabilities";
import { ClaudeAdapter } from "../../src/host/claude-adapter";
import { ZcodeAdapter } from "../../src/host/zcode-adapter";

const ENV_KEYS = [
  "CLAUDE_PLUGIN_ROOT",
  "CLAUDE_PLUGIN_DATA",
  "CLAUDE_PROJECT_DIR",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_SESSION_ID",
  "ZCODE_PLUGIN_ROOT",
  "ZCODE_PLUGIN_DATA",
  "ZCODE_PROJECT_DIR",
  "ZCODE_SESSION_ID",
];

describe("ClaudeAdapter", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it("reports claude-code platform + workspace subagent tier", () => {
    const a = new ClaudeAdapter();
    expect(a.platform).toBe("claude-code");
    expect(a.subagentTier()).toBe("workspace");
  });

  it("exposes the full hook event set incl PreCompact/SubagentStop", () => {
    const a = new ClaudeAdapter();
    const ev = a.hookEvents();
    expect(ev.has("PreCompact")).toBe(true);
    expect(ev.has("SubagentStop")).toBe(true);
    expect(ev.has("SessionStart")).toBe(true);
    expect(ev.has("Stop")).toBe(true);
  });

  it("returns CLAUDE_CAPABILITIES from modelCapabilities()", () => {
    expect(new ClaudeAdapter().modelCapabilities()).toEqual(CLAUDE_CAPABILITIES);
  });

  it("paths() reads CLAUDE_* env vars", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/cc/root";
    process.env.CLAUDE_PLUGIN_DATA = "/cc/data";
    process.env.CLAUDE_PROJECT_DIR = "/cc/project";
    const p = new ClaudeAdapter().paths();
    expect(p.pluginRoot).toBe("/cc/root");
    expect(p.pluginData).toBe("/cc/data");
    expect(p.projectDir).toBe("/cc/project");
  });

  it("paths() returns nulls when env absent", () => {
    const p = new ClaudeAdapter().paths();
    expect(p.pluginRoot).toBeNull();
    expect(p.pluginData).toBeNull();
  });

  it("sessionId() walks the CLAUDE priority chain", () => {
    process.env.CLAUDE_CODE_SESSION_ID = "sid-cc";
    expect(new ClaudeAdapter().sessionId()).toBe("sid-cc");
    delete process.env.CLAUDE_CODE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = "sid-leg";
    expect(new ClaudeAdapter().sessionId()).toBe("sid-leg");
  });

  it("hostVersion() reads CC version", () => {
    const v = new ClaudeAdapter().hostVersion();
    expect(v.name).toBe("claude-code");
  });
});

describe("ZcodeAdapter", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it("reports zcode platform + global-only subagent tier", () => {
    const a = new ZcodeAdapter();
    expect(a.platform).toBe("zcode");
    expect(a.subagentTier()).toBe("global-only");
  });

  it("exposes the 7-event subset, no PreCompact/SubagentStop", () => {
    const a = new ZcodeAdapter();
    const ev = a.hookEvents();
    expect(ev.has("PreCompact")).toBe(false);
    expect(ev.has("SubagentStop")).toBe(false);
    expect(ev.has("SessionStart")).toBe(true);
    expect(ev.has("UserPromptSubmit")).toBe(true);
    expect(ev.has("PreToolUse")).toBe(true);
    expect(ev.has("PostToolUse")).toBe(true);
    expect(ev.has("Stop")).toBe(true);
    expect(ev.size).toBe(7);
  });

  it("returns GLM52_CAPABILITIES from modelCapabilities()", () => {
    expect(new ZcodeAdapter().modelCapabilities()).toEqual(GLM52_CAPABILITIES);
  });

  it("paths() prefers ZCODE_* over CLAUDE_*", () => {
    process.env.ZCODE_PLUGIN_ROOT = "/zc/root";
    process.env.ZCODE_PLUGIN_DATA = "/zc/data";
    process.env.ZCODE_PROJECT_DIR = "/zc/project";
    process.env.CLAUDE_PLUGIN_ROOT = "/cc/root"; // must be ignored when ZCODE present
    const p = new ZcodeAdapter().paths();
    expect(p.pluginRoot).toBe("/zc/root");
    expect(p.pluginData).toBe("/zc/data");
    expect(p.projectDir).toBe("/zc/project");
  });

  it("paths() falls back to CLAUDE_* when ZCODE_* absent (compat injection)", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/cc/root";
    const p = new ZcodeAdapter().paths();
    expect(p.pluginRoot).toBe("/cc/root");
  });

  it("sessionId() prefers ZCODE_SESSION_ID then falls back to CLAUDE chain", () => {
    process.env.ZCODE_SESSION_ID = "sid-zc";
    process.env.CLAUDE_CODE_SESSION_ID = "sid-cc";
    expect(new ZcodeAdapter().sessionId()).toBe("sid-zc");
    delete process.env.ZCODE_SESSION_ID;
    expect(new ZcodeAdapter().sessionId()).toBe("sid-cc");
  });

  it("hostVersion() reports zcode, no CC semver gate", () => {
    const v = new ZcodeAdapter().hostVersion();
    expect(v.name).toBe("zcode");
  });
});
