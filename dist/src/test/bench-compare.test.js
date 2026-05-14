/**
 * Regression test for `scripts/extract-bench-json.mjs`.
 *
 * Uses synthetic bench JSON inputs to verify:
 *   - baseline → PR speedup is accepted
 *   - PR slower than baseline beyond threshold fails with exit 1
 *   - PR slower within threshold is accepted
 *
 * **Validates: Requirement 4.6**
 */
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const SCRIPT = "scripts/extract-bench-json.mjs";
function fixture(mean) {
    const tasks = [
        { name: "b1", result: { benchmark: { mean, hz: 1000 / mean } } },
    ];
    return {
        files: [
            {
                filepath: "test/benchmarks/sample.bench.ts",
                tasks: [{ type: "suite", name: "suite", tasks }],
            },
        ],
    };
}
function runCompare(baseline, pr, threshold) {
    const dir = mkdtempSync(join(tmpdir(), "bench-"));
    const bp = join(dir, "baseline.json");
    const pp = join(dir, "pr.json");
    writeFileSync(bp, JSON.stringify(baseline));
    writeFileSync(pp, JSON.stringify(pr));
    try {
        const stdout = execSync(`node ${SCRIPT} ${bp} ${pp} --threshold=${threshold}`, {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        return { exit: 0, stdout };
    }
    catch (err) {
        const e = err;
        return {
            exit: e.status ?? 1,
            stdout: e.stdout ? e.stdout.toString() : "",
        };
    }
}
describe("extract-bench-json — regression gate", () => {
    it("accepts a PR that is faster than the baseline", () => {
        const { exit, stdout } = runCompare(fixture(1.0), fixture(0.5), 1.2);
        expect(exit).toBe(0);
        const result = JSON.parse(stdout);
        expect(result[0].regression).toBe(false);
    });
    it("rejects a PR 10x slower than baseline with 1.20 threshold", () => {
        const { exit, stdout } = runCompare(fixture(0.1), fixture(1.0), 1.2);
        expect(exit).toBe(1);
        const result = JSON.parse(stdout);
        expect(result[0].regression).toBe(true);
        expect(result[0].ratio).toBeGreaterThan(5);
    });
    it("accepts a PR marginally slower (10%) within threshold (20%)", () => {
        const { exit, stdout } = runCompare(fixture(1.0), fixture(1.1), 1.2);
        expect(exit).toBe(0);
        const result = JSON.parse(stdout);
        expect(result[0].regression).toBe(false);
    });
});
//# sourceMappingURL=bench-compare.test.js.map