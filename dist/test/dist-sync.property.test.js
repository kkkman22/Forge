import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { distToExpectedSrc, srcToExpectedDist } from "../src/dist-sync.js";
describe("srcToExpectedDist / distToExpectedSrc round-trip", () => {
    it("round-trip: distToExpectedSrc(srcToExpectedDist(s)[0]) === s", () => {
        const srcPath = fc.stringMatching(/^src\/[a-z][a-z0-9/]*\.ts$/);
        fc.assert(fc.property(srcPath, (src) => {
            const distPaths = srcToExpectedDist(src);
            if (distPaths.length === 0)
                return;
            expect(distToExpectedSrc(distPaths[0])).toBe(src);
        }));
    });
    it("round-trip: distToExpectedSrc(srcToExpectedDist(s)[1]) === s (.d.ts path)", () => {
        const srcPath = fc.stringMatching(/^src\/[a-z][a-z0-9/]*\.ts$/);
        fc.assert(fc.property(srcPath, (src) => {
            const distPaths = srcToExpectedDist(src);
            if (distPaths.length === 0)
                return;
            expect(distToExpectedSrc(distPaths[1])).toBe(src);
        }));
    });
    it("non-src paths return empty/null", () => {
        const nonSrc = fc.stringMatching(/^(foo|bar|baz|test|lib)\/[a-z]+\.ts$/);
        fc.assert(fc.property(nonSrc, (path) => {
            expect(srcToExpectedDist(path)).toEqual([]);
            expect(distToExpectedSrc(path)).toBeNull();
        }));
    });
});
//# sourceMappingURL=dist-sync.property.test.js.map