import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// bump-version.mjs guards main() behind `import.meta.url === file://argv[1]`,
// so importing it is side-effect-free and we can unit-test the exported helpers.
import {
  extractChangelogSection,
  formatReleaseSummary,
  mergeChangelogEntries,
} from "../scripts/bump-version.mjs";

describe("bump-version.mjs release helpers", () => {
  describe("extractChangelogSection", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "forge-bump-"));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("extracts the body between ## [version] and the next ## [ header", () => {
      const changelog = [
        "# Changelog",
        "",
        "## [Unreleased]",
        "",
        "## [3.6.0] - 2026-06-21",
        "",
        "### Added",
        "",
        "- new feature A",
        "",
        "## [3.5.0] - 2026-05-01",
        "",
        "### Fixed",
        "",
        "- old fix",
      ].join("\n");
      const changelogPath = join(tmpDir, "CHANGELOG.md");
      writeFileSync(changelogPath, changelog);

      const result = extractChangelogSection("3.6.0", changelogPath);
      expect(result).toContain("### Added");
      expect(result).toContain("- new feature A");
      expect(result).not.toContain("- old fix");
    });

    it("returns null when the version section does not exist", () => {
      const changelogPath = join(tmpDir, "CHANGELOG.md");
      writeFileSync(changelogPath, "## [Unreleased]\n\n- nothing\n");
      const result = extractChangelogSection("9.9.9", changelogPath);
      expect(result).toBeNull();
    });

    it("returns null when CHANGELOG.md is missing", () => {
      const result = extractChangelogSection("3.6.0", join(tmpDir, "nope.md"));
      expect(result).toBeNull();
    });

    it("defaults to the workspace CHANGELOG.md when path is omitted", () => {
      // 不传第二参数时应回退到 ROOT/CHANGELOG.md（项目根存在该文件）
      const result = extractChangelogSection("3.6.0");
      expect(result).not.toBeNull();
      expect(result).toContain("### Added");
    });
  });

  describe("formatReleaseSummary", () => {
    it("reports success when release was created", () => {
      const line = formatReleaseSummary({ doTag: true, releaseCreated: true });
      expect(line).toBe("  GitHub Release: ✅");
    });

    it("reports failure (not success) when release was NOT created", () => {
      // 这是本次修复的核心回归点：失败时绝不能打印 ✅
      const line = formatReleaseSummary({ doTag: true, releaseCreated: false });
      expect(line).not.toContain("✅");
      expect(line).toContain("❌");
    });

    it("returns empty string when --tag was not requested", () => {
      const line = formatReleaseSummary({ doTag: false, releaseCreated: false });
      expect(line).toBe("");
    });
  });

  // Regression: v3.6.1 release lost the detailed migration note because
  // bump-version merged auto-generated commit entries with manual [Unreleased]
  // entries by simple concatenation. This produced DUPLICATE section headers
  // (two `### Fixed` blocks) and the extractChangelogSection() picked the first
  // (the terse auto-gen summary), burying the manual detailed block with the
  // ⚠️ migration warning. mergeChangelogEntries must (a) collapse duplicate
  // sections and (b) drop auto-gen entries whose PR/commit ref already appears
  // in a manual entry.
  describe("mergeChangelogEntries", () => {
    it("collapses duplicate ### Fixed sections into one, keeping the manual (detailed) entry", () => {
      // Auto-gen produced a one-line summary for #122.
      const auto = [
        "### Fixed",
        "",
        "- **init**: repair Claude Code hooks schema + init.sh resilience (#122)",
      ].join("\n");
      // Manual entry under [Unreleased] has the detailed block + migration note.
      const manual = [
        "### Fixed",
        "",
        "- **init/hooks**: repair Claude Code hooks schema + init.sh resilience (#122)",
        "  - **hooks/hooks.json**: 15 of 41 hook entries used the unsupported `args` form...",
        "  - **⚠️ Migration for existing projects**: upgrading the plugin alone does NOT fix...",
      ].join("\n");

      const merged = mergeChangelogEntries(auto, manual);
      expect(merged, "merge of two non-null inputs must not be null").not.toBeNull();

      // Exactly ONE `### Fixed` header.
      const fixedHeaderCount = (merged!.match(/### Fixed/g) || []).length;
      expect(fixedHeaderCount, "must not produce duplicate ### Fixed sections").toBe(1);
      // The detailed manual entry (with the migration note) must survive.
      expect(merged).toContain("⚠️ Migration for existing projects");
      // The terse auto-gen one-liner for the SAME PR (#122) must be dropped.
      expect(merged).not.toContain("- **init**: repair Claude Code hooks schema");
    });

    it("keeps auto-gen entries for PRs NOT covered by a manual entry", () => {
      const auto = [
        "### Fixed",
        "",
        "- **bump-version**: report true GitHub Release outcome in summary (#118)",
        "- **init**: repair Claude Code hooks schema + init.sh resilience (#122)",
      ].join("\n");
      const manual = [
        "### Fixed",
        "",
        "- **init/hooks**: detailed manual entry for #122 with migration note",
      ].join("\n");

      const merged = mergeChangelogEntries(auto, manual);

      // #118 (not in manual) is preserved; #122 terse line is dropped (manual covers it).
      expect(merged).toContain("#118");
      expect(merged).toContain("detailed manual entry for #122");
      expect(merged).not.toContain("- **init**: repair Claude Code hooks schema");
    });

    it("returns manual entries verbatim when auto-gen is null", () => {
      const manual = "### Fixed\n\n- manual fix only";
      const merged = mergeChangelogEntries(null, manual);
      expect(merged).toBe(manual);
    });

    it("returns auto-gen entries verbatim when manual is null", () => {
      const auto = "### Added\n\n- auto feature";
      const merged = mergeChangelogEntries(auto, null);
      expect(merged).toBe(auto);
    });

    it("merges entries across different sections (Added + Fixed)", () => {
      const auto = "### Added\n\n- auto feature (#119)";
      const manual = [
        "### Added",
        "",
        "- manual feature detail (#119)",
        "",
        "### Fixed",
        "",
        "- manual fix (#122)",
      ].join("\n");

      const merged = mergeChangelogEntries(auto, manual);
      expect(merged, "merge of two non-null inputs must not be null").not.toBeNull();

      // One Added (manual detail wins, auto #119 dropped), one Fixed (manual only).
      expect((merged!.match(/### Added/g) || []).length).toBe(1);
      expect((merged!.match(/### Fixed/g) || []).length).toBe(1);
      expect(merged).toContain("manual feature detail (#119)");
      expect(merged).not.toContain("auto feature (#119)");
    });
  });
});
