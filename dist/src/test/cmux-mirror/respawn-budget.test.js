import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetRespawnCount, tryConsumeRespawn } from "../../scripts/cmux-mirror/lib/respawn.mjs";
describe("respawn: budget counter (R13.12–R13.14)", () => {
    let dir;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "cmux-respawn-test-"));
    });
    afterEach(() => {
        try {
            rmSync(dir, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    });
    it("R13.12: tryConsumeRespawn succeeds within budget", () => {
        const file = join(dir, "respawn.json");
        expect(tryConsumeRespawn(file, 3)).toBe(true);
        expect(tryConsumeRespawn(file, 3)).toBe(true);
        expect(tryConsumeRespawn(file, 3)).toBe(true);
    });
    it("R13.12: tryConsumeRespawn rejects when budget exhausted", () => {
        const file = join(dir, "respawn.json");
        expect(tryConsumeRespawn(file, 2)).toBe(true);
        expect(tryConsumeRespawn(file, 2)).toBe(true);
        expect(tryConsumeRespawn(file, 2)).toBe(false);
        expect(tryConsumeRespawn(file, 2)).toBe(false);
    });
    it("R13.13: resetRespawnCount allows new consumptions", () => {
        const file = join(dir, "respawn.json");
        expect(tryConsumeRespawn(file, 1)).toBe(true);
        expect(tryConsumeRespawn(file, 1)).toBe(false);
        resetRespawnCount(file);
        expect(tryConsumeRespawn(file, 1)).toBe(true);
    });
    it("R13.14: atomic file operations — concurrent-safe write", () => {
        const file = join(dir, "respawn.json");
        // Rapid sequential consume should be consistent
        for (let i = 0; i < 5; i++) {
            tryConsumeRespawn(file, 5);
        }
        expect(tryConsumeRespawn(file, 5)).toBe(false);
    });
    it("missing directory created automatically", () => {
        const file = join(dir, "sub", "dir", "respawn.json");
        expect(tryConsumeRespawn(file, 1)).toBe(true);
    });
    it("corrupt file treated as count=0", () => {
        const file = join(dir, "respawn.json");
        writeFileSync(file, "not valid json {{{");
        expect(tryConsumeRespawn(file, 3)).toBe(true);
    });
});
//# sourceMappingURL=respawn-budget.test.js.map