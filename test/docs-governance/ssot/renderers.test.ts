import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { commandsTableRenderer } from "../../../src/docs-governance/ssot/renderers/commands-table.js";
import { jsonListRenderer } from "../../../src/docs-governance/ssot/renderers/json-list.js";
import { routingTableRenderer } from "../../../src/docs-governance/ssot/renderers/routing-table.js";
import { securityTiersRenderer } from "../../../src/docs-governance/ssot/renderers/security-tiers.js";
import type { RenderInput } from "../../../src/docs-governance/types.js";

const baseInput = (source: unknown): RenderInput => ({
  topic: "test",
  renderer: "test",
  args: {},
  source,
});

describe("commands-table renderer", () => {
  it("renders table with headers and rows", () => {
    const result = commandsTableRenderer(
      baseInput([
        { name: "/tinkerman build", tier: "Standard", summary: "Build" },
        { name: "/tinkerman plan", tier: "Standard", summary: "Plan" },
      ]),
    );
    expect(result.diagnostics).toHaveLength(0);
    expect(result.markdown).toContain("| Command | Tier | Summary |");
    expect(result.markdown).toContain("/tinkerman build");
    expect(result.markdown).toContain("/tinkerman plan");
  });

  it("deduplicates by name", () => {
    const result = commandsTableRenderer(
      baseInput([
        { name: "a", tier: "L", summary: "first" },
        { name: "a", tier: "L", summary: "dup" },
      ]),
    );
    const rows = result.markdown
      .split("\n")
      .filter((l) => l.startsWith("| /") || l.startsWith("| a"));
    expect(rows).toHaveLength(1);
  });

  it("sorts by name ascending", () => {
    const result = commandsTableRenderer(
      baseInput([
        { name: "z-cmd", tier: "L", summary: "z" },
        { name: "a-cmd", tier: "L", summary: "a" },
      ]),
    );
    const lines = result.markdown.split("\n");
    const aIdx = lines.findIndex((l) => l.includes("a-cmd"));
    const zIdx = lines.findIndex((l) => l.includes("z-cmd"));
    expect(aIdx).toBeLessThan(zIdx);
  });

  it("outputs empty message for empty source", () => {
    const result = commandsTableRenderer(baseInput([]));
    expect(result.markdown).toContain("No commands");
  });
});

describe("routing-table renderer", () => {
  it("renders routing table", () => {
    const result = routingTableRenderer(
      baseInput([{ tier: "Light", condition: "≤1 file", sequence: ["build", "review"] }]),
    );
    expect(result.markdown).toContain("| Tier | Condition | Command Sequence |");
    expect(result.markdown).toContain("build → review");
  });
});

describe("security-tiers renderer", () => {
  it("renders tier hierarchy", () => {
    const result = securityTiersRenderer(
      baseInput([{ level: 1, name: "Basic", capabilities: ["read"], constraints: ["no write"] }]),
    );
    expect(result.markdown).toContain("### Level 1: Basic");
    expect(result.markdown).toContain("- read");
    expect(result.markdown).toContain("- no write");
  });

  it("sorts by level ascending", () => {
    const result = securityTiersRenderer(
      baseInput([
        { level: 3, name: "High", capabilities: [], constraints: [] },
        { level: 1, name: "Low", capabilities: [], constraints: [] },
      ]),
    );
    const lines = result.markdown.split("\n");
    const lowIdx = lines.findIndex((l) => l.includes("Low"));
    const highIdx = lines.findIndex((l) => l.includes("High"));
    expect(lowIdx).toBeLessThan(highIdx);
  });
});

describe("json-list renderer", () => {
  it("renders bullet list", () => {
    const result = jsonListRenderer(
      baseInput([
        { label: "Version", value: "2.6.0" },
        { label: "Commands", value: 22 },
      ]),
    );
    expect(result.markdown).toContain("- **Version**: 2.6.0");
    expect(result.markdown).toContain("- **Commands**: 22");
  });
});

// P14: Renderer determinism PBT
describe("renderer determinism (P14)", () => {
  it("commands-table: same input → same output", () => {
    const source = [
      { name: "x", tier: "A", summary: "test" },
      { name: "y", tier: "B", summary: "test2" },
    ];
    const input = baseInput(source);
    const r1 = commandsTableRenderer(input);
    const r2 = commandsTableRenderer(input);
    expect(r1.markdown).toBe(r2.markdown);
  });

  it("json-list PBT: same input → byte-identical output", () => {
    const entryArb = fc.record({
      label: fc.string({ minLength: 1, maxLength: 10 }),
      value: fc.oneof(fc.string({ minLength: 1, maxLength: 10 }), fc.integer()),
    });

    fc.assert(
      fc.property(fc.array(entryArb, { maxLength: 20 }), (entries) => {
        const input = baseInput(entries);
        const r1 = jsonListRenderer(input);
        const r2 = jsonListRenderer(input);
        expect(r1.markdown).toBe(r2.markdown);
      }),
    );
  });
});
