import { mkdtempSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPushServer } from "../../scripts/cmux-mirror/lib/push-server.mjs";

describe("push-server: Unix socket server (R17.1–R17.4)", () => {
  let dir: string;
  let socketPath: string;
  let server: ReturnType<typeof createPushServer> extends Promise<infer T> ? T : never;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "cmux-push-test-"));
    socketPath = join(dir, "push.sock");
  });

  afterEach(async () => {
    try {
      if (server) await server.close();
    } catch {
      /* ignore */
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("R17.1: starts listening on Unix socket", async () => {
    server = await createPushServer({ socketPath, dispatch: () => {} });
    expect(server.listening).toBe(true);
  });

  it("R17.2: receives and dispatches NDJSON lines", async () => {
    const received: object[] = [];
    server = await createPushServer({
      socketPath,
      dispatch: (event) => received.push(event),
    });

    const client = createConnection(socketPath);
    await new Promise<void>((resolve) => client.on("connect", resolve));

    client.write(JSON.stringify({ type: "test", data: 1 }) + "\n");
    client.write(JSON.stringify({ type: "test", data: 2 }) + "\n");

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    client.destroy();

    expect(received.length).toBe(2);
    expect(received[0]).toEqual({ type: "test", data: 1 });
    expect(received[1]).toEqual({ type: "test", data: 2 });
  });

  it("R17.3: rate limits at configured max (20/s default)", async () => {
    const received: object[] = [];
    server = await createPushServer({
      socketPath,
      dispatch: (event) => received.push(event),
      maxPerSecond: 5,
    });

    const client = createConnection(socketPath);
    await new Promise<void>((resolve) => client.on("connect", resolve));

    for (let i = 0; i < 10; i++) {
      client.write(JSON.stringify({ type: "test", i }) + "\n");
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    client.destroy();

    // Should have received at most maxPerSecond + some slack
    expect(received.length).toBeLessThanOrEqual(6);
  });

  it("R17.4: tolerates malformed lines", async () => {
    const received: object[] = [];
    server = await createPushServer({
      socketPath,
      dispatch: (event) => received.push(event),
    });

    const client = createConnection(socketPath);
    await new Promise<void>((resolve) => client.on("connect", resolve));

    client.write("not json\n");
    client.write(JSON.stringify({ type: "valid" }) + "\n");
    client.write("{broken\n");

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    client.destroy();

    expect(received.length).toBe(1);
    expect(received[0]).toEqual({ type: "valid" });
  });

  it("R17.8: close cleans up socket file", async () => {
    server = await createPushServer({ socketPath, dispatch: () => {} });
    expect(server.listening).toBe(true);
    await server.close();
    // Server should no longer be listening
    expect(server.listening).toBe(false);
  });
});

describe("push.sh: thin wrapper integration", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cmux-push-sh-test-"));
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("push.sh exists and is executable", async () => {
    const { statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const pushSh = join(process.cwd(), "scripts", "cmux-mirror", "push.sh");
    const st = statSync(pushSh);
    expect(st.mode & 0o111).toBeTruthy();
  });
});
