import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildStartCommand,
  isTimeoutElapsed,
  parseTerminalId,
  withDevServer,
} from "../src/dev-server-lifecycle.js";

describe("buildStartCommand — unit", () => {
  it("includes port in command", () => {
    expect(buildStartCommand(5173)).toBe("npm run dev -- --port 5173");
    expect(buildStartCommand(3000)).toBe("npm run dev -- --port 3000");
  });
});

describe("parseTerminalId — property", () => {
  it("returns string or null for any input", () => {
    fc.assert(
      fc.property(fc.string(), (output) => {
        const result = parseTerminalId(output);
        expect(result === null || typeof result === "string").toBe(true);
      }),
    );
  });

  it("parses terminal_id=<value>", () => {
    expect(parseTerminalId("terminal_id=abc123")).toBe("abc123");
  });

  it("parses terminal_id: <value>", () => {
    expect(parseTerminalId("terminal_id: xyz789")).toBe("xyz789");
  });

  it("returns null for no match", () => {
    expect(parseTerminalId("no id here")).toBeNull();
  });
});

describe("isTimeoutElapsed — unit", () => {
  it("not elapsed when within timeout", () => {
    expect(isTimeoutElapsed(Date.now(), 60000)).toBe(false);
  });

  it("elapsed when past timeout", () => {
    expect(isTimeoutElapsed(Date.now() - 120000, 60000)).toBe(true);
  });
});

describe("withDevServer — unit", () => {
  it("calls stop even when work throws", async () => {
    let stopped = false;
    const handle = { terminalId: "t1", port: 5173, projectRoot: "." };

    await expect(
      withDevServer(
        async () => handle,
        async () => {
          stopped = true;
        },
        async () => {
          throw new Error("work failed");
        },
      ),
    ).rejects.toThrow("work failed");

    expect(stopped).toBe(true);
  });

  it("returns work result when successful", async () => {
    const handle = { terminalId: "t1", port: 5173, projectRoot: "." };
    const result = await withDevServer(
      async () => handle,
      async () => {},
      async () => 42,
    );
    expect(result).toBe(42);
  });
});
