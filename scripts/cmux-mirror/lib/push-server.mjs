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

  const server = createServer((client) => {
    clients.add(client);
    client.on("close", () => clients.delete(client));

    let buffer = "";
    client.on("data", (data) => {
      buffer += data.toString();
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
