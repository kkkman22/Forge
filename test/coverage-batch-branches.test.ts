import { describe, expect, it } from "vitest";
import { extractJsdocContext, parseImports } from "../src/context-boundary.js";
import { deriveTopicFromPath, detectDrifts } from "../src/feature-dossier.js";
import { evaluateMutationVerdict, parseMutationArgs } from "../src/mutate.js";
import { parseRequirementsMarkdown } from "../src/spec-parser.js";
import {
  extractFrontmatterStatus,
  getProtectionZone,
  hasMarkdownExtension,
  hasYamlFrontmatter,
  normalizeForgePath,
} from "../src/state.js";

// feature-dossier: deriveTopicFromPath — all regex branches
describe("deriveTopicFromPath (all regex branches)", () => {
  it("derives from decisions/<date>-<topic>.md", () => {
    expect(deriveTopicFromPath("decisions/2026-01-01-add-feature.md")).toBe("add-feature");
  });
  it("derives from decisions/ADR-<NNNN>-<topic>.md", () => {
    expect(deriveTopicFromPath("decisions/ADR-0001-use-redis.md")).toBe("use-redis");
  });
  it("derives from specs/<topic>/spec.md", () => {
    expect(deriveTopicFromPath("specs/feature-x/spec.md")).toBe("feature-x");
  });
  it("derives from specs/<topic>/requirements.md", () => {
    expect(deriveTopicFromPath("specs/feature-x/requirements.md")).toBe("feature-x");
  });
  it("derives from specs/<topic>/design.md", () => {
    expect(deriveTopicFromPath("specs/feature-x/design.md")).toBe("feature-x");
  });
  it("derives from specs/<topic>/tasks.md", () => {
    expect(deriveTopicFromPath("specs/feature-x/tasks.md")).toBe("feature-x");
  });
  it("derives from plans/<topic>.md", () => {
    expect(deriveTopicFromPath("plans/feature-x.md")).toBe("feature-x");
  });
  it("derives from reviews/<topic>.md", () => {
    expect(deriveTopicFromPath("reviews/feature-x.md")).toBe("feature-x");
  });
  it("derives from progress/<topic>.md", () => {
    expect(deriveTopicFromPath("progress/feature-x.md")).toBe("feature-x");
  });
  it("returns null for empty string", () => {
    expect(deriveTopicFromPath("")).toBeNull();
  });
  it("returns null for unmatched path", () => {
    expect(deriveTopicFromPath("random/path.txt")).toBeNull();
  });
});

// feature-dossier: detectDrifts — trailing-digit, plural, separator
describe("detectDrifts (drift detection branches)", () => {
  it("detects trailing-digit drift (foo vs foo1)", () => {
    const drifts = detectDrifts(["foo", "foo1"]);
    // Audit P2: was toBeGreaterThan(0) — assert the actual pair, not just non-empty.
    expect(drifts).toContainEqual({ topicA: "foo", topicB: "foo1", reason: "trailing-digit" });
  });
  it("detects plural drift (bar vs bars)", () => {
    const drifts = detectDrifts(["bar", "bars"]);
    expect(drifts).toContainEqual({ topicA: "bar", topicB: "bars", reason: "plural-form" });
  });
  it("detects separator drift (a_b vs a-b)", () => {
    const drifts = detectDrifts(["a_b", "a-b"]);
    expect(drifts).toContainEqual({ topicA: "a_b", topicB: "a-b", reason: "separator" });
  });
  it("no drift for unique topics", () => {
    expect(detectDrifts(["alpha", "beta", "gamma"])).toEqual([]);
  });
  it("empty input → no drifts", () => {
    expect(detectDrifts([])).toEqual([]);
  });
});

// context-boundary: extractJsdocContext + parseImports
describe("extractJsdocContext + parseImports (branches)", () => {
  it("extracts @context from JSDoc in first 30 lines", () => {
    const content = "/**\n * @context billing\n */\nexport function foo() {}";
    expect(extractJsdocContext(content)).toBe("billing");
  });
  it("returns null when no @context", () => {
    expect(extractJsdocContext("no jsdoc here")).toBeNull();
  });
  it("parseImports extracts relative imports", () => {
    const imports = parseImports('import { x } from "./other.js";');
    expect(imports.length).toBeGreaterThan(0);
    expect(imports[0].module).toContain("./other.js");
  });
  it("parseImports skips bare/package imports", () => {
    const imports = parseImports('import { x } from "lodash";\nimport { y } from "./local.js";');
    const relative = imports.filter((i) => i.module.startsWith("."));
    expect(relative.length).toBe(1);
  });
  it("parseImports handles side-effect imports", () => {
    const imports = parseImports('import "./side-effect.js";');
    expect(imports.length).toBeGreaterThan(0);
  });
});

