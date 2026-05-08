import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAndRecord } from "../../scripts/cmux-mirror/lib/dedupe.mjs";

let dedupeDir: string;

beforeEach(() => {
  dedupeDir = mkdtempSync(join(tmpdir(), "cmux-dedupe-test-"));
});

afterEach(() => {
  try {
    rmSync(dedupeDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("dedupe: idempotent within window (R12.8)", () => {
  it("second call within window returns notify:false after first returns true", () => {
    const filePath = "/some/important/file.md";
    const windowMs = 5000;

    const first = checkAndRecord(filePath, dedupeDir, windowMs);
    expect(first.notify).toBe(true);

    const second = checkAndRecord(filePath, dedupeDir, windowMs);
    expect(second.notify).toBe(false);
  });

  it("property: same filePath consecutive calls — first true, second false", () => {
    fc.assert(
      fc.property(
        fc.record({
          filePath: fc.string({ minLength: 1, maxLength: 200 }),
          windowMs: fc.integer({ min: 1000, max: 60000 }),
        }),
        ({ filePath, windowMs }) => {
          // Use unique dedupeDir per property case
          const dir = mkdtempSync(join(tmpdir(), "cmux-dedupe-prop-"));
          try {
            const first = checkAndRecord(filePath, dir, windowMs);
            const second = checkAndRecord(filePath, dir, windowMs);
            expect(first.notify).toBe(true);
            expect(second.notify).toBe(false);
          } finally {
            try {
              rmSync(dir, { recursive: true, force: true });
            } catch {
              /* ignore */
            }
          }
        },
      ),
    );
  });
});

describe("dedupe: directory creation failure fallback (R13.11)", () => {
  it("returns notify:true when dedupeDir does not exist", () => {
    const result = checkAndRecord("/some/file.md", "/nonexistent/path", 5000);
    expect(result.notify).toBe(true);
  });
});

describe("dedupe: different files are independent", () => {
  it("different paths each get their own dedupe state", () => {
    const r1 = checkAndRecord("/file/a.md", dedupeDir, 5000);
    const r2 = checkAndRecord("/file/b.md", dedupeDir, 5000);
    expect(r1.notify).toBe(true);
    expect(r2.notify).toBe(true);
  });
});
