import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetGateForTest, CMUX_GATED_SUBS, checkCmuxGate, } from "../../src/forge-dispatcher/cmux-gate.js";
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
            statSync: makeStatSocket,
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
            statSync: statSpy,
        });
        expect(r.ok).toBe(true);
        if (r.ok)
            expect(r.gate_result).toBe("go");
        expect(statSpy).toHaveBeenCalledTimes(1);
    });
    it("gated sub + socket missing → blocked (socket_missing)", () => {
        const statSpy = vi.fn().mockImplementation(statEnoent);
        const r = checkCmuxGate("forge-cmux-loop-signals", {
            env: {},
            statSync: statSpy,
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
            statSync: statSpy,
        });
        expect(r.ok).toBe(false);
        if (!r.ok)
            expect(r.reason).toBe("socket_not_socket");
    });
    it("gated sub + CMUX_INTEGRATION=off → blocked (integration_off)", () => {
        const r = checkCmuxGate("forge-cmux-browser-qa", {
            env: { CMUX_INTEGRATION: "off" },
            statSync: makeStatSocket,
        });
        expect(r.ok).toBe(false);
        if (!r.ok)
            expect(r.reason).toBe("integration_off");
    });
    it("gated sub + invalid socket path → blocked (socket_path_invalid)", () => {
        const r = checkCmuxGate("forge-cmux-loop-signals", {
            env: { CMUX_SOCKET_PATH: "/etc/passwd" },
            statSync: makeStatSocket,
        });
        expect(r.ok).toBe(false);
        if (!r.ok)
            expect(r.reason).toBe("socket_path_invalid");
    });
    it("sticky: second call short-circuits without stat", () => {
        const statSpy = vi.fn().mockImplementation(statEnoent);
        checkCmuxGate("forge-cmux-sidebar-sync", {
            env: {},
            statSync: statSpy,
        });
        const r = checkCmuxGate("forge-cmux-browser-qa", {
            env: {},
            statSync: statSpy,
        });
        expect(r.ok).toBe(false);
        if (!r.ok)
            expect(r.reason).toBe("sticky_unavailable");
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
            statSync: makeStatSocket,
        });
        expect(r.ok).toBe(false);
        if (!r.ok)
            expect(r.reason).toBe("socket_path_invalid");
    });
    // P4 FIX: stickyUnavailable must self-heal. A single transient socket_missing
    // permanently returned SKILL_UNAVAILABLE for the whole process lifetime,
    // even after the socket recovered. Sticky should expire (TTL) so a transient
    // outage doesn't permanently disable cmux-gated subs.
    it("sticky self-heals after TTL expires (transient outage recovers)", () => {
        let now = 1_000_000;
        const clock = () => now;
        const statSpy = vi.fn().mockImplementation(statEnoent);
        // t0: socket down → blocked, latches sticky.
        const r0 = checkCmuxGate("forge-cmux-sidebar-sync", {
            env: {},
            statSync: statSpy,
            now: clock,
        });
        expect(r0.ok).toBe(false);
        expect(statSpy).toHaveBeenCalledTimes(1);
        // t1 (before TTL): still sticky-short-circuited, no new stat.
        const r1 = checkCmuxGate("forge-cmux-browser-qa", {
            env: {},
            statSync: statSpy,
            now: clock,
        });
        expect(r1.ok).toBe(false);
        if (!r1.ok)
            expect(r1.reason).toBe("sticky_unavailable");
        expect(statSpy).toHaveBeenCalledTimes(1);
        // socket recovers, AND TTL has elapsed → re-probe succeeds → go.
        statSpy.mockReturnValue(makeStatSocket());
        now += 61_000; // default TTL 60s
        const r2 = checkCmuxGate("forge-cmux-loop-signals", {
            env: {},
            statSync: statSpy,
            now: clock,
        });
        expect(r2.ok).toBe(true);
        if (r2.ok)
            expect(r2.gate_result).toBe("go");
        expect(statSpy).toHaveBeenCalledTimes(2);
    });
    it("sticky still short-circuits within TTL (performance preserved)", () => {
        let now = 5_000_000;
        const statSpy = vi.fn().mockImplementation(statEnoent);
        checkCmuxGate("forge-cmux-sidebar-sync", {
            env: {},
            statSync: statSpy,
            now: () => now,
        });
        now += 10_000; // well within 60s TTL
        const r = checkCmuxGate("forge-cmux-browser-qa", {
            env: {},
            statSync: statSpy,
            now: () => now,
        });
        expect(r.ok).toBe(false);
        if (!r.ok)
            expect(r.reason).toBe("sticky_unavailable");
        expect(statSpy).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=cmux-gate.test.js.map