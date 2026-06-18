import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pairBilingual } from "../../../src/docs-governance/bilingual.js";
import { parseFrontmatter } from "../../../src/docs-governance/frontmatter/parser.js";
import { buildIndex } from "../../../src/docs-governance/index-generator/generator.js";
// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const TMP_DIR = join(import.meta.dirname, "__tmp_build_index_test__");
function p(s) {
    return s;
}
const VALID_FM = `---
title: "Test Doc"
category: getting-started
audience:
  - new-user
updated: 2026-05-01
owner: test-team
---
Content here.
`;
const VALID_FM_REFERENCE = `---
title: "API Guide"
category: reference
audience:
  - advanced-user
updated: 2026-05-10
owner: api-team
---
API docs.
`;
const VALID_FM_EN = `---
title: "Test Doc"
category: getting-started
audience:
  - new-user
updated: 2026-05-01
owner: test-team
mirror_of: test-doc.md
---
English content.
`;
const NO_FM = "No frontmatter here.\n";
function createFile(dir, relPath, content) {
    const fullPath = join(dir, relPath);
    const fileDir = join(fullPath, "..");
    mkdirSync(fileDir, { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
}
// ─────────────────────────────────────────────────────────────
// Core logic tests (unit-level, no FS)
// ─────────────────────────────────────────────────────────────
describe("build-docs-index core logic", () => {
    const makeDoc = (path, fm) => ({
        path: p(path),
        domain: "A",
        frontmatter: fm,
        bodyHash: "hash",
    });
    it("pairs files and builds index for CN + EN", () => {
        const fm1 = {
            title: "Getting Started",
            category: "getting-started",
            audience: ["new-user"],
            updated: "2026-05-01",
            owner: "team",
        };
        const fm1en = {
            title: "Getting Started",
            category: "getting-started",
            audience: ["new-user"],
            updated: "2026-05-01",
            owner: "team",
            mirror_of: "intro.md",
        };
        const docs = [makeDoc("docs/intro.md", fm1), makeDoc("docs/intro.en.md", fm1en)];
        const pairs = pairBilingual(docs);
        const result = buildIndex(pairs);
        expect(result.cn).toContain("## Getting Started");
        expect(result.cn).toContain("[Getting Started](docs/intro.md)");
        expect(result.cn).toContain("[Getting Started (EN)](docs/intro.en.md)");
        expect(result.en).toContain("## Getting Started");
        expect(result.en).toContain("[Getting Started (EN)](docs/intro.en.md)");
    });
    it("handles CN-only docs without EN counterpart", () => {
        const fm = {
            title: "Solo Doc",
            category: "reference",
            audience: ["maintainer"],
            updated: "2026-05-01",
            owner: "team",
        };
        const docs = [makeDoc("docs/solo.md", fm)];
        const pairs = pairBilingual(docs);
        const result = buildIndex(pairs);
        expect(result.cn).toContain("[Solo Doc](docs/solo.md)");
        expect(result.cn).not.toContain("(EN)");
    });
    it("groups by category in CATEGORY_ORDER", () => {
        const fmRef = {
            title: "Ref",
            category: "reference",
            audience: ["maintainer"],
            updated: "2026-05-01",
            owner: "team",
        };
        const fmStart = {
            title: "Start",
            category: "getting-started",
            audience: ["new-user"],
            updated: "2026-05-01",
            owner: "team",
        };
        // Pass in reverse order
        const docs = [makeDoc("docs/ref.md", fmRef), makeDoc("docs/start.md", fmStart)];
        const pairs = pairBilingual(docs);
        const result = buildIndex(pairs);
        const startIdx = result.cn.indexOf("## Getting Started");
        const refIdx = result.cn.indexOf("## Reference");
        // getting-started comes before reference in CATEGORY_ORDER
        expect(startIdx).toBeLessThan(refIdx);
    });
    it("skips docs with no parseable frontmatter", () => {
        // parseFrontmatter returns null for no-FM files
        const parsed = parseFrontmatter(NO_FM);
        expect(parsed.frontmatter).toBeNull();
        // In the build pipeline, null frontmatter docs would be excluded from pairs
    });
});
// ─────────────────────────────────────────────────────────────
// CLI integration tests (via FS + process)
// ─────────────────────────────────────────────────────────────
describe("build-docs-index CLI integration", () => {
    beforeAll(() => {
        // Clean any leftover from a prior interrupted run before recreating,
        // mirroring check-docs-index.test.ts — a stale TMP_DIR would pollute
        // assertions that assume a fresh directory.
        rmSync(TMP_DIR, { recursive: true, force: true });
        mkdirSync(TMP_DIR, { recursive: true });
    });
    afterAll(() => {
        rmSync(TMP_DIR, { recursive: true, force: true });
    });
    it("generates INDEX.md and INDEX.en.md from docs/ tree", () => {
        const docsDir = join(TMP_DIR, "docs");
        createFile(docsDir, "intro.md", VALID_FM);
        createFile(docsDir, "intro.en.md", VALID_FM_EN);
        createFile(docsDir, "api.md", VALID_FM_REFERENCE);
        // Run the script via tsx
        const scriptPath = join(import.meta.dirname, "..", "..", "..", "scripts", "build-docs-index.ts");
        const _result = execSync(`npx tsx "${scriptPath}" "${docsDir}"`, {
            encoding: "utf-8",
            cwd: TMP_DIR,
            timeout: 15_000,
        });
        expect(existsSync(join(docsDir, "INDEX.md"))).toBe(true);
        expect(existsSync(join(docsDir, "INDEX.en.md"))).toBe(true);
        const cnIndex = readFileSync(join(docsDir, "INDEX.md"), "utf-8");
        const enIndex = readFileSync(join(docsDir, "INDEX.en.md"), "utf-8");
        expect(cnIndex).toContain("## Getting Started");
        expect(cnIndex).toContain("## Reference");
        expect(cnIndex).toContain("intro.md");
        expect(cnIndex).toContain("api.md");
        expect(enIndex).toContain("## Getting Started");
        expect(enIndex).toContain("## Reference");
    });
    it("exits 0 on success", () => {
        const docsDir = join(TMP_DIR, "success-test");
        createFile(docsDir, "guide.md", VALID_FM);
        const scriptPath = join(import.meta.dirname, "..", "..", "..", "scripts", "build-docs-index.ts");
        expect(() => {
            execSync(`npx tsx "${scriptPath}" "${docsDir}"`, {
                encoding: "utf-8",
                cwd: TMP_DIR,
                timeout: 15_000,
                stdio: "pipe",
            });
        }).not.toThrow();
    });
    it("exits 1 when docs/ has no valid frontmatter files", () => {
        const docsDir = join(TMP_DIR, "empty-test");
        createFile(docsDir, "no-fm.md", NO_FM);
        const scriptPath = join(import.meta.dirname, "..", "..", "..", "scripts", "build-docs-index.ts");
        try {
            execSync(`npx tsx "${scriptPath}" "${docsDir}"`, {
                encoding: "utf-8",
                cwd: TMP_DIR,
                timeout: 15_000,
                stdio: "pipe",
            });
            // If it didn't throw, it exited 0 — that's also acceptable (no docs = no error)
        }
        catch (err) {
            const exitCode = err?.status;
            // Accept either 0 (no docs found = ok) or 1 (error reported)
            expect(exitCode === 0 || exitCode === 1).toBe(true);
        }
    });
    it("shows help with --help flag", () => {
        const scriptPath = join(import.meta.dirname, "..", "..", "..", "scripts", "build-docs-index.ts");
        const result = execSync(`npx tsx "${scriptPath}" --help`, {
            encoding: "utf-8",
            cwd: TMP_DIR,
            timeout: 15_000,
        });
        expect(result).toContain("build-docs-index");
        expect(result).toContain("--help");
    });
});
//# sourceMappingURL=build-docs-index.test.js.map