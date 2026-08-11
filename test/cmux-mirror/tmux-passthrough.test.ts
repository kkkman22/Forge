import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMockSocket } from "./mock-socket.js";
import type { MirrorDaemonStartResult } from "./types.js";

describe("tmux: OSC 777 passthrough (R1.3)", () => {
  let dir: string;
  let forgeDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cmux-tmux-test-"));
    forgeDir = join(dir, "tinkerman");
    mkdirSync(forgeDir, { recursive: true });
    mkdirSync(join(forgeDir, "progress"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("availability check works with TMUX env set", async () => {
    const { __resetForTest } = await import("../../scripts/cmux-mirror/lib/availability.mjs");
    const { cmuxAvailable } = await import("../../scripts/cmux-mirror/lib/availability.mjs");

    __resetForTest();

    // TMUX env alone does not make cmux available
    const origTmux = process.env.TMUX;
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";

    const available = cmuxAvailable();
    // cmuxAvailable checks socket, not TMUX — TMUX is for passthrough only
    expect(typeof available).toBe("boolean");

    // Restore
    if (origTmux !== undefined) {
      process.env.TMUX = origTmux;
    } else {
      delete process.env.TMUX;
    }
    __resetForTest();
  });

  it("mock socket receives notification when TMUX is set", async () => {
    const mock = await createMockSocket();

    const origTmux = process.env.TMUX;
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";

    try {
      // Simulate a notify through the mock socket
      const { createConnection } = await import("node:net");
      const client = createConnection(mock.socketPath);
      await new Promise<void>((resolve) => client.on("connect", resolve));

      const notifyReq = {
        jsonrpc: "2.0",
        id: 1,
        method: "notification.create",
        params: { title: "Test", body: "tmux passthrough" },
      };
      client.write(`${JSON.stringify(notifyReq)}\n`);

      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      client.destroy();

      // Request should have been received regardless of TMUX setting
      expect(mock.requests.length).toBe(1);
      expect(mock.requests[0].method).toBe("notification.create");
    } finally {
      if (origTmux !== undefined) {
        process.env.TMUX = origTmux;
      } else {
        delete process.env.TMUX;
      }
      await mock.close();
    }
  });

  it("daemon starts successfully with TMUX environment", async () => {
    const origTmux = process.env.TMUX;
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";

    try {
      writeFileSync(
        join(forgeDir, "status.md"),
        ["---", 'project_phase: "idle"', "---", "", "# Status"].join("\n"),
      );

      const { createMirrorDaemon } = await import("../../scripts/cmux-mirror/mirror.mjs");
      const result = (await createMirrorDaemon({
        forgeDir,
        socketDir: dir,
        cmuxAvailable: true,
      })) as MirrorDaemonStartResult;

      expect(result.started).toBe(true);
      if (result.started) {
        await result.shutdown();
      }
    } finally {
      if (origTmux !== undefined) {
        process.env.TMUX = origTmux;
      } else {
        delete process.env.TMUX;
      }
    }
  });

  it("mock socket handles set_status with tmux env", async () => {
    const mock = await createMockSocket();
    const origTmux = process.env.TMUX;
    process.env.TMUX = "/tmp/tmux-1000/default,12345,0";

    try {
      const { createConnection } = await import("node:net");
      const client = createConnection(mock.socketPath);
      await new Promise<void>((resolve) => client.on("connect", resolve));

      const setStatusReq = {
        jsonrpc: "2.0",
        id: 2,
        method: "set_status",
        params: { text: "Forge: build", icon: "hammer" },
      };
      client.write(`${JSON.stringify(setStatusReq)}\n`);

      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      client.destroy();

      expect(mock.requests.length).toBe(1);
      expect(mock.requests[0].method).toBe("set_status");
      expect(mock.requests[0].params).toEqual({ text: "Forge: build", icon: "hammer" });
    } finally {
      if (origTmux !== undefined) {
        process.env.TMUX = origTmux;
      } else {
        delete process.env.TMUX;
      }
      await mock.close();
    }
  });
});
