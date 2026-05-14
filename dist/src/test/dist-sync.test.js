import { describe, expect, it } from "vitest";
import { detectDrift, distToExpectedSrc, srcToExpectedDist } from "../src/dist-sync.js";
describe("srcToExpectedDist", () => {
    it("maps src/foo.ts to dist/src/foo.js and dist/src/foo.d.ts", () => {
        expect(srcToExpectedDist("src/foo.ts")).toEqual(["dist/src/foo.js", "dist/src/foo.d.ts"]);
    });
    it("maps nested path src/pack/loader.ts", () => {
        expect(srcToExpectedDist("src/pack/loader.ts")).toEqual([
            "dist/src/pack/loader.js",
            "dist/src/pack/loader.d.ts",
        ]);
    });
    it("returns empty for non-.ts file", () => {
        expect(srcToExpectedDist("src/foo.js")).toEqual([]);
    });
    it("returns empty for non-src path", () => {
        expect(srcToExpectedDist("test/foo.ts")).toEqual([]);
    });
    it("returns empty for .d.ts file", () => {
        expect(srcToExpectedDist("src/foo.d.ts")).toEqual([]);
    });
});
describe("distToExpectedSrc", () => {
    it("maps dist/src/foo.js back to src/foo.ts", () => {
        expect(distToExpectedSrc("dist/src/foo.js")).toBe("src/foo.ts");
    });
    it("maps nested dist/src/pack/loader.d.ts back to src/pack/loader.ts", () => {
        expect(distToExpectedSrc("dist/src/pack/loader.d.ts")).toBe("src/pack/loader.ts");
    });
    it("returns null for non-dist path", () => {
        expect(distToExpectedSrc("src/foo.js")).toBeNull();
    });
    it("returns null for .map file", () => {
        expect(distToExpectedSrc("dist/src/foo.js.map")).toBeNull();
    });
    it("returns null for dist/test path", () => {
        expect(distToExpectedSrc("dist/test/foo.js")).toBeNull();
    });
});
describe("detectDrift", () => {
    it("flags missing dist for new src", () => {
        const drift = detectDrift({
            trackedSrcFiles: ["src/foo.ts", "src/bar.ts"],
            trackedDistFiles: ["dist/src/foo.js", "dist/src/foo.d.ts"],
        });
        expect(drift.missingInDist).toHaveLength(1);
        expect(drift.missingInDist[0].srcPath).toBe("src/bar.ts");
    });
    it("flags orphan dist with no src", () => {
        const drift = detectDrift({
            trackedSrcFiles: ["src/foo.ts"],
            trackedDistFiles: ["dist/src/foo.js", "dist/src/foo.d.ts", "dist/src/deleted.js"],
        });
        expect(drift.orphansInDist).toHaveLength(1);
        expect(drift.orphansInDist[0].distPath).toBe("dist/src/deleted.js");
    });
    it("flags compilation mismatch when checksums differ", () => {
        const drift = detectDrift({
            trackedSrcFiles: ["src/foo.ts"],
            trackedDistFiles: ["dist/src/foo.js", "dist/src/foo.d.ts"],
            freshDistFiles: new Map([["dist/src/foo.js", { sha256: "abc123", size: 100 }]]),
            trackedDistChecksums: new Map([["dist/src/foo.js", { sha256: "def456", size: 200 }]]),
        });
        expect(drift.compilationMismatch).toHaveLength(1);
        expect(drift.compilationMismatch[0].distPath).toBe("dist/src/foo.js");
        expect(drift.compilationMismatch[0].diff).toBe("content-differs");
    });
    it("returns clean report when src and dist are in sync", () => {
        const drift = detectDrift({
            trackedSrcFiles: ["src/foo.ts"],
            trackedDistFiles: ["dist/src/foo.js", "dist/src/foo.d.ts"],
            freshDistFiles: new Map([["dist/src/foo.js", { sha256: "abc123", size: 100 }]]),
            trackedDistChecksums: new Map([["dist/src/foo.js", { sha256: "abc123", size: 100 }]]),
        });
        expect(drift.missingInDist).toHaveLength(0);
        expect(drift.orphansInDist).toHaveLength(0);
        expect(drift.compilationMismatch).toHaveLength(0);
        expect(drift.summary.drifted).toBe(0);
        expect(drift.summary.totalSrc).toBe(1);
        expect(drift.summary.totalDist).toBe(2);
    });
    it("flags size-differs when only size changes", () => {
        const drift = detectDrift({
            trackedSrcFiles: ["src/foo.ts"],
            trackedDistFiles: ["dist/src/foo.js", "dist/src/foo.d.ts"],
            freshDistFiles: new Map([["dist/src/foo.js", { sha256: "abc123", size: 100 }]]),
            trackedDistChecksums: new Map([["dist/src/foo.js", { sha256: "abc123", size: 200 }]]),
        });
        expect(drift.compilationMismatch).toHaveLength(1);
        expect(drift.compilationMismatch[0].diff).toBe("size-differs");
    });
    it("ignores dist files not in src/ subtree (dist/test/)", () => {
        const drift = detectDrift({
            trackedSrcFiles: ["src/foo.ts"],
            trackedDistFiles: ["dist/src/foo.js", "dist/src/foo.d.ts", "dist/test/bar.test.js"],
        });
        expect(drift.orphansInDist).toHaveLength(0);
    });
    it("handles empty input as clean", () => {
        const drift = detectDrift({
            trackedSrcFiles: [],
            trackedDistFiles: [],
        });
        expect(drift.summary.drifted).toBe(0);
        expect(drift.summary.totalSrc).toBe(0);
        expect(drift.summary.totalDist).toBe(0);
        expect(drift.summary.cleanExit).toBe(true);
    });
    it("summary.drifted counts all drift categories", () => {
        const drift = detectDrift({
            trackedSrcFiles: ["src/new.ts", "src/existing.ts"],
            trackedDistFiles: ["dist/src/orphan.js"],
        });
        expect(drift.missingInDist).toHaveLength(2);
        expect(drift.orphansInDist).toHaveLength(1);
        expect(drift.summary.drifted).toBe(3);
    });
});
//# sourceMappingURL=dist-sync.test.js.map