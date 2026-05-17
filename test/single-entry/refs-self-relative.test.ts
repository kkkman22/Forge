import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { glob } from "glob";

const ROOT = resolve(import.meta.dirname, "..", "..");

describe("R4.1: self-relative references within same sub", () => {
  it("all references/ paths in lib are self-relative (no ../ prefix for same-sub refs)", async () => {
    const libs = await glob("skills/forge/lib/*/instructions.md", { cwd: ROOT });
    const violations: string[] = [];

    for (const libPath of libs) {
      const content = readFileSync(resolve(ROOT, libPath), "utf-8");
      const sub = libPath.split("/")[3];
      const refPattern = /(?:Read|read)\s*\(?["']([^"']*references\/[^"']+)["']/g;
      let match;

      while ((match = refPattern.exec(content)) !== null) {
        const refPath = match[1];
        if (refPath.startsWith("../")) {
          const targetSub = refPath.match(/\.\.\/([^/]+)/)?.[1];
          if (targetSub === sub) {
            violations.push(
              `${libPath}: self-reference uses ../${sub}/ instead of references/`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("references/ directories exist where referenced", async () => {
    const libs = await glob("skills/forge/lib/*/instructions.md", { cwd: ROOT });
    const violations: string[] = [];

    for (const libPath of libs) {
      const content = readFileSync(resolve(ROOT, libPath), "utf-8");
      const refPattern = /references\/([a-zA-Z0-9_-]+\.md)/g;
      let match;

      while ((match = refPattern.exec(content)) !== null) {
        const sub = libPath.split("/")[3];
        const refFile = match[1];
        const fullPath = resolve(ROOT, "skills/forge/lib", sub, "references", refFile);

        if (!existsSync(fullPath)) {
          violations.push(
            `${libPath}: references ${refFile} but file not found at ${fullPath}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
