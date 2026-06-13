import { describe, expect, it } from "vitest";
import { extractAnnotations, extractEarsClauses } from "../src/spec-parser.js";
import {
  appendFrontmatterField,
  removeFrontmatterField,
  replacePhaseLine,
} from "../src/zoom-out.js";

describe("extractAnnotations (branch coverage)", () => {
  it("extracts verifyBy annotation", () => {
    const r = extractAnnotations("respond with 200 [Verify-By: vitest]");
    expect(r.verifyBy).toBe("vitest");
    expect(r.cleanedShall).not.toContain("[Verify-By");
  });
  it("extracts evidence annotation", () => {
    const r = extractAnnotations("respond [Evidence: test output]");
    expect(r.evidence).toBe("test output");
  });
  it("returns cleanedShall unchanged when no annotations", () => {
    const r = extractAnnotations("just a plain response");
    expect(r.cleanedShall).toBe("just a plain response");
    expect(r.verifyBy).toBeUndefined();
    expect(r.evidence).toBeUndefined();
  });
  it("handles both annotations together", () => {
    const r = extractAnnotations("respond [Verify-By: bash] [Evidence: log]");
    expect(r.verifyBy).toBe("bash");
    expect(r.evidence).toBe("log");
  });
});

describe("extractEarsClauses (branch coverage)", () => {
  it("extracts 当...时 系统应当 clauses", () => {
    const text = "- 当 user clicks 时 系统应当 respond with 200";
    const clauses = extractEarsClauses(text);
    expect(clauses.length).toBe(1);
    expect(clauses[0].when).toContain("user clicks");
    expect(clauses[0].shall).toContain("respond");
  });
  it("returns [] for text with no EARS clauses", () => {
    expect(extractEarsClauses("just some text\nno clauses")).toEqual([]);
  });
  it("returns [] for empty input", () => {
    expect(extractEarsClauses("")).toEqual([]);
  });
  it("handles multiple clauses", () => {
    const text = ["- 当 condition A 时 系统应当 do A", "- 当 condition B 时 系统应当 do B"].join(
      "\n",
    );
    const clauses = extractEarsClauses(text);
    expect(clauses.length).toBe(2);
  });
  it("skips empty lines", () => {
    const text = "\n\n- 当 X 时 系统应当 Y\n\n";
    const clauses = extractEarsClauses(text);
    expect(clauses.length).toBe(1);
  });
});

describe("replacePhaseLine (branch coverage)", () => {
  it("replaces phase field", () => {
    expect(replacePhaseLine("phase: build\ntier: standard", "review")).toContain("phase: review");
  });
  it("returns unchanged when no phase field", () => {
    expect(replacePhaseLine("tier: standard", "review")).toBe("tier: standard");
  });
  it("returns empty string unchanged", () => {
    expect(replacePhaseLine("", "review")).toBe("");
  });
});

describe("appendFrontmatterField (branch coverage)", () => {
  it("appends field with newline", () => {
    const r = appendFrontmatterField("tier: standard\n", "phase", "build");
    expect(r).toContain("phase: build");
  });
  it("appends field without trailing newline", () => {
    const r = appendFrontmatterField("tier: standard", "phase", "build");
    expect(r).toContain("phase: build");
  });
});

describe("removeFrontmatterField (branch coverage)", () => {
  it("removes a field", () => {
    const r = removeFrontmatterField("phase: build\ntier: standard", "phase");
    expect(r).not.toContain("phase:");
    expect(r).toContain("tier:");
  });
  it("returns unchanged when field not found", () => {
    const r = removeFrontmatterField("tier: standard", "phase");
    expect(r).toContain("tier:");
  });
});
