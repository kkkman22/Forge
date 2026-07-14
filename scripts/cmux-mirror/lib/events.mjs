import { openSync, readSync, statSync } from "node:fs";

const READ_BUF_SIZE = 65536;

/**
 * Read Events_NDJSON entries from `path` starting after byte `cursor`.
 * Tolerates malformed lines (R12.11). Optional schema_version filter (R14.9).
 * Returns { events: object[], cursor: number }.
 */
export async function readEventsSince(path, cursor, { schemaVersion } = {}) {
  try {
    const size = statSync(path).size;
    if (size <= cursor) return { events: [], cursor };
    if (cursor < 0) cursor = 0;

    const fd = openSync(path, "r");
    const chunks = [];
    let totalRead = 0;
    const toRead = size - cursor;

    try {
      let offset = cursor;
      while (totalRead < toRead) {
        const buf = Buffer.alloc(Math.min(READ_BUF_SIZE, toRead - totalRead));
        const n = readSync(fd, buf, 0, buf.length, offset);
        if (n === 0) break;
        chunks.push(buf.subarray(0, n));
        offset += n;
        totalRead += n;
      }
    } finally {
      const { closeSync } = await import("node:fs");
      closeSync(fd);
    }
    // Coverage: dynamic import used because we already imported { openSync, readSync, statSync } at top
    // and closeSync was not in the initial import list to keep it minimal.
    // This ensures the file descriptor is always closed.

    const content = Buffer.concat(chunks).toString("utf-8");
    // P2-3b: only advance the cursor to the last complete line (last "\n").
    // Advancing to EOF (size) lost the torn tail line forever — once the writer
    // finished that line, the next read started AFTER it, so it was never
    // parsed. Now the partial tail stays below the cursor for next pass.
    const lastNewline = content.lastIndexOf("\n");
    if (lastNewline === -1) {
      // No complete line yet — don't advance cursor; wait for more data.
      return { events: [], cursor };
    }
    const complete = content.slice(0, lastNewline + 1);
    const newCursor = cursor + Buffer.byteLength(complete, "utf-8");
    const lines = complete.split("\n");
    const events = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (schemaVersion !== undefined && obj.schema_version !== schemaVersion) continue;
        events.push(obj);
      } catch {
        // Skip malformed line (R12.11)
      }
    }

    return { events, cursor: newCursor };
  } catch {
    return { events: [], cursor: 0 };
  }
}
