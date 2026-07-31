/**
 * P2 R3: platform detection + fail-safe + singleton injection.
 *
 * Asserts detection returns the right platform per env signals, fail-safe to
 * Claude, singleton identity, and that signal list matches P1 zcode-platform.mjs.
 *
 * Validates: requirements R3-AC1..AC7.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  detectPlatform,
  getHostAdapter,
  resetHostAdapter,
  ZCODE_HOST_SIGNALS,
} from "../../src/host/detect";

const ALL_SIGNALS = [
  "ZCODE_PLUGIN_ROOT",
  "ZCODE_PROJECT_DIR",
  "ZCODE_SESSION_ID",
  "ZCODE_PLUGIN_DATA",
  "CLAUDE_PLUGIN_ROOT",
  "CLAUDE_CODE_SESSION_ID",
];

describe("detectPlatform", () => {
  beforeEach(() => {
    for (const k of ALL_SIGNALS) delete process.env[k];
    resetHostAdapter();
  });

  it("returns zcode when a ZCODE_* signal is present", () => {
    process.env.ZCODE_PLUGIN_ROOT = "/zc";
    expect(detectPlatform()).toBe("zcode");
  });

  it("returns zcode for ZCODE_SESSION_ID", () => {
    process.env.ZCODE_SESSION_ID = "sid";
    expect(detectPlatform()).toBe("zcode");
  });

  it("returns claude-code when only CLAUDE_* present", () => {
    process.env.CLAUDE_PLUGIN_ROOT = "/cc";
    process.env.CLAUDE_CODE_SESSION_ID = "sid";
    expect(detectPlatform()).toBe("claude-code");
  });

  it("fail-safe: returns claude-code when no signal at all", () => {
    expect(detectPlatform()).toBe("claude-code");
  });
});

describe("ZCODE_HOST_SIGNALS — parity with P1 zcode-platform.mjs", () => {
  // The P1 mjs fallback (scripts/lib/zcode-platform.mjs) and the TS HostAdapter
  // must agree on the ZCode signal list, else detection drifts between layers.
  it("matches the P1 ZCODE_ENV_SIGNALS list exactly", () => {
    expect([...ZCODE_HOST_SIGNALS].sort()).toEqual(
      ["ZCODE_PLUGIN_DATA", "ZCODE_PLUGIN_ROOT", "ZCODE_PROJECT_DIR", "ZCODE_SESSION_ID"].sort(),
    );
  });
});

describe("getHostAdapter singleton", () => {
  beforeEach(() => {
    for (const k of ALL_SIGNALS) delete process.env[k];
    resetHostAdapter();
  });

  it("returns the same instance on repeated calls", () => {
    const a = getHostAdapter();
    const b = getHostAdapter();
    expect(a).toBe(b);
  });

  it("probes once at first call (zcode when signal present)", () => {
    process.env.ZCODE_PLUGIN_ROOT = "/zc";
    const a = getHostAdapter();
    expect(a.platform).toBe("zcode");
    // removing the signal after first call must NOT change the cached instance
    delete process.env.ZCODE_PLUGIN_ROOT;
    const b = getHostAdapter();
    expect(b).toBe(a);
    expect(b.platform).toBe("zcode");
  });

  it("resetHostAdapter forces re-probe", () => {
    process.env.ZCODE_PLUGIN_ROOT = "/zc";
    const a = getHostAdapter();
    expect(a.platform).toBe("zcode");
    resetHostAdapter();
    delete process.env.ZCODE_PLUGIN_ROOT;
    const b = getHostAdapter();
    expect(b).not.toBe(a);
    expect(b.platform).toBe("claude-code");
  });
});
