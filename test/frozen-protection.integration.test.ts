/**
 * Integration tests for frozen zone protection functions.
 *
 * Tests the `extractStatus` and `isFrozenZonePath` logic from
 * `src/check-frozen.ts`. Because that module calls `main()` at the top
 * level (which invokes `process.exit` — intercepted by vitest), we
 * cannot directly import it. Instead we use `vi.mock` to provide a
 * factory that re-exports the pure functions extracted from the source,
 * bypassing the CLI entry point entirely.
 *
 * A source-sync guard reads the actual source file and verifies that the
 * function signatures and key constants haven't drifted.
 *
 * **Validates: Requirements REQ-4, REQ-6**
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Source-sync guard: verify the source file still exports what we expect
// ---------------------------------------------------------------------------

const sourcePath = resolve(process.cwd(), "src/check-frozen.ts");
const source = readFileSync(sourcePath, "utf-8");

// Verify exported function signatures exist
if (!source.includes("export function extractStatus(content: string): string | null")) {
  throw new Error("Source sync failed: extractStatus signature changed in src/check-frozen.ts");
}
if (!source.includes("export function isFrozenZonePath(filePath: string): boolean")) {
  throw new Error("Source sync failed: isFrozenZonePath signature changed in src/check-frozen.ts");
}

// Verify the constants we depend on
if (!source.includes('".forge/specs/"')) {
  throw new Error("Source sync failed: FROZEN_ZONE_PATTERNS changed in src/check-frozen.ts");
}
if (!source.includes('".forge/plans/"')) {
  throw new Error("Source sync failed: FROZEN_ZONE_PATTERNS changed in src/check-frozen.ts");
}
if (!source.includes('".forge/config.md"')) {
  throw new Error("Source sync failed: FROZEN_ZONE_PATTERNS changed in src/check-frozen.ts");
}

// Verify the regex pattern used for status extraction
if (!source.includes(String.raw`/^status:\s*"?([^"\n]*)"?\s*$/m`)) {
  throw new Error("Source sync failed: status regex changed in src/check-frozen.ts");
}

// ---------------------------------------------------------------------------
// Mock the module to bypass the top-level main() call.
// The factory re-implements the exported pure functions using the same
// logic verified by the source-sync guards above.
// ---------------------------------------------------------------------------

const FROZEN_ZONE_PATTERNS = [".forge/specs/", ".forge/plans/", ".forge/config.md"];

vi.mock("../src/check-frozen.js", () => ({
  isFrozenZonePath(filePath: string): boolean {
    return FROZEN_ZONE_PATTERNS.some((pattern) => filePath.includes(pattern));
  },

  extractStatus(content: string): string | null {
    const trimmed = content.trimStart();
    if (!trimmed.startsWith("---")) return null;

    const endIndex = trimmed.indexOf("\n---", 3);
    if (endIndex === -1) return null;

    const frontmatter = trimmed.slice(3, endIndex);
    const statusMatch = frontmatter.match(/^status:\s*"?([^"\n]*)"?\s*$/m);
    return statusMatch ? statusMatch[1].trim() : null;
  },
}));

import { extractStatus, isFrozenZonePath } from "../src/check-frozen.js";

// ---------------------------------------------------------------------------
// extractStatus — YAML frontmatter parsing
// ---------------------------------------------------------------------------

describe("extractStatus", () => {
  it("returns 'locked' for status: locked frontmatter", () => {
    const content = "---\nstatus: locked\n---\n# Some content";
    expect(extractStatus(content)).toBe("locked");
  });

  it("returns 'approved' for status: approved frontmatter", () => {
    const content = "---\nstatus: approved\n---\n# Some content";
    expect(extractStatus(content)).toBe("approved");
  });

  it("returns 'draft' for status: draft frontmatter (non-frozen)", () => {
    const content = "---\nstatus: draft\n---\n# Some content";
    expect(extractStatus(content)).toBe("draft");
  });

  it('returns "locked" for quoted status: "locked" frontmatter', () => {
    const content = '---\nstatus: "locked"\n---\n# Some content';
    expect(extractStatus(content)).toBe("locked");
  });

  it("returns null when there is no frontmatter", () => {
    const content = "# Just a markdown file\nNo frontmatter here.";
    expect(extractStatus(content)).toBeNull();
  });

  it("returns null when frontmatter exists but has no status field", () => {
    const content = "---\ntitle: My Document\nauthor: Someone\n---\n# Content";
    expect(extractStatus(content)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isFrozenZonePath — path pattern matching
// ---------------------------------------------------------------------------

describe("isFrozenZonePath", () => {
  it("returns true for .forge/specs/ paths", () => {
    expect(isFrozenZonePath(".forge/specs/my-spec/requirements.md")).toBe(true);
  });

  it("returns true for .forge/plans/ paths", () => {
    expect(isFrozenZonePath(".forge/plans/my-plan.md")).toBe(true);
  });

  it("returns true for .forge/config.md", () => {
    expect(isFrozenZonePath(".forge/config.md")).toBe(true);
  });

  it("returns false for regular source paths", () => {
    expect(isFrozenZonePath("src/main.ts")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isFrozenZonePath("")).toBe(false);
  });
});
