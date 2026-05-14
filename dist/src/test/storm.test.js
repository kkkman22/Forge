/**
 * Unit tests for the storm module — Event Storming session state management.
 *
 * Covers:
 *   - loadStormState: non-existent file, valid markdown parsing
 *   - saveStormState + loadStormState: round-trip fidelity
 *   - nextPhase: full sequential traversal
 *   - serializeStormMarkdown: output format
 *   - Partial state preservation
 *   - Optional source field preservation
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadStormState, nextPhase, saveStormState, serializeStormMarkdown, } from "../src/storm.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let tmpDir;
beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "storm-test-"));
});
afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});
/** Build a fully-populated StormState for reuse across tests. */
function fullState() {
    return {
        context: "reservations",
        startedAt: "2026-05-09T09:00:00Z",
        lastUpdated: "2026-05-09T10:30:00Z",
        phaseCompleted: "read_models",
        items: {
            events: [
                { name: "ReservationBooked", description: "新预订已创建" },
                { name: "ReservationConfirmed", description: "预订已支付保证金确认" },
            ],
            commands: [{ name: "BookReservation", description: "客人提交预订请求" }],
            aggregates: [{ name: "Reservation", description: "由 Book/Confirm/Cancel 构成" }],
            policies: [{ name: "AutoCancelOnPaymentTimeout", description: "30 分钟未支付自动取消" }],
            readModels: [
                {
                    name: "OccupancyDashboard",
                    description: "从 CheckedIn/CheckedOut 投影实时入住率",
                },
            ],
        },
    };
}
// ---------------------------------------------------------------------------
// loadStormState
// ---------------------------------------------------------------------------
describe("loadStormState", () => {
    it("returns null for non-existent file", () => {
        const filePath = path.join(tmpDir, "does-not-exist.md");
        expect(loadStormState(filePath)).toBeNull();
    });
    it("parses a valid markdown file into correct StormState", () => {
        const filePath = path.join(tmpDir, "event-storm.md");
        const content = [
            "---",
            "context: reservations",
            'started_at: "2026-05-09T09:00:00Z"',
            'last_updated: "2026-05-09T10:30:00Z"',
            "phase_completed: read_models",
            "---",
            "",
            "## Events",
            "- **ReservationBooked** — 新预订已创建",
            "- **ReservationConfirmed** — 预订已支付保证金确认",
            "",
            "## Commands",
            "- **BookReservation** — 客人提交预订请求",
            "",
            "## Aggregates",
            "- **Reservation** — 由 Book/Confirm/Cancel 构成",
            "",
            "## Policies",
            "- **AutoCancelOnPaymentTimeout** — 30 分钟未支付自动取消",
            "",
            "## Read Models",
            "- **OccupancyDashboard** — 从 CheckedIn/CheckedOut 投影实时入住率",
            "",
        ].join("\n");
        fs.writeFileSync(filePath, content, "utf8");
        const state = loadStormState(filePath);
        expect(state).not.toBeNull();
        expect(state.context).toBe("reservations");
        expect(state.startedAt).toBe("2026-05-09T09:00:00Z");
        expect(state.lastUpdated).toBe("2026-05-09T10:30:00Z");
        expect(state.phaseCompleted).toBe("read_models");
        expect(state.items.events).toHaveLength(2);
        expect(state.items.events[0]).toEqual({
            name: "ReservationBooked",
            description: "新预订已创建",
        });
        expect(state.items.commands).toHaveLength(1);
        expect(state.items.commands[0].name).toBe("BookReservation");
        expect(state.items.aggregates).toHaveLength(1);
        expect(state.items.policies).toHaveLength(1);
        expect(state.items.readModels).toHaveLength(1);
    });
});
// ---------------------------------------------------------------------------
// saveStormState + loadStormState round-trip
// ---------------------------------------------------------------------------
describe("saveStormState → loadStormState round-trip", () => {
    it("preserves all data through save and load", () => {
        const filePath = path.join(tmpDir, "nested", "dir", "event-storm.md");
        const original = fullState();
        saveStormState(original, filePath);
        const loaded = loadStormState(filePath);
        expect(loaded).not.toBeNull();
        expect(loaded.context).toBe(original.context);
        expect(loaded.startedAt).toBe(original.startedAt);
        expect(loaded.lastUpdated).toBe(original.lastUpdated);
        expect(loaded.phaseCompleted).toBe(original.phaseCompleted);
        expect(loaded.items).toEqual(original.items);
    });
});
// ---------------------------------------------------------------------------
// nextPhase
// ---------------------------------------------------------------------------
describe("nextPhase", () => {
    it("traverses the full sequence", () => {
        expect(nextPhase("none")).toBe("events");
        expect(nextPhase("events")).toBe("commands");
        expect(nextPhase("commands")).toBe("aggregates");
        expect(nextPhase("aggregates")).toBe("policies");
        expect(nextPhase("policies")).toBe("read_models");
    });
    it("returns null when already at read_models (final phase)", () => {
        expect(nextPhase("read_models")).toBeNull();
    });
});
// ---------------------------------------------------------------------------
// serializeStormMarkdown
// ---------------------------------------------------------------------------
describe("serializeStormMarkdown", () => {
    it("produces valid markdown with YAML frontmatter and sections", () => {
        const state = fullState();
        const md = serializeStormMarkdown(state);
        // Frontmatter boundaries
        expect(md.startsWith("---\n")).toBe(true);
        const secondDelimiter = md.indexOf("\n---\n", 4);
        expect(secondDelimiter).toBeGreaterThan(-1);
        // YAML fields
        expect(md).toContain("context: reservations");
        expect(md).toContain('started_at: "2026-05-09T09:00:00Z"');
        expect(md).toContain('last_updated: "2026-05-09T10:30:00Z"');
        expect(md).toContain("phase_completed: read_models");
        // Section headers
        expect(md).toContain("## Events");
        expect(md).toContain("## Commands");
        expect(md).toContain("## Aggregates");
        expect(md).toContain("## Policies");
        expect(md).toContain("## Read Models");
        // Items
        expect(md).toContain("**ReservationBooked** — 新预订已创建");
        expect(md).toContain("**BookReservation** — 客人提交预订请求");
        expect(md).toContain("**Reservation** — 由 Book/Confirm/Cancel 构成");
        expect(md).toContain("**AutoCancelOnPaymentTimeout** — 30 分钟未支付自动取消");
        expect(md).toContain("**OccupancyDashboard** — 从 CheckedIn/CheckedOut 投影实时入住率");
    });
});
// ---------------------------------------------------------------------------
// Partial state
// ---------------------------------------------------------------------------
describe("partial state (only events collected)", () => {
    it("round-trips with events filled and others empty", () => {
        const filePath = path.join(tmpDir, "partial.md");
        const state = {
            context: "orders",
            startedAt: "2026-05-10T08:00:00Z",
            lastUpdated: "2026-05-10T08:30:00Z",
            phaseCompleted: "events",
            items: {
                events: [
                    { name: "OrderPlaced", description: "客户下单" },
                    { name: "OrderShipped", description: "订单已发货" },
                ],
                commands: [],
                aggregates: [],
                policies: [],
                readModels: [],
            },
        };
        saveStormState(state, filePath);
        const loaded = loadStormState(filePath);
        expect(loaded.context).toBe("orders");
        expect(loaded.phaseCompleted).toBe("events");
        expect(loaded.items.events).toHaveLength(2);
        expect(loaded.items.events[0].name).toBe("OrderPlaced");
        expect(loaded.items.commands).toHaveLength(0);
        expect(loaded.items.aggregates).toHaveLength(0);
        expect(loaded.items.policies).toHaveLength(0);
        expect(loaded.items.readModels).toHaveLength(0);
    });
});
// ---------------------------------------------------------------------------
// Items with optional source field
// ---------------------------------------------------------------------------
describe("items with source field", () => {
    it("preserves source through round-trip", () => {
        const filePath = path.join(tmpDir, "sourced.md");
        const state = {
            context: "billing",
            startedAt: "2026-05-10T12:00:00Z",
            lastUpdated: "2026-05-10T12:15:00Z",
            phaseCompleted: "commands",
            items: {
                events: [
                    {
                        name: "InvoiceGenerated",
                        description: "发票已生成",
                        source: "billing-service",
                    },
                ],
                commands: [
                    {
                        name: "GenerateInvoice",
                        description: "生成发票",
                        source: "api-gateway",
                    },
                ],
                aggregates: [],
                policies: [],
                readModels: [],
            },
        };
        saveStormState(state, filePath);
        const loaded = loadStormState(filePath);
        expect(loaded.items.events[0].source).toBe("billing-service");
        expect(loaded.items.commands[0].source).toBe("api-gateway");
    });
});
//# sourceMappingURL=storm.test.js.map