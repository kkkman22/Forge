import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// process-lifecycle-management R5 (design.md:303): every execFileSync("git", ...)
// call across src/ SHALL carry a timeout + killSignal: "SIGTERM" option so a
// hung git cannot block the CLI forever. This contract test scans the source
// to enforce the invariant without spawning real git processes.

const ROOT = resolve(import.meta.dirname, "..");

// Files known to call execFileSync("git", ...). If a new file starts calling
// git, add it here so the contract covers it.
const GIT_CALLING_FILES = ["src/doctor.ts", "src/baseline-resolver.ts", "src/cleanup-chain.ts"];

describe("process-lifecycle-management R5: git calls have timeout + SIGTERM", () => {
  it("every execFileSync('git', ...) call site has a timeout option within 6 lines", () => {
    const violations: string[] = [];
    for (const rel of GIT_CALLING_FILES) {
      const content = readFileSync(resolve(ROOT, rel), "utf-8");
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (line.includes('execFileSync("git"') || line.includes("execFileSync('git'")) {
          // Inspect the call + the next 6 lines for the options object.
          // R5 core requirement: a timeout must be set. killSignal defaults to
          // "SIGTERM" in Node, so an explicit killSignal is optional; if present
          // it MUST be SIGTERM (never SIGKILL, which skips cleanup).
          const window = lines.slice(i, i + 7).join("\n");
          if (!/timeout\s*:/.test(window)) {
            violations.push(`${rel}:${i + 1} — execFileSync('git') without timeout`);
          }
          if (/killSignal\s*:\s*["']SIGKILL["']/.test(window)) {
            violations.push(
              `${rel}:${i + 1} — execFileSync('git') uses killSignal SIGKILL (must be SIGTERM to allow cleanup)`,
            );
          }
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("at least one git call site is covered (guard against the file list going stale)", () => {
    let found = 0;
    for (const rel of GIT_CALLING_FILES) {
      const content = readFileSync(resolve(ROOT, rel), "utf-8");
      if (content.includes('execFileSync("git"') || content.includes("execFileSync('git'")) {
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
