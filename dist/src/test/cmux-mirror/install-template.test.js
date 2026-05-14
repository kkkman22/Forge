import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
const SCRIPT = join(process.cwd(), "scripts", "cmux-mirror", "install-template.sh");
const TEMPLATE = join(process.cwd(), "templates", "cmux.json");
const TMP_DIR = join(process.cwd(), "test", ".install-tmp");
describe("install-template.sh (R9.1, R9.5, R9.6)", () => {
    afterEach(() => {
        if (existsSync(TMP_DIR))
            rmSync(TMP_DIR, { recursive: true });
    });
    function run(args = []) {
        return execSync(`bash "${SCRIPT}" ${args.join(" ")}`, {
            cwd: process.cwd(),
            encoding: "utf-8",
            stdio: "pipe",
        });
    }
    it("copies cmux.json to target if not exists", () => {
        mkdirSync(TMP_DIR, { recursive: true });
        run([TMP_DIR]);
        const target = join(TMP_DIR, "cmux.json");
        expect(existsSync(target)).toBe(true);
        expect(readFileSync(target, "utf-8")).toEqual(readFileSync(TEMPLATE, "utf-8"));
    });
    it("skips if target already exists (idempotent, R9.5)", () => {
        mkdirSync(TMP_DIR, { recursive: true });
        const target = join(TMP_DIR, "cmux.json");
        writeFileSync(target, '{"existing": true}');
        run([TMP_DIR]);
        const content = JSON.parse(readFileSync(target, "utf-8"));
        expect(content).toEqual({ existing: true });
    });
    it("overwrites with --force (R9.6)", () => {
        mkdirSync(TMP_DIR, { recursive: true });
        const target = join(TMP_DIR, "cmux.json");
        writeFileSync(target, '{"old": true}');
        run(["--force", TMP_DIR]);
        expect(readFileSync(target, "utf-8")).toEqual(readFileSync(TEMPLATE, "utf-8"));
    });
    it("exits cleanly with --no-cmux", () => {
        mkdirSync(TMP_DIR, { recursive: true });
        run(["--no-cmux", TMP_DIR]);
        expect(existsSync(join(TMP_DIR, "cmux.json"))).toBe(false);
    });
});
//# sourceMappingURL=install-template.test.js.map