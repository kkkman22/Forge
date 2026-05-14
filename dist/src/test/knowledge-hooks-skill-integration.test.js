import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dispatchKnowledgeEvent, hashEvent, } from "../src/knowledge-hooks.js";
describe("knowledge-hooks dispatch integration", () => {
    let forgeRoot;
    let knowledgeDir;
    let decisionsDir;
    let solutionsDir;
    beforeEach(() => {
        forgeRoot = mkdtempSync(join(tmpdir(), "kh-test-"));
        knowledgeDir = join(forgeRoot, "knowledge");
        decisionsDir = join(forgeRoot, "decisions");
        solutionsDir = join(knowledgeDir, "solutions");
        mkdirSync(knowledgeDir, { recursive: true });
        mkdirSync(decisionsDir, { recursive: true });
        mkdirSync(solutionsDir, { recursive: true });
    });
    afterEach(() => {
        rmSync(forgeRoot, { recursive: true, force: true });
    });
    function makeInput(event) {
        return { event, forgeRoot, recentHashes: new Set(), now: new Date() };
    }
    describe("adr_written → catalog rebuild", () => {
        it("rebuilds catalog when ADR is written", async () => {
            writeFileSync(join(decisionsDir, "ADR-0042.md"), "---\nstatus: accepted\n---\n# ADR-0042\n", "utf-8");
            const result = await dispatchKnowledgeEvent(makeInput({ kind: "adr_written", path: join(decisionsDir, "ADR-0042.md") }));
            expect(result.kind).toBe("rebuilt");
            if (result.kind === "rebuilt") {
                expect(result.affectedFiles).toContain(join(knowledgeDir, "catalog.md"));
            }
        });
        it("skips when throttled", async () => {
            const event = { kind: "adr_written", path: "x" };
            const result = await dispatchKnowledgeEvent({
                event,
                forgeRoot,
                recentHashes: new Set([hashEvent(event)]),
                now: new Date(),
            });
            expect(result.kind).toBe("skipped");
            if (result.kind === "skipped") {
                expect(result.reason).toBe("throttled");
            }
        });
    });
    describe("solution_written → integrity lint", () => {
        it("runs integrity lint on solution write", async () => {
            writeFileSync(join(solutionsDir, "auth.md"), "---\ntitle: Auth\ndate: '2026-05-14'\nconfidence: '0.8'\ntags: [security]\n---\n# Auth\n", "utf-8");
            const result = await dispatchKnowledgeEvent(makeInput({
                kind: "solution_written",
                topic: "auth",
                path: join(solutionsDir, "auth.md"),
            }));
            expect(result.kind).toBe("linted");
            if (result.kind === "linted") {
                expect(Array.isArray(result.findings)).toBe(true);
            }
        });
    });
    describe("catalog_read → freshness check", () => {
        it("rebuilds stale catalog", async () => {
            // Write input files
            writeFileSync(join(knowledgeDir, "instincts.md"), "# Instincts\n### Test\n**confidence**: 0.8\n", "utf-8");
            // Write old catalog — force mtime to 1 hour ago
            const catalogPath = join(knowledgeDir, "catalog.md");
            writeFileSync(catalogPath, "---\ngenerated: 2020-01-01\n---\n# Old\n", "utf-8");
            const oneHourAgo = (Date.now() - 3600000) / 1000;
            utimesSync(catalogPath, oneHourAgo, oneHourAgo);
            const result = await dispatchKnowledgeEvent(makeInput({ kind: "catalog_read", readerSkill: "forge-plan" }));
            expect(result.kind).toBe("rebuilt");
        });
        it("skips fresh catalog", async () => {
            // Write catalog that's newer than everything
            writeFileSync(join(knowledgeDir, "catalog.md"), "---\ngenerated: 2099-01-01\n---\n# Fresh\n", "utf-8");
            const result = await dispatchKnowledgeEvent(makeInput({ kind: "catalog_read", readerSkill: "forge-plan" }));
            expect(result.kind).toBe("skipped");
            if (result.kind === "skipped") {
                expect(result.reason).toBe("cache_fresh");
            }
        });
        it("rebuilds when no catalog exists", async () => {
            writeFileSync(join(knowledgeDir, "instincts.md"), "# Instincts\n### Test\n**confidence**: 0.8\n", "utf-8");
            const result = await dispatchKnowledgeEvent(makeInput({ kind: "catalog_read", readerSkill: "forge-plan" }));
            expect(result.kind).toBe("rebuilt");
        });
    });
    describe("episode_threshold_crossed", () => {
        it("returns proposals result", async () => {
            const result = await dispatchKnowledgeEvent(makeInput({ kind: "episode_threshold_crossed", threshold: 5, count: 5 }));
            expect(result.kind).toBe("instincts_proposals");
            if (result.kind === "instincts_proposals") {
                expect(Array.isArray(result.proposals)).toBe(true);
            }
        });
    });
    describe("instincts_written → catalog rebuild", () => {
        it("rebuilds catalog", async () => {
            const result = await dispatchKnowledgeEvent(makeInput({ kind: "instincts_written", path: "knowledge/instincts.md" }));
            expect(result.kind).toBe("rebuilt");
        });
    });
    describe("glossary_written → catalog rebuild", () => {
        it("rebuilds catalog", async () => {
            const result = await dispatchKnowledgeEvent(makeInput({ kind: "glossary_written", path: "glossary.md" }));
            expect(result.kind).toBe("rebuilt");
        });
    });
    describe("known_failures_written → catalog rebuild", () => {
        it("rebuilds catalog", async () => {
            const result = await dispatchKnowledgeEvent(makeInput({ kind: "known_failures_written", path: "knowledge/known-failures.md" }));
            expect(result.kind).toBe("rebuilt");
        });
    });
});
//# sourceMappingURL=knowledge-hooks-skill-integration.test.js.map