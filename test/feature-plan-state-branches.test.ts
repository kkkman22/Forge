import { describe, expect, it } from "vitest";
import { escapeTableCell, extractStatus } from "../src/feature-dossier.js";
import { escapeForRegExp, validateTopologicalOrder } from "../src/plan.js";
import { isCompleteEntry } from "../src/state.js";

describe("feature-dossier: escapeTableCell (branches)", () => {
  it("escapes pipe characters", () => {
    expect(escapeTableCell("a|b")).toBe("a\\|b");
  });
  it("replaces newlines with spaces", () => {
    expect(escapeTableCell("a\nb")).toBe("a b");
  });
  it("handles both pipe + newline", () => {
    expect(escapeTableCell("a|b\nc|d")).toBe("a\\|b c\\|d");
  });
  it("passes through plain text unchanged", () => {
    expect(escapeTableCell("hello")).toBe("hello");
  });
});

describe("feature-dossier: extractStatus (branches)", () => {
  it("extracts string status", () => {
    expect(extractStatus({ status: "locked" })).toBe("locked");
  });
  it("returns null for non-string status", () => {
    expect(extractStatus({ status: 42 })).toBeNull();
  });
  it("returns null for missing status", () => {
    expect(extractStatus({})).toBeNull();
  });
});

describe("plan: escapeForRegExp (branches)", () => {
  it("escapes special regex chars", () => {
    const r = escapeForRegExp("a.b*c");
    expect(r).not.toBe("a.b*c"); // chars escaped
  });
  it("passes through plain text", () => {
    expect(escapeForRegExp("hello")).toBe("hello");
  });
});

describe("plan: validateTopologicalOrder (branches)", () => {
  it("returns null for valid order", () => {
    expect(
      validateTopologicalOrder([
        { taskNumber: 1, dependsOn: [] },
        { taskNumber: 2, dependsOn: [1] },
      ]),
    ).toBeNull();
  });
  it("returns error when dependency appears after dependent", () => {
    const r = validateTopologicalOrder([
      { taskNumber: 1, dependsOn: [2] },
      { taskNumber: 2, dependsOn: [] },
    ]);
    expect(r).not.toBeNull();
    expect(r).toContain("Task 1");
  });
  it("returns null for empty tasks", () => {
    expect(validateTopologicalOrder([])).toBeNull();
  });
  it("handles undefined dependsOn", () => {
    expect(validateTopologicalOrder([{ taskNumber: 1 }, { taskNumber: 2 }])).toBeNull();
  });
  it("ignores deps that don't exist in task list", () => {
    expect(validateTopologicalOrder([{ taskNumber: 1, dependsOn: [99] }])).toBeNull();
  });
});

describe("state: isCompleteEntry (branches)", () => {
  it("returns true for complete entry", () => {
    expect(
      isCompleteEntry({ taskName: "x", tier: "standard", phase: "build", updated: "2026" }),
    ).toBe(true);
  });
  it("returns false when taskName missing", () => {
    expect(isCompleteEntry({ tier: "standard", phase: "build", updated: "2026" })).toBe(false);
  });
  it("returns false when tier is non-string", () => {
    expect(
      isCompleteEntry({ taskName: "x", tier: 42 as never, phase: "build", updated: "2026" }),
    ).toBe(false);
  });
  it("returns false for empty object", () => {
    expect(isCompleteEntry({})).toBe(false);
  });
});
