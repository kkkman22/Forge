import { describe, it, expect } from "vitest";
import { shouldTriggerBusinessAnalyst, getCoreSubdomains } from "../../src/spec.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("business-analyst dispatch path", () => {
  const pmsPacks = [{ featureFlags: { core_subdomains: ["reservations", "folio-billing", "night-audit"] } }];

  it("triggers business-analyst for Core subdomain (reservations)", () => {
    expect(shouldTriggerBusinessAnalyst("reservations", pmsPacks)).toBe(true);
  });

  it("triggers business-analyst for Core subdomain (folio-billing)", () => {
    expect(shouldTriggerBusinessAnalyst("folio-billing", pmsPacks)).toBe(true);
  });

  it("does NOT trigger for non-Core subdomain (reporting)", () => {
    expect(shouldTriggerBusinessAnalyst("reporting", pmsPacks)).toBe(false);
  });

  it("does NOT trigger with empty packs (Zero-Pack)", () => {
    expect(shouldTriggerBusinessAnalyst("reservations", [])).toBe(false);
  });

  it("does NOT trigger with undefined context", () => {
    expect(shouldTriggerBusinessAnalyst(undefined, pmsPacks)).toBe(false);
  });

  it("business-analyst agent file exists on main branch", () => {
    const agentPath = resolve(__dirname, "../../.claude/agents/business-analyst.md");
    expect(existsSync(agentPath)).toBe(true);
  });

  it("core subdomains are correctly collected", () => {
    const subdomains = getCoreSubdomains(pmsPacks);
    expect(subdomains).toEqual(expect.arrayContaining(["reservations", "folio-billing", "night-audit"]));
  });
});
