import { describe, expect, it } from "vitest";
import { parseCommandArgs } from "../src/ship.js";
describe("parseCommandArgs", () => {
    it("splits simple commands correctly", () => {
        const [bin, ...args] = parseCommandArgs("echo hello world");
        expect(bin).toBe("echo");
        expect(args).toEqual(["hello", "world"]);
    });
    it("preserves quoted arguments as single tokens", () => {
        const [bin, ...args] = parseCommandArgs('echo "hello world" foo');
        expect(bin).toBe("echo");
        expect(args).toEqual(["hello world", "foo"]);
    });
    it("preserves single-quoted arguments as single tokens", () => {
        const [bin, ...args] = parseCommandArgs("echo 'hello world' foo");
        expect(bin).toBe("echo");
        expect(args).toEqual(["hello world", "foo"]);
    });
    it("handles escaped quotes inside double quotes", () => {
        const [bin, ...args] = parseCommandArgs('echo "say \\"hi\\"" end');
        expect(bin).toBe("echo");
        expect(args).toEqual(['say "hi"', "end"]);
    });
    it("handles npm run commands with quoted args", () => {
        const [bin, ...args] = parseCommandArgs('npm run check -- --grep "my test"');
        expect(bin).toBe("npm");
        expect(args).toEqual(["run", "check", "--", "--grep", "my test"]);
    });
    it("handles empty string", () => {
        const result = parseCommandArgs("");
        expect(result).toEqual([]);
    });
    it("handles command with no args", () => {
        const [bin, ...args] = parseCommandArgs("echo");
        expect(bin).toBe("echo");
        expect(args).toEqual([]);
    });
});
//# sourceMappingURL=ship-command-parse.test.js.map