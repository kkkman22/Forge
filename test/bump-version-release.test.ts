import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// bump-version.mjs guards main() behind `import.meta.url === file://argv[1]`,
// so importing it is side-effect-free and we can unit-test the exported helpers.
import { extractChangelogSection, formatReleaseSummary } from "../scripts/bump-version.mjs";

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
});
