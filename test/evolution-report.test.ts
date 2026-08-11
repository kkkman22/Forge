/**
 * Integration tests for the Evolution report aggregation in
 * `src/learn.ts`.
 *
 * Covers Tasks 8.7 and 8.9:
 *   - Task 8.7: aggregation of markers across reviews/progress/findings
 *     produces a report whose header highlights `suggest_adr=true`
 *     targets and whose body lists normal candidates + orphans.
 *   - Task 8.9: `generateEvolutionReport` is snapshot-free — when the
 *     file carrying a marker disappears between two runs, that marker
 *     is absent from the next report, exactly as if the maintenance
 *     step had run.
 *
 * The tests use an in-memory {@link EvolutionReportFs} fake so the
 * driver logic stays isolated from `node:fs`.
 *
 * **Validates: Requirements 8.9, 8.11, 8.14, 8.15**
 */

import { describe, expect, it } from "vitest";
import {
  type EvolutionReportFs,
  generateEvolutionReport,
  renderEvolutionReport,
} from "../src/learn.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date("2026-05-10T08:00:00.000Z");

const SKILLS_REGISTRY = [
  "forge-build",
  "forge-review",
  "forge-ship",
  "forge-decide",
  "forge-learn",
];

/**
 * Minimal in-memory adapter matching {@link EvolutionReportFs}. The
 * Map keys are file paths; directories are synthesised by path-prefix
 * lookup so tests only have to enumerate files.
 */
class InMemoryFs implements EvolutionReportFs {
  constructor(private readonly files: Map<string, string>) {}

  listFilesUnder(dir: string): string[] {
    const prefix = dir.endsWith("/") ? dir : `${dir}/`;
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }

  readFile(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`No such file in fake fs: ${path}`);
    }
    return content;
  }

  exists(path: string): boolean {
    if (this.files.has(path)) return true;
    const prefix = path.endsWith("/") ? path : `${path}/`;
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }
}

