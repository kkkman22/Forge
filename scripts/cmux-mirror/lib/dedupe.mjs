import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

/**
 * Check dedupe state and record the current timestamp (R6.2).
 * Returns { notify: true } if within-window notification should be sent.
 * Returns { notify: false } if already notified within the window.
 * Fallback: if dedupe dir doesn't exist, returns { notify: true } (R13.11).
 */
export function checkAndRecord(filePath, dedupeDir, windowMs) {
  const hash = createHash("sha1").update(filePath).digest("hex");
  const tsFile = join(dedupeDir, `${hash}.ts`);
  const now = Date.now();

  try {
    if (existsSync(tsFile)) {
      const content = readFileSync(tsFile, "utf-8").trim();
      const lastTs = parseInt(content, 10);
      if (!Number.isNaN(lastTs) && now - lastTs < windowMs) {
        return { notify: false };
      }
    }
  } catch {
    // Read failure — allow notification (best-effort)
  }

  try {
    if (!existsSync(dedupeDir)) {
      mkdirSync(dedupeDir, { recursive: true });
    }
    const tmpFile = join(dedupeDir, `${hash}.ts.tmp`);
    writeFileSync(tmpFile, now.toString());
    renameSync(tmpFile, tsFile);
  } catch {
    // Write failure — still allow notification (R13.11)
  }

  return { notify: true };
}
