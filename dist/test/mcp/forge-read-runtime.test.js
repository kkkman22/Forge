import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { execReadScript } from "../../src/mcp/tools/forge-read.js";
describe("execReadScript runtime sandbox", () => {
    let tmpRoot;
    afterEach(() => {
        if (tmpRoot) {
            rmSync(tmpRoot, { recursive: true, force: true });
            tmpRoot = undefined;
        }
    });
    function makeProject() {
        tmpRoot = mkdtempSync(join(tmpdir(), "forge-read-runtime-"));
        writeFileSync(join(tmpRoot, "allowed.txt"), "allowed-content\n");
        writeFileSync(join(tmpRoot, "secret.txt"), "secret-content\n");
        return tmpRoot;
    }
    it("allows scripts to read only files listed in FORGE_FILES through readFile()", async () => {
        const root = makeProject();
        const result = await execReadScript("console.log(readFile(FORGE_FILES[0]).trim())", "javascript", ["allowed.txt"], 5000, { cwd: root });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("allowed-content");
    });
    it("rejects attempts to read project files not listed in FORGE_FILES", async () => {
        const root = makeProject();
        const result = await execReadScript("console.log(readFile('secret.txt'))", "javascript", ["allowed.txt"], 5000, { cwd: root });
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("Path not listed in FORGE_FILES");
        expect(result.stdout).not.toContain("secret-content");
    });
    it("does not expose process or require to user scripts", async () => {
        const root = makeProject();
        const result = await execReadScript("console.log(typeof process, typeof require)", "javascript", ["allowed.txt"], 5000, { cwd: root });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("undefined undefined");
    });
    it("blocks Function-constructor escape attempts inside the VM", async () => {
        const root = makeProject();
        const result = await execReadScript("try { globalThis.constructor.constructor('return process')(); } catch (err) { console.log(err.name); }", "javascript", ["allowed.txt"], 5000, { cwd: root });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("EvalError");
    });
});
//# sourceMappingURL=forge-read-runtime.test.js.map