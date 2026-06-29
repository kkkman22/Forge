import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

/**
 * Verifies the public barrel re-exports the domain-knowledge-threading
 * wiring functions (spec REQ-3). Phase skills import these names from
 * src/index.ts, so they must be present and be functions/types.
 */
describe("public API: domain-knowledge-threading wiring (REQ-3)", () => {
  it("exports loadEnabledPacks as a function", () => {
    expect(typeof api.loadEnabledPacks).toBe("function");
  });

  it("exports composeDomainKnowledgeBundle as a function", () => {
    expect(typeof api.composeDomainKnowledgeBundle).toBe("function");
  });

  it("exports loadContexts as a function", () => {
    expect(typeof api.loadContexts).toBe("function");
  });

  it("exports loadGlossary as a function", () => {
    expect(typeof api.loadGlossary).toBe("function");
  });

  it("exports loadStateMachineDefinitions as a function", () => {
    expect(typeof api.loadStateMachineDefinitions).toBe("function");
  });
});
