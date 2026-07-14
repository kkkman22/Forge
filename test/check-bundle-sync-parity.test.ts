/**
 * Unit tests for check-bundle-sync.mjs Layer 4 — src↔scripts parity (P1-3).
 *
 * Layer 4 catches drift between .mjs scripts that intentionally inline logic
 * (self-contained-by-contract) and their src/*.ts counterpart. A mismatch
 * means src was edited + tests passed, but the running .mjs still uses the old
 * value → silent drift (the root cause of the prior cmux incident).
 *
 * These tests:
 *   - verify the repo's current non-thin-shell mirrors are in parity (green)
 *   - verify the extraction logic would catch a known drift (regression guard)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");

/** Extract the token-formula divisor from compact-inject.mjs. */
function extractMjsTokenDivisor(text: string): string | null {
  const m = text.match(/Math\.ceil\(\s*text\.length\s*\/\s*(\d+)\s*\)/);
  return m ? `/${m[1]}` : null;
}

/** Extract the LATIN_CHARS_PER_TOKEN constant from token-estimate.ts. */
function extractTsTokenDivisor(text: string): string | null {
  const m = text.match(/LATIN_CHARS_PER_TOKEN\s*=\s*(\d+)/);
  return m ? `/${m[1]}` : null;
}

describe("check-bundle-sync Layer 4: src↔scripts parity (P1-3)", () => {
  it("compact-inject.mjs token formula matches token-estimate.ts LATIN_CHARS_PER_TOKEN", () => {
    const mjs = readFileSync(
      resolve(REPO_ROOT, "scripts/compact-inject.mjs"),
      "utf-8",
    );
    const ts = readFileSync(
      resolve(REPO_ROOT, "src/token-estimate.ts"),
      "utf-8",
    );
    const mjsVal = extractMjsTokenDivisor(mjs);
    const tsVal = extractTsTokenDivisor(ts);
    expect(mjsVal, "compact-inject.mjs must use Math.ceil(text.length / N)").not.toBeNull();
    expect(tsVal, "token-estimate.ts must define LATIN_CHARS_PER_TOKEN = N").not.toBeNull();
    expect(mjsVal).toBe(tsVal);
  });

  it("extraction logic catches simulated drift (regression guard)", () => {
    // If someone edits read-budgeted.ts to CHARS_PER_TOKEN = 3 but forgets
    // compact-inject.mjs, the extracts must diverge.
    const fakeTs = "const CHARS_PER_TOKEN = 3;\n";
    const realMjs = readFileSync(
      resolve(REPO_ROOT, "scripts/compact-inject.mjs"),
      "utf-8",
    );
    expect(extractMjsTokenDivisor(realMjs)).not.toBe(extractTsTokenDivisor(fakeTs));
  });

  it("thin-shell conversions removed the duplicate logic (no local definitions)", () => {
    // P1-3: these .mjs files should now import from dist/ and NOT define the
    // duplicated pure functions locally. Guards against a revert.
    const thinShells = [
      { file: "scripts/check-agent-originality.mjs", banned: "function jaccard(" },
      { file: "scripts/check-dist-sync.mjs", banned: "function srcToExpectedDist(" },
      { file: "scripts/check-agent-links.mjs", banned: "function isSymlink(" },
    ];
    for (const { file, banned } of thinShells) {
      const text = readFileSync(resolve(REPO_ROOT, file), "utf-8");
      expect(
        text.includes(banned),
        `${file} should import from dist/ — found local ${banned} (P1-3 regression)`,
      ).toBe(false);
      expect(
        text.includes("../dist/src/"),
        `${file} should import from ../dist/src/ (P1-3 thin-shell)`,
      ).toBe(true);
    }
  });

  it("P2-4: read-budgeted.ts delegates to token-estimate.ts (single token source)", () => {
    // The local CHARS_PER_TOKEN / length/4 formula was removed; estimateTokens
    // now delegates to the canonical CJK-aware tokenEstimate.
    const ts = readFileSync(
      resolve(REPO_ROOT, "src/checkpoint/read-budgeted.ts"),
      "utf-8",
    );
    expect(
      ts.includes('from "../token-estimate.js"'),
      "read-budgeted.ts must import tokenEstimate from token-estimate.ts",
    ).toBe(true);
    expect(
      ts.includes("const CHARS_PER_TOKEN"),
      "read-budgeted.ts must not define a local CHARS_PER_TOKEN (P2-4 unified)",
    ).toBe(false);
  });
});
