import { describe, expect, it } from "vitest";
import type { BoundaryCheckInput } from "../../src/context-boundary.js";
import { checkBoundary, resolveFileContext } from "../../src/context-boundary.js";

describe("Context boundary priority properties", () => {
  it("JSDoc context overrides glob-based context", () => {
    const map = { "src/domain/folio/**": "folio-billing" };
    const jsdocResult = resolveFileContext("src/domain/folio/svc.ts", map, "legacy-billing");
    const noJsdocResult = resolveFileContext("src/domain/folio/svc.ts", map, null);
    expect(jsdocResult).toBe("legacy-billing");
    expect(noJsdocResult).toBe("folio-billing");
    expect(jsdocResult).not.toBe(noJsdocResult);
  });

  it("more specific glob wins over less specific glob", () => {
    const map = {
      "src/domain/**": "generic",
      "src/domain/folio/**": "folio-billing",
    };
    const result = resolveFileContext("src/domain/folio/service.ts", map, null);
    expect(result).toBe("folio-billing");
  });

  it("Zero-Pack: no ownership map and no JSDoc returns null", () => {
    const result = resolveFileContext("src/domain/folio/svc.ts", {}, null);
    expect(result).toBeNull();
  });

  it("JSDoc wins even with empty ownership map", () => {
    const result = resolveFileContext("src/anything.ts", {}, "explicit-context");
    expect(result).toBe("explicit-context");
  });
});

describe("Boundary check integration properties", () => {
  it("escape hatch suppresses violation", () => {
    const input: BoundaryCheckInput = {
      filePath: "src/domain/folio/svc.ts",
      fileContent: '// @forge:allow-cross-context\nimport { x } from "../reservations/svc";',
      contextMap: [],
      ownershipMap: {
        "src/domain/folio/**": "folio-billing",
        "src/domain/reservations/**": "reservations",
      },
    };
    const result = checkBoundary(input);
    expect(result.violations).toHaveLength(0);
    expect(result.escapeHatchUsed).toBe(1);
  });

  it("non-relative imports never violate", () => {
    const input: BoundaryCheckInput = {
      filePath: "src/domain/folio/svc.ts",
      fileContent: 'import { something } from "lodash";\nimport path from "path";',
      contextMap: [],
      ownershipMap: { "src/domain/folio/**": "folio-billing" },
    };
    const result = checkBoundary(input);
    expect(result.violations).toHaveLength(0);
  });
});
