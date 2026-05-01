import type { ChildProcess } from "node:child_process";
import * as fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSpawn, mockExecFileSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExecFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
  execFileSync: mockExecFileSync,
}));

import { ProcessRegistry } from "../src/process-registry.js";

beforeEach(() => {
  ProcessRegistry.resetInstance();
  mockSpawn.mockReset();
  mockExecFileSync.mockReset();
});

describe("ProcessRegistry", () => {
  describe("singleton", () => {
    it("getInstance returns same instance", () => {
      const a = ProcessRegistry.getInstance();
      const b = ProcessRegistry.getInstance();
      expect(a).toBe(b);
    });

    it("resetInstance creates new instance", () => {
      const first = ProcessRegistry.getInstance();
      ProcessRegistry.resetInstance();
      const second = ProcessRegistry.getInstance();
      expect(first).not.toBe(second);
    });
  });

  describe("register/unregister/getAll/size", () => {
    it("register adds child and getAll returns it", () => {
      const reg = ProcessRegistry.getInstance();
      const child = { pid: 12345, on: () => {} } as unknown as ChildProcess;
      reg.register(child, { source: "test", detached: false });

      expect(reg.size()).toBe(1);
      const all = reg.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].pid).toBe(12345);
      expect(all[0].source).toBe("test");
      expect(all[0].detached).toBe(false);
      expect(all[0].pgid).toBeDefined();
      expect(all[0].startTime).toBeTypeOf("number");
    });

    it("unregister removes by pid", () => {
      const reg = ProcessRegistry.getInstance();
      const child = { pid: 999, on: () => {} } as unknown as ChildProcess;
      reg.register(child, { source: "test", detached: false });
      expect(reg.size()).toBe(1);

      reg.unregister(999);
      expect(reg.size()).toBe(0);
      expect(reg.getAll()).toHaveLength(0);
    });

    it("exit event auto-unregisters", () => {
      const reg = ProcessRegistry.getInstance();
      const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      const child = {
        pid: 777,
        on: (event: string, fn: (...args: unknown[]) => void) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        },
      } as unknown as ChildProcess;

      reg.register(child, { source: "test", detached: false });
      expect(reg.size()).toBe(1);

      for (const fn of listeners.exit || []) {
        fn(0, null);
      }
      expect(reg.size()).toBe(0);
    });

    it("register with description stores it", () => {
      const reg = ProcessRegistry.getInstance();
      const child = { pid: 555, on: () => {} } as unknown as ChildProcess;
      reg.register(child, {
        source: "sleep-prevention",
        detached: false,
        description: "caffeinate -i -w 1234",
      });

      const all = reg.getAll();
      expect(all[0].description).toBe("caffeinate -i -w 1234");
    });
  });

  describe("spawnTracked", () => {
    it("auto-registers spawned child", () => {
      const reg = ProcessRegistry.getInstance();
      const mockChild = { pid: 4242, on: vi.fn() };
      mockSpawn.mockReturnValue(mockChild);

      const result = reg.spawnTracked("echo", ["hello"], {
        source: "test-spawn",
        detached: false,
      } as unknown as Parameters<typeof reg.spawnTracked>[2]);

      expect(result).toBe(mockChild);
      expect(reg.size()).toBe(1);
      expect(reg.getAll()[0].source).toBe("test-spawn");
      expect(mockChild.on).toHaveBeenCalledWith("exit", expect.any(Function));
    });
  });

  describe("execTracked", () => {
    it("executes with default 30s timeout and killSignal SIGTERM", () => {
      const reg = ProcessRegistry.getInstance();
      mockExecFileSync.mockReturnValue("ok");

      reg.execTracked("git", ["rev-parse", "HEAD"], { source: "git" });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        "git",
        ["rev-parse", "HEAD"],
        expect.objectContaining({
          timeout: 30_000,
          killSignal: "SIGTERM",
        }),
      );
    });

    it("allows custom timeout override", () => {
      const reg = ProcessRegistry.getInstance();
      mockExecFileSync.mockReturnValue("ok");

      reg.execTracked("git", ["status"], { source: "git", timeout: 5000 });

      expect(mockExecFileSync).toHaveBeenCalledWith(
        "git",
        ["status"],
        expect.objectContaining({ timeout: 5000 }),
      );
    });
  });

  describe("shutdownAll", () => {
    it("sends SIGTERM to all registered processes", async () => {
      const reg = ProcessRegistry.getInstance();
      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation((_pid: number, signal?: string | number) => {
          // kill(pid, 0) check: throw ESRCH to simulate process exited after SIGTERM
          if (signal === 0) {
            const err = new Error("ESRCH") as NodeJS.ErrnoException;
            err.code = "ESRCH";
            throw err;
          }
          return true;
        });

      reg.register({ pid: 100, on: () => {} } as unknown as ChildProcess, {
        source: "test",
        detached: false,
      });
      reg.register({ pid: 200, on: () => {} } as unknown as ChildProcess, {
        source: "test",
        detached: false,
      });

      const result = await reg.shutdownAll();

      expect(killSpy).toHaveBeenCalledWith(100, "SIGTERM");
      expect(killSpy).toHaveBeenCalledWith(200, "SIGTERM");
      expect(result.terminated).toBe(2);
      killSpy.mockRestore();
    });

    it("SIGKILLs processes that do not exit within timeout", async () => {
      const reg = ProcessRegistry.getInstance();
      let sigkillSent = false;
      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation((_pid: number, signal?: string | number) => {
          if (signal === "SIGKILL") sigkillSent = true;
          // After SIGKILL, next kill(pid,0) should fail
          if (signal === 0 && sigkillSent) {
            const err = new Error("ESRCH") as NodeJS.ErrnoException;
            err.code = "ESRCH";
            throw err;
          }
          return true;
        });

      reg.register({ pid: 300, on: () => {} } as unknown as ChildProcess, {
        source: "test",
        detached: false,
      });

      const result = await reg.shutdownAll(100);

      expect(killSpy).toHaveBeenCalledWith(300, "SIGTERM");
      expect(killSpy).toHaveBeenCalledWith(300, "SIGKILL");
      expect(result.forcedKill).toBe(1);
      killSpy.mockRestore();
    });

    it("catches ESRCH for already-exited processes", async () => {
      const reg = ProcessRegistry.getInstance();
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        const err = new Error("kill ESRCH") as NodeJS.ErrnoException;
        err.code = "ESRCH";
        throw err;
      });

      reg.register({ pid: 400, on: () => {} } as unknown as ChildProcess, {
        source: "test",
        detached: false,
      });

      const result = await reg.shutdownAll();
      expect(result.alreadyExited).toBe(1);
      killSpy.mockRestore();
    });
  });

  describe("Property 1: register preserves metadata", () => {
    it("for any valid metadata, getAll contains the entry with all fields", () => {
      fc.assert(
        fc.property(
          fc.record({
            source: fc.string({ minLength: 1, maxLength: 50 }),
            detached: fc.boolean(),
            description: fc.option(fc.string({ maxLength: 100 }), {
              nil: undefined,
            }),
          }),
          fc.integer({ min: 1, max: 65535 }),
          (metadata, pid) => {
            ProcessRegistry.resetInstance();
            const reg = ProcessRegistry.getInstance();
            const child = { pid, on: () => {} } as unknown as ChildProcess;
            reg.register(child, metadata);

            const all = reg.getAll();
            expect(all).toHaveLength(1);
            expect(all[0].pid).toBe(pid);
            expect(all[0].source).toBe(metadata.source);
            expect(all[0].detached).toBe(metadata.detached);
            expect(all[0].description).toBe(metadata.description);
            expect(all[0].pgid).toBe(pid);
            expect(all[0].startTime).toBeTypeOf("number");
            expect(reg.size()).toBe(all.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Property 2: unregister removes processes", () => {
    it("for any registered set and any unregister subset, removed PIDs are gone", () => {
      fc.assert(
        fc.property(
          fc
            .array(
              fc.record({
                pid: fc.integer({ min: 1, max: 65535 }),
                source: fc.string({ minLength: 1, maxLength: 20 }),
                detached: fc.boolean(),
              }),
              { minLength: 1, maxLength: 10 },
            )
            .filter((arr) => new Set(arr.map((p) => p.pid)).size === arr.length),
          (entries) => {
            ProcessRegistry.resetInstance();
            const reg = ProcessRegistry.getInstance();

            for (const e of entries) {
              reg.register({ pid: e.pid, on: () => {} } as unknown as ChildProcess, {
                source: e.source,
                detached: e.detached,
              });
            }
            const sizeBefore = reg.size();
            expect(sizeBefore).toBe(entries.length);

            // Unregister first half
            const toRemove = entries.slice(0, Math.ceil(entries.length / 2));
            for (const e of toRemove) {
              reg.unregister(e.pid);
            }

            const allAfter = reg.getAll();
            const removedPids = new Set(toRemove.map((e) => e.pid));
            for (const entry of allAfter) {
              expect(removedPids.has(entry.pid)).toBe(false);
            }
            expect(reg.size()).toBe(entries.length - toRemove.length);

            // Remaining entries are unchanged
            const remainingPids = new Set(
              entries.slice(Math.ceil(entries.length / 2)).map((e) => e.pid),
            );
            for (const entry of allAfter) {
              expect(remainingPids.has(entry.pid)).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

describe("Property 3: shutdownAll terminates all registered processes", () => {
  it("terminated + forcedKill + alreadyExited equals size()", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .array(
            fc.record({
              pid: fc.integer({ min: 1, max: 65535 }),
              source: fc.string({ minLength: 1, maxLength: 20 }),
              detached: fc.boolean(),
              respondsToSigterm: fc.boolean(),
            }),
            { minLength: 0, maxLength: 8 },
          )
          .filter((arr) => new Set(arr.map((p) => p.pid)).size === arr.length),
        async (entries) => {
          ProcessRegistry.resetInstance();
          const reg = ProcessRegistry.getInstance();
          const killSpy = vi.spyOn(process, "kill");

          for (const e of entries) {
            reg.register({ pid: e.pid, on: () => {} } as unknown as ChildProcess, {
              source: e.source,
              detached: e.detached,
            });
          }
          const sizeBefore = reg.size();

          killSpy.mockImplementation((pid: number, signal?: string | number) => {
            if (signal === "SIGTERM") return true;
            if (signal === 0) {
              const entry = entries.find((e) => e.pid === pid);
              if (entry?.respondsToSigterm) {
                const err = new Error("ESRCH") as NodeJS.ErrnoException;
                err.code = "ESRCH";
                throw err;
              }
              return true;
            }
            return true;
          });

          const result = await reg.shutdownAll(50);
          expect(result.terminated + result.forcedKill + result.alreadyExited).toBe(sizeBefore);
          expect(reg.size()).toBe(0);
          killSpy.mockRestore();
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe("serialize/deserialize", () => {
  it("serialize returns JSON with session info and processes", () => {
    const reg = ProcessRegistry.getInstance();
    reg.register({ pid: 100, on: () => {} } as unknown as ChildProcess, {
      source: "test",
      detached: false,
      description: "test proc",
    });

    const json = reg.serialize();
    const parsed = JSON.parse(json);
    expect(parsed.sessionPid).toBe(process.pid);
    expect(parsed.sessionPgid).toBe(process.pid);
    expect(parsed.sessionStartTime).toBeTypeOf("number");
    expect(parsed.processes).toHaveLength(1);
    expect(parsed.processes[0].pid).toBe(100);
    expect(parsed.processes[0].source).toBe("test");
  });

  it("deserialize reconstructs SerializedRegistry from JSON", () => {
    const input = {
      sessionPid: 1234,
      sessionPgid: 1234,
      sessionStartTime: 1719000000000,
      processes: [
        { pid: 1235, pgid: 1234, startTime: 1719000001000, source: "sleep", detached: false },
      ],
    };
    const result = ProcessRegistry.deserialize(JSON.stringify(input));
    expect(result.sessionPid).toBe(1234);
    expect(result.processes).toHaveLength(1);
    expect(result.processes[0].pid).toBe(1235);
  });

  it("deserialize throws on invalid JSON", () => {
    expect(() => ProcessRegistry.deserialize("not json")).toThrow();
    expect(() => ProcessRegistry.deserialize("")).toThrow();
  });

  it("deserialize throws on missing required fields", () => {
    expect(() => ProcessRegistry.deserialize(JSON.stringify({ sessionPid: 1 }))).toThrow();
  });
});

describe("Property 4: serialize/deserialize round-trip", () => {
  it("deserialize(serialize()) produces equivalent metadata list", () => {
    fc.assert(
      fc.property(
        fc.record({
          sessionPid: fc.integer({ min: 1, max: 65535 }),
          sessionPgid: fc.integer({ min: 1, max: 65535 }),
          sessionStartTime: fc.integer({ min: 0, max: Date.now() }),
          processes: fc.array(
            fc.record({
              pid: fc.integer({ min: 1, max: 65535 }),
              pgid: fc.integer({ min: 1, max: 65535 }),
              startTime: fc.integer({ min: 0, max: Date.now() }),
              source: fc.string({ minLength: 1, maxLength: 30 }),
              detached: fc.boolean(),
              description: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
            }),
            { maxLength: 5 },
          ),
        }),
        (original) => {
          const json = JSON.stringify(original);
          const restored = ProcessRegistry.deserialize(json);
          expect(restored.sessionPid).toBe(original.sessionPid);
          expect(restored.sessionPgid).toBe(original.sessionPgid);
          expect(restored.sessionStartTime).toBe(original.sessionStartTime);
          expect(restored.processes).toHaveLength(original.processes.length);
          for (let i = 0; i < original.processes.length; i++) {
            expect(restored.processes[i]).toEqual(original.processes[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 5: deserialize rejects invalid JSON", () => {
  it("throws on any invalid input", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(""),
          fc.constant("{"),
          fc.constant("}"),
          fc.constant("null"),
          fc.constant("[]"),
          fc.constant("42"),
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => {
            try {
              const p = JSON.parse(s);
              return !(
                typeof p.sessionPid === "number" &&
                typeof p.sessionPgid === "number" &&
                typeof p.sessionStartTime === "number" &&
                Array.isArray(p.processes)
              );
            } catch {
              return true;
            }
          }),
        ),
        (invalid) => {
          expect(() => ProcessRegistry.deserialize(invalid)).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});