// state.ts: path utilities + protection zone
describe("state.ts path + zone utilities (branches)", () => {
  it("hasMarkdownExtension detects .md", () => {
    expect(hasMarkdownExtension("file.md")).toBe(true);
    expect(hasMarkdownExtension("file.ts")).toBe(false);
    expect(hasMarkdownExtension("file.MD")).toBe(false);
  });
  it("hasYamlFrontmatter detects frontmatter", () => {
    expect(hasYamlFrontmatter("---\nkey: val\n---\nbody")).toBe(true);
    expect(hasYamlFrontmatter("no frontmatter")).toBe(false);
    expect(hasYamlFrontmatter("")).toBe(false);
  });
  it("normalizeForgePath strips to .tinkerman/-relative", () => {
    expect(normalizeForgePath("project/.tinkerman/specs/x/spec.md")).toBe("specs/x/spec.md");
    expect(normalizeForgePath(".tinkerman/config.md")).toBe("config.md");
  });
  it("normalizeForgePath handles backslash separators", () => {
    expect(normalizeForgePath("project\\.tinkerman\\specs\\x")).toContain("specs/x");
  });
  it("normalizeForgePath handles .. sequences", () => {
    const r = normalizeForgePath(".tinkerman/specs/../specs/x/spec.md");
    expect(r).toContain("specs/x");
  });
  it("getProtectionZone returns frozen for specs/plans/config", () => {
    expect(getProtectionZone("specs/x/spec.md")).toBe("frozen");
    expect(getProtectionZone("plans/x.md")).toBe("frozen");
    expect(getProtectionZone("config.md")).toBe("frozen");
  });
  it("getProtectionZone returns guarded for progress/reviews", () => {
    expect(getProtectionZone("progress/x.md")).toBe("guarded");
    expect(getProtectionZone("reviews/x.md")).toBe("guarded");
  });
  it("getProtectionZone returns open for unknown", () => {
    expect(getProtectionZone("random/path.md")).toBe("open");
  });
  it("extractFrontmatterStatus reads status field", () => {
    expect(extractFrontmatterStatus("---\nstatus: locked\n---\n")).toBe("locked");
    expect(extractFrontmatterStatus('---\nstatus: "approved"\n---\n')).toBe("approved");
    expect(extractFrontmatterStatus("no frontmatter")).toBeNull();
  });
});

// mutate.ts: parseMutationArgs + evaluateMutationVerdict
describe("parseMutationArgs (branch coverage)", () => {
  it("defaults to 'run' command", () => {
    const r = parseMutationArgs([]);
    expect(r.command).toBe("run");
  });
  it("parses kill-survivors command", () => {
    expect(parseMutationArgs(["kill-survivors"]).command).toBe("kill-survivors");
  });
  it("parses report command", () => {
    expect(parseMutationArgs(["report"]).command).toBe("report");
  });
  it("falls back to run for unknown command", () => {
    expect(parseMutationArgs(["bogus"]).command).toBe("run");
  });
  it("parses --target-group=value", () => {
    const r = parseMutationArgs(["--target-group=core"]);
    expect(r.targetGroups).toContain("core");
  });
  it("parses --target-group value (space-separated)", () => {
    const r = parseMutationArgs(["--target-group", "core"]);
    expect(r.targetGroups).toContain("core");
  });
  it("parses --threshold", () => {
    const r = parseMutationArgs(["--threshold", "85"]);
    expect(r.threshold).toBe(85);
  });
  it("parses --required", () => {
    const r = parseMutationArgs(["--required"]);
    expect(r.required).toBe(true);
  });
});

describe("evaluateMutationVerdict (all branches)", () => {
  it("returns warn when targetCount=0", () => {
    expect(
      evaluateMutationVerdict({ mutationScore: 0, threshold: 80, required: true, targetCount: 0 }),
    ).toBe("warn");
  });
  it("returns pass when score >= threshold", () => {
    expect(
      evaluateMutationVerdict({
        mutationScore: 85,
        threshold: 80,
        required: true,
        targetCount: 10,
      }),
    ).toBe("pass");
  });
  it("returns fail when score < threshold + required", () => {
    expect(
      evaluateMutationVerdict({
        mutationScore: 70,
        threshold: 80,
        required: true,
        targetCount: 10,
      }),
    ).toBe("fail");
  });
  it("returns warn when score < threshold + not required", () => {
    expect(
      evaluateMutationVerdict({
        mutationScore: 70,
        threshold: 80,
        required: false,
        targetCount: 10,
      }),
    ).toBe("warn");
  });
});

// spec-parser: parseRequirementsMarkdown
describe("parseRequirementsMarkdown (branch coverage)", () => {
  it("parses requirements content without throwing", () => {
    const md =
      "---\nstatus: locked\nfeature: test\n---\n# Requirements\n\n## Introduction\n\nTest.\n";
    const r = parseRequirementsMarkdown(md);
    expect(typeof r).toBe("object");
  });
  it("returns error for empty content", () => {
    const r = parseRequirementsMarkdown("");
    expect(r.errors).toBeDefined();
  });
  it("returns error for content with no frontmatter", () => {
    const r = parseRequirementsMarkdown("# No frontmatter\n\nbody");
    expect(r.errors).toBeDefined();
  });
});
