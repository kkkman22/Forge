/**
 * T11 — src/domain/ is NOT shipped in dist (INV-3).
 *
 * The in-repo reference domain is build-isolated: it compiles under its own
 * tsconfig (REQ-01) and must NOT appear in the Forge dist build output, since
 * it is a readable reference, not a Forge runtime module. This guards against
 * a future regression that accidentally compiles src/domain/ into dist/src/.
 *
 * category: contract
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");

describe("T11: src/domain/ not in dist (INV-3)", () => {
  it("dist/src/domain/ does not exist", () => {
    expect(existsSync(resolve(ROOT, "dist/src/domain"))).toBe(false);
  });

  it("dist/src/domain/reservations/ does not exist", () => {
    expect(existsSync(resolve(ROOT, "dist/src/domain/reservations"))).toBe(false);
  });
});
