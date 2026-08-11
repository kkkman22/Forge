import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BoundaryCheckInput } from "../../src/context-boundary.js";
import { checkBoundary, loadOwnershipMap, resolveFileContext } from "../../src/context-boundary.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "forge-ownership-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("loadOwnershipMap real implementation", () => {
  it("loads mappings from .tinkerman/context-ownership.yaml", () => {
    const forgeDir = join(tempDir, ".tinkerman");
    mkdirSync(forgeDir, { recursive: true });
    writeFileSync(
      join(forgeDir, "context-ownership.yaml"),
      `schema_version: 1
mappings:
  "src/domain/folio/**": folio-billing
  "src/domain/reservations/**": reservations
`,
    );
    const mappings = loadOwnershipMap(tempDir, join(forgeDir, "context-ownership.yaml"));
    expect(mappings["src/domain/folio/**"]).toBe("folio-billing");
    expect(mappings["src/domain/reservations/**"]).toBe("reservations");
  });

  it("returns empty when no ownership file exists", () => {
    const mappings = loadOwnershipMap(tempDir, join(tempDir, ".tinkerman/context-ownership.yaml"));
    expect(Object.keys(mappings)).toHaveLength(0);
  });

  it("falls back gracefully on malformed YAML", () => {
    const forgeDir = join(tempDir, ".tinkerman");
    mkdirSync(forgeDir, { recursive: true });
    writeFileSync(join(forgeDir, "context-ownership.yaml"), `:::invalid yaml {{::`);
    const mappings = loadOwnershipMap(tempDir, join(forgeDir, "context-ownership.yaml"));
    expect(typeof mappings).toBe("object");
  });

  it("falls back when mappings field is wrong type", () => {
    const forgeDir = join(tempDir, ".tinkerman");
    mkdirSync(forgeDir, { recursive: true });
    writeFileSync(
      join(forgeDir, "context-ownership.yaml"),
      `schema_version: 1
mappings: "not-an-object"
`,
    );
    const mappings = loadOwnershipMap(tempDir, join(forgeDir, "context-ownership.yaml"));
    expect(Object.keys(mappings)).toHaveLength(0);
  });
});

describe("resolveFileContext with JSDoc", () => {
  it("JSDoc @context overrides glob", () => {
    const ctx = resolveFileContext(
      "src/domain/folio/other.ts",
      { "src/domain/folio/**": "folio-billing" },
      "legacy-billing",
    );
    expect(ctx).toBe("legacy-billing");
  });

  it("glob matches when no JSDoc", () => {
    const ctx = resolveFileContext(
      "src/domain/folio/service.ts",
      { "src/domain/folio/**": "folio-billing" },
      null,
    );
    expect(ctx).toBe("folio-billing");
  });

  it("returns null when nothing matches", () => {
    const ctx = resolveFileContext("src/other/foo.ts", {}, null);
    expect(ctx).toBeNull();
  });
});

describe("checkBoundary with real ownership", () => {
  it("detects cross-context violation", () => {
    const input: BoundaryCheckInput = {
      filePath: "src/domain/folio/billing.ts",
      fileContent: 'import { getReservation } from "../reservations/service";',
      contextMap: [],
      ownershipMap: {
        "src/domain/folio/**": "folio-billing",
        "src/domain/reservations/**": "reservations",
      },
    };
    const result = checkBoundary(input);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0].sourceContext).toBe("folio-billing");
    expect(result.violations[0].targetContext).toBe("reservations");
  });

  it("allows same-context imports", () => {
    const input: BoundaryCheckInput = {
      filePath: "src/domain/folio/service.ts",
      fileContent: 'import { helper } from "./utils";',
      contextMap: [],
      ownershipMap: {
        "src/domain/folio/**": "folio-billing",
      },
    };
    const result = checkBoundary(input);
    expect(result.violations).toHaveLength(0);
  });

  it("no violation when file not in any context", () => {
    const input: BoundaryCheckInput = {
      filePath: "src/utils/helpers.ts",
      fileContent: 'import { stuff } from "lodash";',
      contextMap: [],
      ownershipMap: {
        "src/domain/folio/**": "folio-billing",
      },
    };
    const result = checkBoundary(input);
    expect(result.violations).toHaveLength(0);
  });
});
