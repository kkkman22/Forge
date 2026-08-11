import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");

describe("R4.3: cross-lib references resolve correctly", () => {
  it("lib must contain 29 instructions.md (Task 6 prerequisite)", async () => {
    const libs = await glob("skills/tinkerman/lib/*/instructions.md", { cwd: ROOT });
    expect(libs.length).toBeGreaterThanOrEqual(29);
  });

  it("all ../<sub>/references/ cross-refs point to existing files", async () => {
    const libs = await glob("skills/tinkerman/lib/*/instructions.md", { cwd: ROOT });
    const violations: string[] = [];

    for (const libPath of libs) {
      const content = readFileSync(resolve(ROOT, libPath), "utf-8");
      const sub = libPath.split("/")[3];
      const crossRefPattern = /\.\.\/([a-z][a-z0-9-]*)\/(references\/[a-zA-Z0-9_.-]+\.md)/g;
      for (const m of content.matchAll(crossRefPattern)) {
        const targetSub = m[1];
        const refPath = m[2];
        const fullPath = resolve(ROOT, "skills/tinkerman/lib", targetSub, refPath);

        if (!existsSync(fullPath)) {
          violations.push(`${libPath}: ${sub} refs ${targetSub}/${refPath} — not found`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
