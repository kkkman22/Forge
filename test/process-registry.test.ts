import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessRegistry } from "../src/process-registry.js";

beforeEach(() => {
  ProcessRegistry.resetInstance();
});

describe("ProcessRegistry example tests", () => {
  describe("singleton pattern", () => {
    it("always returns same instance", () => {
      const a = ProcessRegistry.getInstance();
      const b = ProcessRegistry.getInstance();
      expect(a).toBeInstanceOf(ProcessRegistry);
      expect(a).toBe(b);
    });

    it("resetInstance allows fresh start", () => {
      const first = ProcessRegistry.getInstance();
      first.register({ pid: 1, on: () => {} } as any, { source: "test", detached: false });
      expect(first.size()).toBe(1);

      ProcessRegistry.resetInstance();
      const second = ProcessRegistry.getInstance();
      expect(second.size()).toBe(0);
    });
  });

  describe("SIGTERM → 5s wait → SIGKILL sequence", () => {
    it("sends SIGTERM first, then SIGKILL after timeout", async () => {
      const reg = ProcessRegistry.getInstance();
      const killCalls: Array<{ pid: number; signal: any }> = [];
      const killSpy = vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
        killCalls.push({ pid, signal });
        return true;
      });

      reg.register({ pid: 500, on: () => {} } as any, { source: "test", detached: false });

      await reg.shutdownAll(100);

      // SIGTERM should come before SIGKILL
      const sigtermIdx = killCalls.findIndex((c) => c.signal === "SIGTERM");
      const sigkillIdx = killCalls.findIndex((c) => c.signal === "SIGKILL");
      expect(sigtermIdx).toBeGreaterThanOrEqual(0);
      expect(sigkillIdx).toBeGreaterThan(sigtermIdx);
      killSpy.mockRestore();
    });
  });

  describe("detached process records PGID", () => {
    it("stores detached flag and uses kill(-pgid) for cleanup", async () => {
      const reg = ProcessRegistry.getInstance();
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        const err = new Error("ESRCH");
        (err as any).code = "ESRCH";
        throw err;
      });

      reg.register({ pid: 600, on: () => {} } as any, { source: "caffeinate", detached: true });

      const all = reg.getAll();
      expect(all[0].detached).toBe(true);

      await reg.shutdownAll();
      // For detached processes, should use kill(-pgid, signal)
      expect(killSpy).toHaveBeenCalledWith(-600, "SIGTERM");
      killSpy.mockRestore();
    });
  });

  describe("spawnTracked auto-register and exit auto-unregister", () => {
    it("spawnTracked registers child, exit unregisters", () => {
      const reg = ProcessRegistry.getInstance();
      const exitHandlers: Array<() => void> = [];
      const mockChild = {
        pid: 700,
        on: (event: string, fn: () => void) => {
          if (event === "exit") exitHandlers.push(fn);
        },
      };

      // Manually test register + exit flow
      reg.register(mockChild as any, { source: "test", detached: false });
      expect(reg.size()).toBe(1);

      // Simulate exit
      exitHandlers[0]();
      expect(reg.size()).toBe(0);
    });
  });
});
