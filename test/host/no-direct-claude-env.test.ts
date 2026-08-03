/**
 * P2 R4 (regression lock): no direct CLAUDE_* env reads in kernel src.
 *
 * The HostAdapter is the single entry point for host env vars. Kernel modules
 * (everything under src/ except src/host/) must NOT read process.env.CLAUDE_*
 * directly — that would bypass the adapter and re-introduce platform coupling.
 * This test locks the convergence so it cannot silently drift back.
 *
 * Validates: requirement R4-AC1 (grep assertion variant).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip the host adapter layer itself — it legitimately reads host env.
      if (full.endsWith("/host")) continue;
      walk(full, out);
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

const PATTERN =
  /process\.env\.(CLAUDE_PLUGIN_ROOT|CLAUDE_PLUGIN_DATA|CLAUDE_PROJECT_DIR|CLAUDE_CODE_SESSION_ID|CLAUDE_SESSION_ID)\b/;

describe("R4 convergence — kernel does not read CLAUDE_* env directly", () => {
  it("no src/*.ts outside src/host/ reads process.env.CLAUDE_*", () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const src = readFileSync(file, "utf-8");
      if (PATTERN.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
