/**
 * Tests for spec-lifecycle module.
 *
 * Feature: spec-lifecycle-management
 * Requirements: 1 (status machine), 2 (frontmatter schema)
 *
 * TDD RED phase: these tests define the expected behavior.
 */

import { describe, expect, it } from "vitest";
import {
  parseSpecFrontmatter,
  validateSpecFrontmatter,
  type SpecFrontmatter,
  type SpecStatus,
} from "../src/spec-lifecycle.js";

// ---------------------------------------------------------------------------
// parseSpecFrontmatter — valid frontmatter
// ---------------------------------------------------------------------------

describe("parseSpecFrontmatter", () => {
  it("parses a complete valid frontmatter", () => {
    const content = [
      "---",
      'name: my-spec',
      'status: in_progress',
      'created: "2026-05-29"',
      'updated: "2026-05-29"',
      'priority: P1',
      'tier: standard',
      "depends_on:",
      "  - other-spec",
      "replaces:",
      "  - old-spec",
      "replaced_by:",
      "  - new-spec",
      "---",
      "",
      "# My Spec",
    ].join("\n");

    const result = parseSpecFrontmatter(content);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("my-spec");
    expect(result!.status).toBe("in_progress");
    expect(result!.created).toBe("2026-05-29");
    expect(result!.updated).toBe("2026-05-29");
    expect(result!.priority).toBe("P1");
    expect(result!.tier).toBe("standard");
    expect(result!.depends_on).toEqual(["other-spec"]);
    expect(result!.replaces).toEqual(["old-spec"]);
    expect(result!.replaced_by).toEqual(["new-spec"]);
  });

  it("parses frontmatter with minimal required fields", () => {
    const content = [
      "---",
      "name: minimal-spec",
      "status: draft",
      'created: "2026-01-01"',
      'updated: "2026-01-01"',
      "---",
      "",
      "# Minimal",
    ].join("\n");

    const result = parseSpecFrontmatter(content);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("minimal-spec");
    expect(result!.status).toBe("draft");
    expect(result!.created).toBe("2026-01-01");
    expect(result!.updated).toBe("2026-01-01");
    expect(result!.priority).toBeUndefined();
    expect(result!.tier).toBeUndefined();
    expect(result!.depends_on).toEqual([]);
    expect(result!.replaces).toEqual([]);
    expect(result!.replaced_by).toEqual([]);
  });

  it("parses deferred frontmatter with reason and date", () => {
    const content = [
      "---",
      "name: deferred-spec",
      "status: deferred",
      'created: "2026-03-15"',
      'updated: "2026-05-29"',
      'deferred_reason: "Waiting for dependency"',
      'deferred_date: "2026-05-29"',
      "---",
      "",
      "# Deferred",
    ].join("\n");

    const result = parseSpecFrontmatter(content);

    expect(result).not.toBeNull();
    expect(result!.status).toBe("deferred");
    expect(result!.deferred_reason).toBe("Waiting for dependency");
    expect(result!.deferred_date).toBe("2026-05-29");
  });

  it("returns null for content without frontmatter", () => {
    const content = "# Just a heading\n\nSome text";
    expect(parseSpecFrontmatter(content)).toBeNull();
  });

  it("returns null for unclosed frontmatter", () => {
    const content = "---\nname: test\nstatus: draft";
    expect(parseSpecFrontmatter(content)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSpecFrontmatter("")).toBeNull();
  });

  it("returns null for content without name field", () => {
    const content = "---\nstatus: draft\n---";
    expect(parseSpecFrontmatter(content)).toBeNull();
  });

  it("defaults status to in_progress when status field is missing", () => {
    const content = "---\nname: no-status\n---";
    const result = parseSpecFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("in_progress");
  });

  it("handles content with leading whitespace before frontmatter", () => {
    const content = "  \n---\nname: spaced\nstatus: draft\n---";
    const result = parseSpecFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("spaced");
  });

  it("parses inline empty arrays", () => {
    const content = [
      "---",
      "name: empty-lists",
      "status: draft",
      "depends_on: []",
      "replaces: []",
      "replaced_by: []",
      "---",
    ].join("\n");

    const result = parseSpecFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.depends_on).toEqual([]);
    expect(result!.replaces).toEqual([]);
    expect(result!.replaced_by).toEqual([]);
  });

  it("preserves body content after frontmatter", () => {
    const content = "---\nname: test\nstatus: draft\n---\n\n# Body\n\nSome body text.";
    const result = parseSpecFrontmatter(content);
    expect(result).not.toBeNull();
    // The body is not part of SpecFrontmatter but parseFrontmatter should not fail
    expect(result!.name).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// validateSpecFrontmatter — valid cases
// ---------------------------------------------------------------------------

describe("validateSpecFrontmatter", () => {
  it("validates a complete valid frontmatter", () => {
    const fm: SpecFrontmatter = {
      name: "valid-spec",
      status: "in_progress",
      created: "2026-05-29",
      updated: "2026-05-29",
      priority: "P1",
      tier: "standard",
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validates a minimal frontmatter (name, status, dates only)", () => {
    const fm: SpecFrontmatter = {
      name: "minimal",
      status: "draft",
      created: "2026-01-01",
      updated: "2026-01-01",
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(true);
  });

  it("validates a deferred frontmatter with reason and date", () => {
    const fm: SpecFrontmatter = {
      name: "deferred",
      status: "deferred",
      created: "2026-01-01",
      updated: "2026-05-29",
      deferred_reason: "Waiting for dependency",
      deferred_date: "2026-05-29",
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(true);
  });

  it("accepts all valid status values", () => {
    const statuses: SpecStatus[] = [
      "draft",
      "approved",
      "in_progress",
      "completed",
      "deferred",
      "archived",
    ];

    for (const status of statuses) {
      const fm: SpecFrontmatter = {
        name: "status-test",
        status,
        created: "2026-01-01",
        updated: "2026-01-01",
        depends_on: [],
        replaces: [],
        replaced_by: [],
      };

      const result = validateSpecFrontmatter(fm);
      expect(result.valid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// validateSpecFrontmatter — invalid cases
// ---------------------------------------------------------------------------

describe("validateSpecFrontmatter errors", () => {
  it("reports error for missing name", () => {
    const fm: SpecFrontmatter = {
      name: "",
      status: "draft",
      created: "2026-01-01",
      updated: "2026-01-01",
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("reports error for invalid name format (not kebab-case)", () => {
    const fm: SpecFrontmatter = {
      name: "Invalid_Name!",
      status: "draft",
      created: "2026-01-01",
      updated: "2026-01-01",
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("kebab-case"))).toBe(true);
  });

  it("reports error for invalid status value", () => {
    const fm: SpecFrontmatter = {
      name: "test",
      status: "invalid_status" as SpecStatus,
      created: "2026-01-01",
      updated: "2026-01-01",
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("status"))).toBe(true);
  });

  it("reports error for invalid created date format", () => {
    const fm: SpecFrontmatter = {
      name: "test",
      status: "draft",
      created: "not-a-date",
      updated: "2026-01-01",
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("created"))).toBe(true);
  });

  it("reports error for invalid updated date format", () => {
    const fm: SpecFrontmatter = {
      name: "test",
      status: "draft",
      created: "2026-01-01",
      updated: "2026/01/01",
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("updated"))).toBe(true);
  });

  it("reports error for invalid priority value", () => {
    const fm: SpecFrontmatter = {
      name: "test",
      status: "draft",
      created: "2026-01-01",
      updated: "2026-01-01",
      priority: "P4" as SpecFrontmatter["priority"],
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("priority"))).toBe(true);
  });

  it("reports error for invalid tier value", () => {
    const fm: SpecFrontmatter = {
      name: "test",
      status: "draft",
      created: "2026-01-01",
      updated: "2026-01-01",
      tier: "heavy" as SpecFrontmatter["tier"],
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("tier"))).toBe(true);
  });

  it("reports error for deferred status without deferred_reason", () => {
    const fm: SpecFrontmatter = {
      name: "deferred-no-reason",
      status: "deferred",
      created: "2026-01-01",
      updated: "2026-05-29",
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("deferred_reason"))).toBe(true);
  });

  it("reports error for deferred status without deferred_date", () => {
    const fm: SpecFrontmatter = {
      name: "deferred-no-date",
      status: "deferred",
      created: "2026-01-01",
      updated: "2026-05-29",
      deferred_reason: "Some reason",
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("deferred_date"))).toBe(true);
  });

  it("reports error for deferred status with invalid deferred_date format", () => {
    const fm: SpecFrontmatter = {
      name: "deferred-bad-date",
      status: "deferred",
      created: "2026-01-01",
      updated: "2026-05-29",
      deferred_reason: "Some reason",
      deferred_date: "not-a-date",
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("deferred_date"))).toBe(true);
  });

  it("reports multiple errors at once", () => {
    const fm: SpecFrontmatter = {
      name: "",
      status: "bad" as SpecStatus,
      created: "x",
      updated: "y",
      priority: "P9" as SpecFrontmatter["priority"],
      depends_on: [],
      replaces: [],
      replaced_by: [],
    };

    const result = validateSpecFrontmatter(fm);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });
});
