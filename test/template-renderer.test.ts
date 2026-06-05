import { describe, expect, it } from "vitest";
import { renderTemplate } from "../src/template-renderer.js";

describe("renderTemplate", () => {
  // 1. Simple placeholder replacement
  it("replaces a simple {{name}} placeholder with context value", () => {
    const template = "Hello, {{name}}!";
    const result = renderTemplate(template, { name: "World" });
    expect(result.content).toBe("Hello, World!");
    expect(result.unresolvedPlaceholders).toEqual([]);
  });

  // 2. Multiple placeholders
  it("replaces multiple different placeholders", () => {
    const template = "{{greeting}}, {{name}}! Welcome to {{place}}.";
    const result = renderTemplate(template, {
      greeting: "Hello",
      name: "Alice",
      place: "Wonderland",
    });
    expect(result.content).toBe("Hello, Alice! Welcome to Wonderland.");
    expect(result.unresolvedPlaceholders).toEqual([]);
  });

  // 3. {{#each items}} loop with array
  it("renders {{#each items}} block for each array element", () => {
    const template = "Items:\n{{#each items}}- {{this}}\n{{/each}}Done.";
    const result = renderTemplate(template, { items: ["alpha", "beta", "gamma"] });
    expect(result.content).toBe("Items:\n- alpha\n- beta\n- gamma\nDone.");
    expect(result.unresolvedPlaceholders).toEqual([]);
  });

  // 4. Nested content inside each block (accessing properties)
  it("renders nested properties inside {{#each}} using dot notation", () => {
    const template = "{{#each users}}Name: {{this.name}}, Age: {{this.age}}\n{{/each}}";
    const result = renderTemplate(template, {
      users: [
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" },
      ],
    });
    expect(result.content).toBe("Name: Alice, Age: 30\nName: Bob, Age: 25\n");
    expect(result.unresolvedPlaceholders).toEqual([]);
  });

  // 5. {{#if cond}} renders when truthy
  it("renders {{#if cond}} block when condition is truthy", () => {
    const template = "Start\n{{#if showGreeting}}Hello!\n{{/if}}End";
    const result = renderTemplate(template, { showGreeting: "yes" });
    expect(result.content).toBe("Start\nHello!\nEnd");
    expect(result.unresolvedPlaceholders).toEqual([]);
  });

  // 6. {{#if cond}} skips when falsy
  it("skips {{#if cond}} block when condition is falsy", () => {
    const template = "Start\n{{#if showGreeting}}Hello!\n{{/if}}End";
    const result = renderTemplate(template, { showGreeting: "" });
    expect(result.content).toBe("Start\nEnd");
    expect(result.unresolvedPlaceholders).toEqual([]);
  });

  // 7. Unresolved placeholders reported
  it("reports unresolved placeholders when context lacks values", () => {
    const template = "Hello, {{name}}! Your {{title}}.";
    const result = renderTemplate(template, { name: "Alice" });
    expect(result.content).toBe("Hello, Alice! Your .");
    expect(result.unresolvedPlaceholders).toEqual(["title"]);
  });

  // 8. Empty context: original preserved, all placeholders unresolved
  it("preserves template unchanged with empty context and reports all placeholders", () => {
    const template = "Hello, {{name}}! Welcome to {{place}}.";
    const result = renderTemplate(template, {});
    expect(result.content).toBe("Hello, ! Welcome to .");
    expect(result.unresolvedPlaceholders.sort()).toEqual(["name", "place"]);
  });

  // 9. Output path derived from AggregateName
  it("derives output path from {{AggregateName}} placeholder", () => {
    const template = "// file for {{AggregateName}}\nclass {{AggregateName}} {}";
    const result = renderTemplate(template, { AggregateName: "Order" });
    expect(result.outputSuggestedPath).toBe("src/domain/Order/Order.ts");
  });

  it("returns empty outputSuggestedPath when AggregateName is absent", () => {
    const template = "Hello {{name}}";
    const result = renderTemplate(template, { name: "World" });
    expect(result.outputSuggestedPath).toBe("");
  });

  // 11. Key length limit
  it("rejects placeholder keys exceeding total max length (128 chars)", () => {
    // Two segments, each 64 chars → total 128+1(dot) = 129 > 128
    const seg = "a".repeat(64);
    const longKey = `${seg}.${seg}`; // 64 + 1 + 64 = 129
    const template = `Hello {{${longKey}}}`;
    const result = renderTemplate(template, {});
    expect(result.content).toBe("Hello ");
    expect(result.unresolvedPlaceholders).toEqual([longKey]);
  });

  it("resolves placeholder keys within total max length", () => {
    const okKey = "a".repeat(60);
    const template = `Hello {{${okKey}}}`;
    const result = renderTemplate(template, { [okKey]: "World" });
    expect(result.content).toBe("Hello World");
    expect(result.unresolvedPlaceholders).toEqual([]);
  });

  it("rejects dot-path where any segment exceeds max segment length (64 chars)", () => {
    const longSegment = "b".repeat(66);
    const template = `Hello {{${longSegment}.name}}`;
    const result = renderTemplate(template, { [longSegment]: { name: "World" } });
    expect(result.content).toBe("Hello ");
    expect(result.unresolvedPlaceholders).toEqual([`${longSegment}.name`]);
  });

  // 10. Mixed each/if/simple placeholders
  it("handles mixed each, if, and simple placeholders", () => {
    const template = [
      "// {{AggregateName}} aggregate",
      "{{#if hasEvents}}Events:",
      "{{#each events}}  - {{this}}",
      "{{/each}}{{/if}}",
      "// end",
    ].join("\n");
    const result = renderTemplate(template, {
      AggregateName: "Order",
      hasEvents: "true",
      events: ["OrderCreated", "OrderShipped"],
    });
    // The #each body "  - {{this}}\n" renders per item; after the last item
    // the trailing newline remains, plus the newline before // end.
    expect(result.content).toBe(
      ["// Order aggregate", "Events:", "  - OrderCreated", "  - OrderShipped", "", "// end"].join(
        "\n",
      ),
    );
    expect(result.outputSuggestedPath).toBe("src/domain/Order/Order.ts");
    expect(result.unresolvedPlaceholders).toEqual([]);
  });
});
