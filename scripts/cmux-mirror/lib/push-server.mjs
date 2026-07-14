import { unlinkSync } from "node:fs";
import { createServer } from "node:net";

/**
 * Mirror_Push_Socket: Unix socket server for receiving NDJSON events.
 * Rate-limited, tolerates malformed lines (R17).
 */

/**
 * Create a push socket server.
 * @param {Object} opts
 * @param {string} opts.socketPath - Unix socket path.
 * @param {(event: object) => void} opts.dispatch - Event handler.
 * @param {number} [opts.maxPerSecond=20] - Rate limit.
 */
export async function createPushServer({ socketPath, dispatch, maxPerSecond = 20 }) {
  const clients = new Set();
  let eventCount = 0;
  let windowStart = Date.now();
  let listening = true;
  // P3-4: bound the per-connection line buffer so a malicious/huge client
  // can't exhaust daemon memory. 1MB is generous for NDJSON event lines.
  const MAX_BUFFER_BYTES = 1 * 1024 * 1024;

  const server = createServer((client) => {
    clients.add(client);
    client.on("close", () => clients.delete(client));

    let buffer = "";
    client.on("data", (data) => {
      buffer += data.toString();
      // P3-4: cap buffer growth — drop the connection if a single line exceeds
      // the bound (legitimate NDJSON events are tiny).
      if (Buffer.byteLength(buffer, "utf-8") > MAX_BUFFER_BYTES) {
        client.destroy();
        return;
      }
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);

          // Rate limit check (R17.3)
          const now = Date.now();
          if (now - windowStart >= 1000) {
            eventCount = 0;
            windowStart = now;
          }
          eventCount++;
          if (eventCount > maxPerSecond) continue;

          dispatch(event);
        } catch {
          // Skip malformed line (R17.4)
        }
      }
    });
  });

  // P3-4: remove a stale socket from a crashed prior instance before
  // listening, else listen() fails with EADDRINUSE and the push channel
  // silently dies on daemon restart.
  try {
    unlinkSync(socketPath);
  } catch {
    /* not present — fine */
  }

  await new Promise((resolve, reject) => {
    server.listen(socketPath, () => resolve(undefined));
    server.on("error", reject);
  });

  return {
    get listening() {
      return listening;
    },

    async close() {
      listening = false;
      for (const c of clients) c.destroy();
      return new Promise((resolve) => {
        server.close(() => {
          try {
            unlinkSync(socketPath);
          } catch {
            /* ignore */
          }
          resolve(undefined);
        });
      });
    },
  };
}
