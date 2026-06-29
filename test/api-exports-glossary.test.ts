import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

/**
 * Verifies the public barrel re-exports the glossary enforcement bridge
 * (spec glossary-enforcement-bridge REQ-3).
 */
describe("public API: glossary enforcement bridge (REQ-3)", () => {
  it("exports mergeGlossaries as a function", () => {
    expect(typeof api.mergeGlossaries).toBe("function");
  });

  it("exports loadEnforcementGlossary as a function", () => {
    expect(typeof api.loadEnforcementGlossary).toBe("function");
  });
});
