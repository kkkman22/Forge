/**
 * read-stdin.mjs — Shared stdin reader for Forge hook scripts.
 *
 * Reads stdin with configurable timeout and max-bytes.
 * Returns empty buffer on timeout, error, or TTY.
 *
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=100] - Timeout in milliseconds
 * @param {number} [opts.maxBytes=262144] - Max bytes to read (256KB default)
 * @returns {Promise<Buffer>}
 */
export function readStdin({ timeoutMs = 100, maxBytes = 262144 } = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    let totalLen = 0;
    const stdin = process.stdin;
    let settled = false;

    function finish(buf) {
      if (settled) return;
      settled = true;
      resolve(buf);
    }

    const timer = setTimeout(() => {
      cleanup();
      finish(Buffer.alloc(0));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try {
        stdin.removeAllListeners("data");
        stdin.removeAllListeners("end");
        stdin.removeAllListeners("error");
        stdin.pause();
      } catch {
        // best effort
      }
    }

    stdin.on("data", (chunk) => {
      totalLen += chunk.length;
      if (totalLen > maxBytes) {
        cleanup();
        finish(Buffer.alloc(0));
        return;
      }
      chunks.push(chunk);
    });

    stdin.on("end", () => {
      cleanup();
      finish(Buffer.concat(chunks, totalLen));
    });

    stdin.on("error", () => {
      cleanup();
      finish(Buffer.alloc(0));
    });

    if (stdin.isTTY) {
      cleanup();
      finish(Buffer.alloc(0));
    } else {
      stdin.resume();
    }
  });
}
