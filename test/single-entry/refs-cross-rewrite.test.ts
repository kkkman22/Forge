import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");

// Discover the actual set of lib subs from disk rather than hard-coding a list
// that drifts as new subs are added. A cross-ref to any real sub directory
// (e.g. ../charter/, ../init/) is by definition valid.
const LIB_DIR = resolve(ROOT, "skills", "tinkerman", "lib");
const VALID_SUBS = new Set(
  readdirSync(LIB_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
);

describe("R4.2: cross-sub references rewritten to lib structure", () => {
  it("no ../tinkerman-<sub> pattern remains in lib/", async () => {
    const libs = await glob("skills/tinkerman/lib/**/*.md", { cwd: ROOT });
    const violations: string[] = [];

    for (const libPath of libs) {
      const content = readFileSync(resolve(ROOT, libPath), "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/(?:\.\.\/|skills\/)forge-[a-z]/.test(lines[i])) {
          violations.push(`${libPath}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("all ../<sub>/ cross-references point to valid sub names", async () => {
    const libs = await glob("skills/tinkerman/lib/*/instructions.md", { cwd: ROOT });
    const violations: string[] = [];

    for (const libPath of libs) {
      const content = readFileSync(resolve(ROOT, libPath), "utf-8");
      const crossRefPattern = /\.\.\/([a-z][a-z0-9-]*)\//g;
      for (const m of content.matchAll(crossRefPattern)) {
        const targetSub = m[1];
        if (!VALID_SUBS.has(targetSub)) {
          violations.push(`${libPath}: cross-ref to unknown sub '${targetSub}'`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
