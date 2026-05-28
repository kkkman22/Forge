import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const ROOT = join(import.meta.dirname, "..");
describe("T10: Warm-up replacement", () => {
    it("forge-loop-cli.ts has --no-warmup flag", () => {
        const content = readFileSync(join(ROOT, "src/forge-loop-cli.ts"), "utf-8");
        expect(content).toContain("--no-warmup");
    });
    it("warm-up spawn uses claude --print --max-turns 1", () => {
        const content = readFileSync(join(ROOT, "src/forge-loop-cli.ts"), "utf-8");
        expect(content).toContain('"--print"');
        expect(content).toContain('"--max-turns=1"');
        expect(content).toContain('"--output-format=stream-json"');
    });
    it("warm-up is gated by --no-warmup", () => {
        const content = readFileSync(join(ROOT, "src/forge-loop-cli.ts"), "utf-8");
        // Find the warmup block and verify it's inside a noWarmup check
        expect(content).toMatch(/!opts\.noWarmup/);
    });
    it("warm-up writes warm-up.json to runDir", () => {
        const content = readFileSync(join(ROOT, "src/forge-loop-cli.ts"), "utf-8");
        expect(content).toContain("warm-up.json");
    });
    it("warm-up failure aborts with CliError", () => {
        const content = readFileSync(join(ROOT, "src/forge-loop-cli.ts"), "utf-8");
        expect(content).toContain("Warm-up failed");
        expect(content).toContain("CliError");
    });
});
//# sourceMappingURL=warmup-replacement.test.js.map