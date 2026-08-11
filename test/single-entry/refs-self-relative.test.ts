import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");

describe("R4.1: self-relative references within same sub", () => {
  it("lib must contain 29 instructions.md (Task 6 prerequisite)", async () => {
    const libs = await glob("skills/tinkerman/lib/*/instructions.md", { cwd: ROOT });
    expect(libs.length).toBeGreaterThanOrEqual(29);
  });

  it("all references/ paths in lib are self-relative (no ../ prefix for same-sub refs)", async () => {
    const libs = await glob("skills/tinkerman/lib/*/instructions.md", { cwd: ROOT });
    const violations: string[] = [];

    for (const libPath of libs) {
      const content = readFileSync(resolve(ROOT, libPath), "utf-8");
      const sub = libPath.split("/")[3];
      const refPattern = /(?:Read|read)\s*\(?["']([^"']*references\/[^"']+)["']/g;
      for (const m of content.matchAll(refPattern)) {
        const refPath = m[1];
        if (refPath.startsWith("../")) {
          const targetSub = refPath.match(/\.\.\/([^/]+)/)?.[1];
          if (targetSub === sub) {
            violations.push(`${libPath}: self-reference uses ../${sub}/ instead of references/`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("references/ directories exist where referenced", async () => {
    const libs = await glob("skills/tinkerman/lib/*/instructions.md", { cwd: ROOT });
    const violations: string[] = [];

    for (const libPath of libs) {
      const content = readFileSync(resolve(ROOT, libPath), "utf-8");
      const refPattern = /([^"\s]*references\/([a-zA-Z0-9_-]+\.md))/g;
      for (const m of content.matchAll(refPattern)) {
        const fullRef = m[1];
        const refFile = m[2];
        // Skip cross-sub references (contains ../)
        if (fullRef.includes("../")) continue;

        const sub = libPath.split("/")[3];
        const fullPath = resolve(ROOT, "skills/tinkerman/lib", sub, "references", refFile);

        if (!existsSync(fullPath)) {
          violations.push(`${libPath}: references ${refFile} but file not found at ${fullPath}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