/** Build a review file body with a well-formed Evolution marker. */
function markerBlock(date: string, source: string, target: string, description: string): string {
  return [
    `<!-- Evolution: ${date} | source: ${source} | target: ${target} -->`,
    description,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// generateEvolutionReport — Task 8.7
// ---------------------------------------------------------------------------

describe("generateEvolutionReport — Task 8.7 (aggregation)", () => {
  it("aggregates markers across reviews / progress / findings and skips archive", () => {
    const files = new Map<string, string>([
      [
        ".forge/reviews/auth-hardening.md",
        [
          "# Review — auth-hardening",
          markerBlock(
            "2026-05-01",
            "ep-2026-05-01-001",
            "forge-review#new_review_pattern",
            "Review discovered an untracked failure pattern",
          ),
        ].join("\n\n"),
      ],
      [
        ".forge/progress/checkout-flow.md",
        [
          "# Progress — checkout-flow",
          markerBlock(
            "2026-05-02",
            "ep-2026-05-02-001",
            "forge-build#three_strike",
            "TDD failed three times in a row",
          ),
          markerBlock(
            "2026-05-02",
            "ep-2026-05-02-002",
            "forge-build#three_strike",
            "Another three-strike run",
          ),
          markerBlock(
            "2026-05-03",
            "ep-2026-05-03-001",
            "forge-build#three_strike",
            "Third occurrence should trigger ADR suggestion",
          ),
        ].join("\n\n"),
      ],
      [
        ".forge/findings/grill-auth.md",
        markerBlock(
          "2026-05-04",
          "grill-auth",
          "forge-nonexistent",
          "Orphan marker pointing at an unknown skill",
        ),
      ],
      // Archive entry must be ignored — it lives under .forge/archive/
      [
        ".forge/archive/2026-04-20-old/reviews/old.md",
        markerBlock(
          "2026-04-20",
          "ep-2026-04-20-001",
          "forge-build",
          "Archived marker must not leak",
        ),
      ],
    ]);

    const fs = new InMemoryFs(files);
    const report = generateEvolutionReport(fs, ".forge", SKILLS_REGISTRY, FIXED_NOW);

    expect(report.totalMarkers).toBe(5);
    expect(report.bySkill.map((s) => s.targetSkill).sort()).toEqual([
      "forge-build",
      "forge-review",
    ]);

    const build = report.bySkill.find((s) => s.targetSkill === "forge-build");
    expect(build).toBeDefined();
    expect(build?.markerCount).toBe(3);
    expect(build?.suggestAdr).toBe(true);
    expect(build?.sources).toEqual(["ep-2026-05-02-001", "ep-2026-05-02-002", "ep-2026-05-03-001"]);

    const review = report.bySkill.find((s) => s.targetSkill === "forge-review");
    expect(review?.suggestAdr).toBe(false);

    expect(report.orphans).toHaveLength(1);
    expect(report.orphans[0].target).toBe("forge-nonexistent");
  });

  it("tolerates missing directories without throwing", () => {
    const fs = new InMemoryFs(new Map());
    const report = generateEvolutionReport(fs, ".forge", SKILLS_REGISTRY, FIXED_NOW);
    expect(report.totalMarkers).toBe(0);
    expect(report.bySkill).toEqual([]);
    expect(report.orphans).toEqual([]);
  });

  it("ignores non-markdown files (binary artefacts alongside reviews)", () => {
    const files = new Map<string, string>([
      [".forge/reviews/cover.png", "\x89PNG\r\n\x1a\nbinary-goo"],
      [
        ".forge/reviews/notes.md",
        markerBlock("2026-05-05", "ep-2026-05-05-001", "forge-ship", "Valid marker"),
      ],
    ]);
    const fs = new InMemoryFs(files);
    const report = generateEvolutionReport(fs, ".forge", SKILLS_REGISTRY, FIXED_NOW);
    expect(report.totalMarkers).toBe(1);
    expect(report.bySkill[0].targetSkill).toBe("forge-ship");
  });
});

// ---------------------------------------------------------------------------
// renderEvolutionReport — Task 8.7
// ---------------------------------------------------------------------------

describe("renderEvolutionReport — Task 8.7 (markdown output)", () => {
  it("highlights suggest_adr targets at the top and renders orphan section", () => {
    const files = new Map<string, string>([
      [
        ".forge/reviews/big.md",
        [
          markerBlock("2026-05-01", "ep-2026-05-01-001", "forge-build#t", "one"),
          markerBlock("2026-05-02", "ep-2026-05-02-001", "forge-build#t", "two"),
          markerBlock("2026-05-03", "ep-2026-05-03-001", "forge-build#t", "three"),
          markerBlock("2026-05-04", "ep-2026-05-04-001", "forge-ship", "small"),
          markerBlock("2026-05-05", "orphan-source", "forge-unknown", "orphan"),
        ].join("\n\n"),
      ],
    ]);
    const fs = new InMemoryFs(files);
    const report = generateEvolutionReport(fs, ".forge", SKILLS_REGISTRY, FIXED_NOW);
    const rendered = renderEvolutionReport(report);

    expect(rendered).toContain('generated_at: "2026-05-10T08:00:00.000Z"');
    expect(rendered).toContain("total_markers: 5");
    expect(rendered).toContain("# Evolution Report");

    // 🚨 section appears before the 一般 section
    const adrIndex = rendered.indexOf("🚨 建议走 ADR 的高频进化点");
    const normalIndex = rendered.indexOf("一般进化候选");
    const orphanIndex = rendered.indexOf("Orphan 标记");
    expect(adrIndex).toBeGreaterThanOrEqual(0);
    expect(normalIndex).toBeGreaterThan(adrIndex);
    expect(orphanIndex).toBeGreaterThan(normalIndex);

    // forge-build appears in the highlighted section with ADR hint
    expect(rendered).toMatch(/### forge-build \(3 条\)/);
    expect(rendered).toMatch(/建议运行 `\/tinkerman decide` 走 ADR 三问筛/);

    // forge-ship appears in the normal section without ADR hint
    expect(rendered).toMatch(/### forge-ship \(1 条\)/);

    // Orphan section cites file:line and target
    expect(rendered).toMatch(/`\.forge\/reviews\/big\.md:\d+` target `forge-unknown`/);
  });

  it("emits a placeholder when there is nothing to report", () => {
    const fs = new InMemoryFs(new Map());
    const report = generateEvolutionReport(fs, ".forge", SKILLS_REGISTRY, FIXED_NOW);
    const rendered = renderEvolutionReport(report);

    expect(rendered).toContain("# Evolution Report");
    expect(rendered).toContain("_没有检测到 Evolution 标记。_");
    expect(rendered).not.toContain("🚨");
    expect(rendered).not.toContain("Orphan");
  });

  it("is deterministic for the same inputs", () => {
    const files = new Map<string, string>([
      [".forge/reviews/a.md", markerBlock("2026-05-01", "ep-2026-05-01-001", "forge-review", "x")],
    ]);
    const fs = new InMemoryFs(files);
    const first = renderEvolutionReport(
      generateEvolutionReport(fs, ".forge", SKILLS_REGISTRY, FIXED_NOW),
    );
    const second = renderEvolutionReport(
      generateEvolutionReport(fs, ".forge", SKILLS_REGISTRY, FIXED_NOW),
    );
    expect(second).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// Task 8.9 — orphan snapshot handling
// ---------------------------------------------------------------------------

describe("generateEvolutionReport — Task 8.9 (no historical snapshot)", () => {
  it("drops markers from deleted files on the next run", () => {
    const initialFiles = new Map<string, string>([
      [
        ".forge/reviews/topic-a.md",
        markerBlock("2026-05-01", "ep-2026-05-01-001", "forge-build", "Keep-this"),
      ],
      [
        ".forge/progress/topic-b.md",
        markerBlock("2026-05-02", "ep-2026-05-02-001", "forge-review", "Will-be-deleted"),
      ],
    ]);

    const fsBefore = new InMemoryFs(initialFiles);
    const before = generateEvolutionReport(fsBefore, ".forge", SKILLS_REGISTRY, FIXED_NOW);
    expect(before.totalMarkers).toBe(2);
    expect(before.bySkill.map((s) => s.targetSkill).sort()).toEqual([
      "forge-build",
      "forge-review",
    ]);

    // Simulate `/tinkerman learn --maintain` cleaning out the topic-b progress file.
    const afterFiles = new Map<string, string>(initialFiles);
    afterFiles.delete(".forge/progress/topic-b.md");
    const fsAfter = new InMemoryFs(afterFiles);
    const after = generateEvolutionReport(fsAfter, ".forge", SKILLS_REGISTRY, FIXED_NOW);

    expect(after.totalMarkers).toBe(1);
    expect(after.bySkill.map((s) => s.targetSkill)).toEqual(["forge-build"]);
    // The removed marker must not reappear in the orphan list either.
    expect(after.orphans).toEqual([]);
  });

  it("drops markers when the marker comment is edited away but the file survives", () => {
    const markerFile = ".forge/reviews/topic-c.md";
    const before = new InMemoryFs(
      new Map([
        [markerFile, markerBlock("2026-05-03", "ep-2026-05-03-001", "forge-ship", "temp marker")],
      ]),
    );
    expect(generateEvolutionReport(before, ".forge", SKILLS_REGISTRY, FIXED_NOW).totalMarkers).toBe(
      1,
    );

    const after = new InMemoryFs(
      new Map([[markerFile, "# Review — topic-c\n\n(no markers anymore)\n"]]),
    );
    expect(generateEvolutionReport(after, ".forge", SKILLS_REGISTRY, FIXED_NOW).totalMarkers).toBe(
      0,
    );
  });
});
