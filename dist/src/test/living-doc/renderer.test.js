import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { escapeHtml, renderContextPage, renderIndexPage, renderLivingDoc, } from "../../src/living-doc/renderer.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeContext(overrides) {
    return {
        name: "Order",
        specs: [
            {
                topic: "order-creation",
                specPath: "specs/order-creation.md",
                scenarios: [
                    {
                        title: "Create order successfully",
                        tags: ["happy-path"],
                        lastVerdict: "pass",
                        lastRunAt: "2026-05-10T10:00:00.000Z",
                        sourceLine: 10,
                        acceptanceReportPath: null,
                    },
                    {
                        title: "Reject duplicate order",
                        tags: [],
                        lastVerdict: "fail",
                        lastRunAt: "2026-05-10T10:01:00.000Z",
                        sourceLine: 20,
                        acceptanceReportPath: "acceptance/order.md",
                    },
                ],
            },
        ],
        stats: { total: 2, pass: 1, fail: 1, pending: 0 },
        ...overrides,
    };
}
function makeData(contexts) {
    const ctx = contexts ?? new Map([["Order", makeContext()]]);
    let total = 0;
    let pass = 0;
    let fail = 0;
    let pending = 0;
    for (const c of ctx.values()) {
        total += c.stats.total;
        pass += c.stats.pass;
        fail += c.stats.fail;
        pending += c.stats.pending;
    }
    return {
        generatedAt: "2026-05-10T12:00:00.000Z",
        contexts: ctx,
        globalStats: { totalScenarios: total, pass, fail, pending },
    };
}
let tmpDir;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-renderer-"));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});
// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe("escapeHtml", () => {
    it("escapes <, >, &, \", '", () => {
        const input = `<script>alert("xss"&'bug')</script>`;
        const result = escapeHtml(input);
        expect(result).toBe("&lt;script&gt;alert(&quot;xss&quot;&amp;&#39;bug&#39;)&lt;/script&gt;");
    });
    it("returns original when no special chars", () => {
        const input = "Hello World 123";
        expect(escapeHtml(input)).toBe("Hello World 123");
    });
});
// ---------------------------------------------------------------------------
// renderIndexPage
// ---------------------------------------------------------------------------
describe("renderIndexPage", () => {
    it("contains title Forge Living Documentation", () => {
        const html = renderIndexPage(makeData());
        expect(html).toContain("<title>Forge Living Documentation</title>");
        expect(html).toContain("Forge Living Documentation");
    });
    it("contains global stats", () => {
        const data = makeData();
        const html = renderIndexPage(data);
        expect(html).toContain("2"); // total
        expect(html).toContain("1"); // pass
    });
    it("contains context cards with links", () => {
        const html = renderIndexPage(makeData());
        expect(html).toContain("Order.html");
        expect(html).toContain("Order");
    });
    it("escapes context names with special chars", () => {
        const malicious = makeContext({
            name: '<img onerror="alert(1)">',
        });
        const data = makeData(new Map([['<img onerror="alert(1)">', malicious]]));
        const html = renderIndexPage(data);
        expect(html).not.toContain("<img onerror");
        expect(html).toContain("&lt;img onerror");
    });
});
// ---------------------------------------------------------------------------
// renderContextPage
// ---------------------------------------------------------------------------
describe("renderContextPage", () => {
    it("contains context name in title", () => {
        const html = renderContextPage(makeContext(), "Order", "2026-05-10T12:00:00.000Z");
        expect(html).toContain("<title>Context: Order</title>");
    });
    it("contains scenario table", () => {
        const html = renderContextPage(makeContext(), "Order", "2026-05-10T12:00:00.000Z");
        expect(html).toContain("Create order successfully");
        expect(html).toContain("Reject duplicate order");
        expect(html).toContain("<table");
    });
    it("shows verdicts with emoji", () => {
        const html = renderContextPage(makeContext(), "Order", "2026-05-10T12:00:00.000Z");
        // pass = ✅, fail = ❌
        expect(html).toContain("✅");
        expect(html).toContain("❌");
    });
});
// ---------------------------------------------------------------------------
// renderLivingDoc (file output)
// ---------------------------------------------------------------------------
describe("renderLivingDoc", () => {
    it("creates index.html, context pages, and assets/styles.css", () => {
        const data = makeData();
        renderLivingDoc(data, tmpDir);
        expect(fs.existsSync(path.join(tmpDir, "index.html"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, "Order.html"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, "assets", "styles.css"))).toBe(true);
    });
    it("generated files contain expected content", () => {
        const data = makeData();
        renderLivingDoc(data, tmpDir);
        const index = fs.readFileSync(path.join(tmpDir, "index.html"), "utf-8");
        expect(index).toContain("Forge Living Documentation");
        const ctx = fs.readFileSync(path.join(tmpDir, "Order.html"), "utf-8");
        expect(ctx).toContain("Context: Order");
        expect(ctx).toContain("Create order successfully");
        const css = fs.readFileSync(path.join(tmpDir, "assets", "styles.css"), "utf-8");
        expect(css.length).toBeGreaterThan(0);
    });
    it("handles empty data (0 contexts)", () => {
        const data = makeData(new Map());
        renderLivingDoc(data, tmpDir);
        expect(fs.existsSync(path.join(tmpDir, "index.html"))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, "assets", "styles.css"))).toBe(true);
        const index = fs.readFileSync(path.join(tmpDir, "index.html"), "utf-8");
        expect(index).toContain("Forge Living Documentation");
    });
});
//# sourceMappingURL=renderer.test.js.map