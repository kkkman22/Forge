import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import { describe, expect, it } from "vitest";
const ROOT = resolve(import.meta.dirname, "..", "..");
/**
 * Expected dispatch_mode for every lib subcommand. This is the canonical
 * matrix: each skills/forge/lib/<sub>/instructions.md frontmatter MUST match.
 *
 * Governance runs unconditionally — do NOT gate this describe on the presence
 * of a spec file. A previous version gated on .kiro/specs/.../spec.md, which
 * got archived, silently skipping the whole contract and letting two subs
 * (charter, replay) drift out of the matrix unnoticed.
 */
const EXPECTED_MODES = {
    learn: "fork",
    decide: "fork",
    "decide-teams": "fork",
    debug: "fork",
    grill: "fork",
    init: "inline",
    storm: "fork",
    recap: "fork",
    mutate: "fork",
    "zoom-out": "fork",
    review: "fork",
    build: "fork",
    "build-light": "inline",
    plan: "fork",
    spec: "fork",
    ship: "fork",
    test: "fork",
    loop: "fork",
    router: "inline",
    status: "inline",
    resume: "inline",
    abort: "inline",
    verify: "inline",
    accept: "fork",
    refactor: "inline",
    fix: "inline",
    pack: "fork",
    "fix-conflicts": "inline",
    "control-cli": "inline",
    "control-ui": "inline",
    "review-comment-bitbucket": "inline",
    "forge-cmux-sidebar-sync": "inline",
    "forge-cmux-browser-qa": "inline",
    "forge-cmux-loop-signals": "inline",
    charter: "fork",
    replay: "inline",
};
describe("R3.5: dispatch_mode governance", () => {
    // The on-disk lib frontmatter is the enforced source of truth — this always
    // runs, regardless of whether the originating spec.md still exists.
    it("every lib frontmatter dispatch_mode matches EXPECTED_MODES", async () => {
        const libs = await glob("skills/forge/lib/*/instructions.md", { cwd: ROOT });
        expect(libs.length, "lib count").toBe(Object.keys(EXPECTED_MODES).length);
        const violations = [];
        for (const libPath of libs) {
            const sub = libPath.split("/")[3];
            const content = readFileSync(resolve(ROOT, libPath), "utf-8");
            const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
            const expectedMode = EXPECTED_MODES[sub];
            if (expectedMode === undefined) {
                violations.push(`${sub}: on disk but missing from EXPECTED_MODES`);
                continue;
            }
            if (!fmMatch) {
                violations.push(`${sub}: no frontmatter`);
                continue;
            }
            const modeMatch = fmMatch[1].match(/dispatch_mode:\s*(\S+)/);
            const actualMode = modeMatch?.[1] ?? "inline";
            if (actualMode !== expectedMode) {
                violations.push(`${sub}: expected=${expectedMode} actual=${actualMode}`);
            }
        }
        expect(violations, violations.join("\n")).toEqual([]);
    });
    it("EXPECTED_MODES has no entry absent from disk (no dead/renamed subs)", async () => {
        const libs = await glob("skills/forge/lib/*/instructions.md", { cwd: ROOT });
        const onDisk = new Set(libs.map((p) => p.split("/")[3]));
        const orphans = Object.keys(EXPECTED_MODES).filter((sub) => !onDisk.has(sub));
        expect(orphans, `EXPECTED_MODES references non-existent subs: ${orphans.join(", ")}`).toEqual([]);
    });
    // The R3.5 spec table (when present) is a cross-check, not a gate. If the
    // spec is archived, the frontmatter governance above still holds.
    const SPEC_PATH = resolve(ROOT, ".kiro/specs/forge-single-entry-skills-collapse/spec.md");
    describe.skipIf(!existsSync(SPEC_PATH))("spec R3.5 table (when spec present)", () => {
        function parseR35Table(specContent) {
            const table = new Map();
            const lines = specContent.split("\n");
            let inTable = false;
            for (const line of lines) {
                if (line.includes("| sub | mode |")) {
                    inTable = true;
                    continue;
                }
                if (inTable &&
                    line.startsWith("|") &&
                    !line.startsWith("|---") &&
                    !line.includes("sub | mode")) {
                    const cols = line
                        .split("|")
                        .map((c) => c.trim())
                        .filter(Boolean);
                    if (cols.length >= 2) {
                        table.set(cols[0], cols[1]);
                    }
                }
                if (inTable && !line.startsWith("|")) {
                    break;
                }
            }
            return table;
        }
        it("spec table agrees with EXPECTED_MODES (bidirectional)", () => {
            const specContent = readFileSync(SPEC_PATH, "utf-8");
            const table = parseR35Table(specContent);
            const mismatches = [];
            for (const [sub, mode] of table) {
                if (EXPECTED_MODES[sub] !== mode) {
                    mismatches.push(`${sub}: spec=${mode} expected=${EXPECTED_MODES[sub] ?? "<absent>"}`);
                }
            }
            for (const sub of Object.keys(EXPECTED_MODES)) {
                if (table.has(sub) && table.get(sub) !== EXPECTED_MODES[sub])
                    continue; // already reported
            }
            expect(mismatches, mismatches.join("\n")).toEqual([]);
        });
    });
});
//# sourceMappingURL=dispatch-mode-rule.test.js.map