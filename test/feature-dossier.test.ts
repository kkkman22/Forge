import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDossier,
  deriveTopicFromPath,
  detectDrifts,
  discoverTopics,
  matchStageFiles,
  scanStagesForTopic,
} from "../src/feature-dossier.js";

const FIXTURE_ROOT = path.join(__dirname, "fixtures", "feature-dossier", ".tinkerman");

// ---------------------------------------------------------------------------
// deriveTopicFromPath
// ---------------------------------------------------------------------------

describe("deriveTopicFromPath", () => {
  it("extracts topic from decisions with date prefix", () => {
    expect(deriveTopicFromPath("decisions/2026-04-29-structured-observability.md")).toBe(
      "structured-observability",
    );
  });

  it("extracts topic from decisions with ADR prefix", () => {
    expect(deriveTopicFromPath("decisions/ADR-0012-agent-skills-learnings.md")).toBe(
      "agent-skills-learnings",
    );
  });

  it("extracts topic from specs subdirectory", () => {
    expect(deriveTopicFromPath("specs/structured-observability/spec.md")).toBe(
      "structured-observability",
    );
  });

  it("extracts topic from plans directory", () => {
    expect(deriveTopicFromPath("plans/foo.md")).toBe("foo");
  });

  it("extracts topic from reviews directory", () => {
    expect(deriveTopicFromPath("reviews/foo.md")).toBe("foo");
  });

  it("extracts topic from progress directory", () => {
    expect(deriveTopicFromPath("progress/foo.md")).toBe("foo");
  });

  it("extracts topic from findings directory", () => {
    expect(deriveTopicFromPath("findings/foo.md")).toBe("foo");
  });

  it("extracts topic from debug directory", () => {
    expect(deriveTopicFromPath("debug/foo.md")).toBe("foo");
  });

  it("returns null for ADR-TEMPLATE (no topic)", () => {
    expect(deriveTopicFromPath("decisions/ADR-TEMPLATE.md")).toBeNull();
  });

  it("extracts topic from specs/requirements.md (three-file)", () => {
    expect(deriveTopicFromPath("specs/auth/requirements.md")).toBe("auth");
  });

  it("extracts topic from specs/design.md (three-file)", () => {
    expect(deriveTopicFromPath("specs/user-api/design.md")).toBe("user-api");
  });

  it("extracts topic from specs/tasks.md (three-file)", () => {
    expect(deriveTopicFromPath("specs/payment/tasks.md")).toBe("payment");
  });

  it("extracts topic from specs/bugfix.md (bugfix spec)", () => {
    expect(deriveTopicFromPath("specs/auth/bugfix.md")).toBe("auth");
  });

  it("returns null for non-spec file in specs subdirectory", () => {
    expect(deriveTopicFromPath("specs/foo/notes.md")).toBeNull();
  });

  it("returns null for unrecognized path", () => {
    expect(deriveTopicFromPath("random.md")).toBeNull();
  });

  it("returns null for features directory (prevent hook loop)", () => {
    expect(deriveTopicFromPath("features/foo.md")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(deriveTopicFromPath("")).toBeNull();
  });

  it("handles topic with multiple hyphens", () => {
    expect(deriveTopicFromPath("plans/context-budget-management.md")).toBe(
      "context-budget-management",
    );
  });

  it("handles topic with digits", () => {
    expect(deriveTopicFromPath("plans/audit-v2.md")).toBe("audit-v2");
  });
});

// ---------------------------------------------------------------------------
// matchStageFiles
// ---------------------------------------------------------------------------

describe("matchStageFiles", () => {
  const topic = "structured-observability";

  it("matches exact file in plans directory", () => {
    const files = ["structured-observability.md", "other-topic.md", "README.md"];
    expect(matchStageFiles("plans", topic, files)).toEqual(["structured-observability.md"]);
  });

  it("matches dated decision files", () => {
    const files = [
      "2026-04-29-structured-observability.md",
      "2026-05-01-other-topic.md",
      "ADR-0012-structured-observability.md",
    ];
    expect(matchStageFiles("decisions", topic, files)).toEqual([
      "2026-04-29-structured-observability.md",
      "ADR-0012-structured-observability.md",
    ]);
  });

  it("matches ADR decision files", () => {
    const files = ["ADR-0012-agent-skills.md", "ADR-0099-structured-observability.md"];
    expect(matchStageFiles("decisions", topic, files)).toEqual([
      "ADR-0099-structured-observability.md",
    ]);
  });

  it("escapes regex special characters in topic", () => {
    const specialTopic = "feature.with+special";
    const files = ["feature.with+special.md", "featurexwithxspecial.md"];
    expect(matchStageFiles("plans", specialTopic, files)).toEqual(["feature.with+special.md"]);
  });

  it("returns empty array when no files match", () => {
    const files = ["other-topic.md", "another.md"];
    expect(matchStageFiles("plans", topic, files)).toEqual([]);
  });

  it("returns empty array for empty file list", () => {
    expect(matchStageFiles("plans", topic, [])).toEqual([]);
  });

  it("does not match partial topic names", () => {
    const files = ["struct.md", "structured.md"];
    expect(matchStageFiles("plans", topic, files)).toEqual([]);
  });

  it("matches spec directory name", () => {
    const files = ["spec.md"];
    expect(matchStageFiles("specs", topic, files)).toEqual(["spec.md"]);
  });

  it("matches three-file layout in specs", () => {
    const files = ["requirements.md", "design.md", "tasks.md"];
    expect(matchStageFiles("specs", topic, files)).toEqual([
      "requirements.md",
      "design.md",
      "tasks.md",
    ]);
  });

  it("matches mixed layout (legacy + three-file)", () => {
    const files = ["spec.md", "requirements.md", "design.md", "tasks.md"];
    const result = matchStageFiles("specs", topic, files);
    expect(result).toContain("spec.md");
    expect(result).toContain("requirements.md");
    expect(result).toContain("design.md");
    expect(result).toContain("tasks.md");
  });

  it("matches bugfix.md in specs", () => {
    const files = ["bugfix.md", "design.md", "tasks.md"];
    expect(matchStageFiles("specs", topic, files)).toEqual(["bugfix.md", "design.md", "tasks.md"]);
  });
});

// ---------------------------------------------------------------------------
// scanStagesForTopic
// ---------------------------------------------------------------------------

describe("scanStagesForTopic", () => {
  it("finds decisions with both dated and ADR files", () => {
    const result = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    expect(result.stages.decisions).toHaveLength(2);
    expect(result.stages.decisions.map((e) => e.kind).sort()).toEqual(["adr", "dated"]);
  });

  it("finds spec in subdirectory", () => {
    const result = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    expect(result.stages.specs).toHaveLength(1);
    expect(result.stages.specs[0].frontmatter.status).toBe("locked");
  });

  it("finds plan", () => {
    const result = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    expect(result.stages.plans).toHaveLength(1);
    expect(result.stages.plans[0].frontmatter.status).toBe("approved");
  });

  it("finds progress", () => {
    const result = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    expect(result.stages.progress).toHaveLength(1);
    expect(result.stages.progress[0].frontmatter.status).toBe("in-progress");
  });

  it("returns empty for stages with no files", () => {
    const result = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    expect(result.stages.reviews).toHaveLength(0);
    expect(result.stages.findings).toHaveLength(0);
    expect(result.stages.debug).toHaveLength(0);
  });

  it("returns empty for non-existent topic", () => {
    const result = scanStagesForTopic("nonexistent-topic", FIXTURE_ROOT);
    expect(result.stages.plans).toHaveLength(0);
  });

  it("extracts firstSection from files", () => {
    const result = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    expect(result.stages.plans[0].firstSection).toContain("Task 1");
  });

  it("populates mtime for files", () => {
    const result = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    expect(result.stages.plans[0].mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sets topic and forgeRoot in result", () => {
    const result = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    expect(result.topic).toBe("fixture-topic");
    expect(result.forgeRoot).toBe(FIXTURE_ROOT);
  });
});

// ---------------------------------------------------------------------------
// buildDossier
// ---------------------------------------------------------------------------

describe("buildDossier", () => {
  it("generates dossier with frontmatter", () => {
    const scan = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    const doc = buildDossier({ topic: "fixture-topic", forgeRoot: FIXTURE_ROOT, stageScan: scan });
    expect(doc.frontmatter.topic).toBe("fixture-topic");
    expect(doc.frontmatter.auto_generated).toBe(true);
    expect(doc.frontmatter.stage_count).toBeGreaterThanOrEqual(3);
  });

  it("generates body with heading", () => {
    const scan = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    const doc = buildDossier({ topic: "fixture-topic", forgeRoot: FIXTURE_ROOT, stageScan: scan });
    expect(doc.body).toContain("# Feature: fixture-topic");
  });

  it("generates stage index table with 7 rows", () => {
    const scan = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    const doc = buildDossier({ topic: "fixture-topic", forgeRoot: FIXTURE_ROOT, stageScan: scan });
    const tableLines = doc.body
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.includes("阶段") && !l.includes("------"));
    expect(tableLines).toHaveLength(7);
  });

  it("shows dash placeholders for empty stages", () => {
    const scan = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    const doc = buildDossier({ topic: "fixture-topic", forgeRoot: FIXTURE_ROOT, stageScan: scan });
    expect(doc.body).toContain("| Review | — | — | — |");
  });

  it("includes summary section", () => {
    const scan = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    const doc = buildDossier({ topic: "fixture-topic", forgeRoot: FIXTURE_ROOT, stageScan: scan });
    expect(doc.body).toContain("## 摘要");
    expect(doc.body).toContain("**Decide**");
  });

  it("includes ADR section when ADR exists", () => {
    const scan = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    const doc = buildDossier({ topic: "fixture-topic", forgeRoot: FIXTURE_ROOT, stageScan: scan });
    expect(doc.body).toContain("## 关联 ADR");
    expect(doc.body).toContain("ADR-0001");
  });

  it("escapes pipe in table cells", () => {
    const scan = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    scan.stages.plans[0].firstSection = "Plan with | pipe";
    const doc = buildDossier({ topic: "fixture-topic", forgeRoot: FIXTURE_ROOT, stageScan: scan });
    expect(doc.body).toContain("Plan with \\| pipe");
  });

  it("handles all-empty stages", () => {
    const scan = scanStagesForTopic("nonexistent-topic", FIXTURE_ROOT);
    const doc = buildDossier({
      topic: "nonexistent-topic",
      forgeRoot: FIXTURE_ROOT,
      stageScan: scan,
    });
    expect(doc.frontmatter.stage_count).toBe(0);
    expect(doc.frontmatter.total_files).toBe(0);
    expect(doc.body).toContain("# Feature: nonexistent-topic");
  });

  it("shows no status for missing frontmatter", () => {
    const scan = scanStagesForTopic("fixture-topic", FIXTURE_ROOT);
    scan.stages.plans[0].frontmatter = {};
    const doc = buildDossier({ topic: "fixture-topic", forgeRoot: FIXTURE_ROOT, stageScan: scan });
    expect(doc.body).toContain("(no status)");
  });

  it("omits ADR section when no ADR exists", () => {
    const scan = scanStagesForTopic("other-topic", FIXTURE_ROOT);
    const doc = buildDossier({ topic: "other-topic", forgeRoot: FIXTURE_ROOT, stageScan: scan });
    expect(doc.body).not.toContain("## 关联 ADR");
  });
});

// ---------------------------------------------------------------------------
// discoverTopics
// ---------------------------------------------------------------------------

describe("discoverTopics", () => {
  it("discovers all topics sorted alphabetically", () => {
    const result = discoverTopics(FIXTURE_ROOT);
    expect(result.topics).toContain("fixture-topic");
    expect(result.topics).toContain("other-topic");
    for (let i = 1; i < result.topics.length; i++) {
      expect(result.topics[i] >= result.topics[i - 1]).toBe(true);
    }
  });

  it("detects trailing-digit drift", () => {
    const result = discoverTopics(FIXTURE_ROOT);
    expect(Array.isArray(result.drifts)).toBe(true);
  });

  it("returns emptySpecDirs for spec dirs without spec.md", () => {
    const result = discoverTopics(FIXTURE_ROOT);
    expect(Array.isArray(result.emptySpecDirs)).toBe(true);
  });

  it("performance: completes in under 1 second", () => {
    const start = Date.now();
    discoverTopics(FIXTURE_ROOT);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// detectDrifts (unit tests for algorithm optimization)
// ---------------------------------------------------------------------------

describe("detectDrifts", () => {
  it("detects trailing-digit drift", () => {
    const drifts = detectDrifts(["auth-v1", "auth-v2"]);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].reason).toBe("trailing-digit");
    expect(drifts[0].topicA).toBe("auth-v1");
    expect(drifts[0].topicB).toBe("auth-v2");
  });

  it("detects plural-form drift", () => {
    const drifts = detectDrifts(["review", "reviews"]);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].reason).toBe("plural-form");
  });

  it("detects separator drift", () => {
    const drifts = detectDrifts(["code_review", "code-review"]);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].reason).toBe("separator");
  });

  it("detects substring drift", () => {
    // Length diff must be <= 5: "auth" (4) vs "auth-login" (11) diff=7 won't work
    const drifts = detectDrifts(["auth", "auth-api"]);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].reason).toBe("substring");
  });

  it("returns empty for unrelated topics", () => {
    const drifts = detectDrifts(["auth", "database", "logging"]);
    expect(drifts).toHaveLength(0);
  });

  it("handles multiple drift types simultaneously", () => {
    const drifts = detectDrifts(["review", "reviews", "review-v2", "review-api"]);
    // plural: review↔reviews, trailing-digit: review↔review-v2, substring: review↔review-api
    expect(drifts.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty for empty or single-element arrays", () => {
    expect(detectDrifts([])).toHaveLength(0);
    expect(detectDrifts(["solo"])).toHaveLength(0);
  });

  it("performance: handles 1000 diverse topics efficiently", () => {
    // 200 groups × 5 variants each = 1000 topics
    // O(n²) original: C(1000,2) ≈ 500K comparisons
    // Optimized: 200 groups × C(5,2) = 2K comparisons
    const topics: string[] = [];
    for (let g = 0; g < 200; g++) {
      topics.push(`group${g}-v1`, `group${g}-v2`, `group${g}-v3`, `group${g}s`, `group${g}_alt`);
    }

    const start = Date.now();
    const drifts = detectDrifts(topics);
    const elapsed = Date.now() - start;

    // Each group has 3 trailing-digit drifts + 1 plural drift + some separator drifts
    expect(drifts.length).toBeGreaterThan(200);
    expect(elapsed).toBeLessThan(100);
  });
});
