import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetGateForTest,
  CMUX_GATED_SUBS,
  checkCmuxGate,
} from "../../src/forge-dispatcher/cmux-gate.js";

const makeStatSocket = () => ({ isSocket: () => true });
const makeStatFile = () => ({ isSocket: () => false });
const statEnoent = () => {
  throw new Error("ENOENT");
};

describe("cmux-gate", () => {
  beforeEach(() => {
    __resetGateForTest();
  });

  it("non-gated sub returns n_a", () => {
    const r = checkCmuxGate("build");
    expect(r).toEqual({ ok: true, gate_result: "n_a", cmux_available: null });
  });

  it("gated sub + CMUX_WORKSPACE_ID → go", () => {
    const r = checkCmuxGate("forge-cmux-sidebar-sync", {
      env: { CMUX_WORKSPACE_ID: "ws-1" },
      statSync: makeStatSocket as any,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.gate_result).toBe("go");
      expect(r.cmux_available).toBe(true);
    }
  });

  it("gated sub + socket exists → go", () => {
    const statSpy = vi.fn().mockReturnValue(makeStatSocket());
    const r = checkCmuxGate("forge-cmux-browser-qa", {
      env: {},
      statSync: statSpy as any,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.gate_result).toBe("go");
    expect(statSpy).toHaveBeenCalledTimes(1);
  });

  it("gated sub + socket missing → blocked (socket_missing)", () => {
    const statSpy = vi.fn().mockImplementation(statEnoent);
    const r = checkCmuxGate("forge-cmux-loop-signals", {
      env: {},
      statSync: statSpy as any,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("SKILL_UNAVAILABLE");
      expect(r.reason).toBe("socket_missing");
      expect(r.gate_result).toBe("blocked");
      expect(r.cmux_available).toBe(false);
    }
  });

  it("gated sub + path is file not socket → blocked (socket_not_socket)", () => {
    const statSpy = vi.fn().mockReturnValue(makeStatFile());
    const r = checkCmuxGate("forge-cmux-sidebar-sync", {
      env: {},
      statSync: statSpy as any,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("socket_not_socket");
  });

  it("gated sub + CMUX_INTEGRATION=off → blocked (integration_off)", () => {
    const r = checkCmuxGate("forge-cmux-browser-qa", {
      env: { CMUX_INTEGRATION: "off" },
      statSync: makeStatSocket as any,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("integration_off");
  });

  it("gated sub + invalid socket path → blocked (socket_path_invalid)", () => {
    const r = checkCmuxGate("forge-cmux-loop-signals", {
      env: { CMUX_SOCKET_PATH: "/etc/passwd" },
      statSync: makeStatSocket as any,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("socket_path_invalid");
  });

  it("sticky: second call short-circuits without stat", () => {
    const statSpy = vi.fn().mockImplementation(statEnoent);
    checkCmuxGate("forge-cmux-sidebar-sync", {
      env: {},
      statSync: statSpy as any,
    });
    const r = checkCmuxGate("forge-cmux-browser-qa", {
      env: {},
      statSync: statSpy as any,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("sticky_unavailable");
    expect(statSpy).toHaveBeenCalledTimes(1);
  });

  it("CMUX_GATED_SUBS contains exactly 3 items", () => {
    expect(CMUX_GATED_SUBS.size).toBe(3);
    expect(CMUX_GATED_SUBS.has("forge-cmux-sidebar-sync")).toBe(true);
    expect(CMUX_GATED_SUBS.has("forge-cmux-browser-qa")).toBe(true);
    expect(CMUX_GATED_SUBS.has("forge-cmux-loop-signals")).toBe(true);
  });

  it("socket path with .. traversal → blocked (socket_path_invalid)", () => {
    const r = checkCmuxGate("forge-cmux-sidebar-sync", {
      env: { CMUX_SOCKET_PATH: "/tmp/../etc/passwd" },
      statSync: makeStatSocket as any,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("socket_path_invalid");
  });
});
