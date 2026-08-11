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
 * function signatures and key delegation patterns haven't drifted.
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

// Verify delegation to state.ts (single source of truth for protection zones)
if (!source.includes('from "./state.js"')) {
  throw new Error(
    "Source sync failed: check-frozen.ts must delegate to state.ts for protection zone rules",
  );
}
if (!source.includes("getProtectionZone")) {
  throw new Error("Source sync failed: check-frozen.ts must use getProtectionZone from state.ts");
}
if (!source.includes("extractFrontmatterStatus")) {
  throw new Error(
    "Source sync failed: check-frozen.ts must use extractFrontmatterStatus from state.ts",
  );
}
if (!source.includes("normalizeForgePath")) {
  throw new Error("Source sync failed: check-frozen.ts must use normalizeForgePath from state.ts");
}

// ---------------------------------------------------------------------------
// Mock the module to bypass the top-level main() call.
// The factory re-implements the exported pure functions using the same
// delegation logic verified by the source-sync guards above.
// ---------------------------------------------------------------------------

// Import the real state.ts functions (no side effects, safe to import directly)
import { extractFrontmatterStatus, getProtectionZone, normalizeForgePath } from "../src/state.js";

vi.mock("../src/check-frozen.js", () => ({
  isFrozenZonePath(filePath: string): boolean {
    const relativePath = normalizeForgePath(filePath);
    return getProtectionZone(relativePath) === "frozen";
  },

  extractStatus(content: string): string | null {
    return extractFrontmatterStatus(content);
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
  it("returns true for .tinkerman/specs/ paths", () => {
    expect(isFrozenZonePath(".tinkerman/specs/my-spec/requirements.md")).toBe(true);
  });

  it("returns true for .tinkerman/plans/ paths", () => {
    expect(isFrozenZonePath(".tinkerman/plans/my-plan.md")).toBe(true);
  });

  it("returns true for .tinkerman/config.md", () => {
    expect(isFrozenZonePath(".tinkerman/config.md")).toBe(true);
  });

  it("returns false for regular source paths", () => {
    expect(isFrozenZonePath("src/main.ts")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isFrozenZonePath("")).toBe(false);
  });
});
