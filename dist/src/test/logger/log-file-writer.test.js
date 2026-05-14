import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
let tempDirs = [];
function makeTempDir() {
    const dir = mkdtempSync(join(tmpdir(), "log-file-writer-test-"));
    tempDirs.push(dir);
    return dir;
}
afterEach(() => {
    for (const dir of tempDirs) {
        try {
            rmSync(dir, { recursive: true, force: true });
        }
        catch {
            // best-effort cleanup
        }
    }
    tempDirs = [];
});
describe("validateFileWritable", () => {
    it("should not throw for a writable existing file", async () => {
        const { validateFileWritable } = await import("../../src/logger/log-file-writer.js");
        const dir = makeTempDir();
        const filePath = join(dir, "test.log");
        writeFileSync(filePath, "");
        expect(() => validateFileWritable(filePath)).not.toThrow();
    });
    it("should not throw when file does not exist but parent directory is writable", async () => {
        const { validateFileWritable } = await import("../../src/logger/log-file-writer.js");
        const dir = makeTempDir();
        const filePath = join(dir, "new-file.log");
        expect(() => validateFileWritable(filePath)).not.toThrow();
    });
    it("should throw when parent directory does not exist", async () => {
        const { validateFileWritable } = await import("../../src/logger/log-file-writer.js");
        const filePath = join(tmpdir(), "nonexistent-dir-abc123", "test.log");
        expect(() => validateFileWritable(filePath)).toThrow("Parent directory does not exist");
    });
    it("should throw when existing file is not writable", async () => {
        const { validateFileWritable } = await import("../../src/logger/log-file-writer.js");
        const dir = makeTempDir();
        const filePath = join(dir, "readonly.log");
        writeFileSync(filePath, "");
        chmodSync(filePath, 0o444);
        // Skip on Windows where chmod doesn't reliably restrict write access
        if (process.platform === "win32") {
            return;
        }
        // Skip if running as root (root can write to read-only files)
        if (process.getuid?.() === 0) {
            return;
        }
        expect(() => validateFileWritable(filePath)).toThrow("not writable");
    });
    it("should throw when parent directory is not writable", async () => {
        const { validateFileWritable } = await import("../../src/logger/log-file-writer.js");
        const dir = makeTempDir();
        const readonlyDir = join(dir, "readonly");
        const { mkdirSync } = await import("node:fs");
        mkdirSync(readonlyDir);
        chmodSync(readonlyDir, 0o555);
        const filePath = join(readonlyDir, "test.log");
        // Skip on Windows where chmod doesn't reliably restrict write access
        if (process.platform === "win32") {
            return;
        }
        // Skip if running as root
        if (process.getuid?.() === 0) {
            return;
        }
        expect(() => validateFileWritable(filePath)).toThrow("not writable");
        // Restore permissions for cleanup
        chmodSync(readonlyDir, 0o755);
    });
});
describe("createFileWriter", () => {
    it("should return a function", async () => {
        const { createFileWriter } = await import("../../src/logger/log-file-writer.js");
        const dir = makeTempDir();
        const filePath = join(dir, "output.log");
        const writer = createFileWriter(filePath);
        expect(typeof writer).toBe("function");
    });
    it("should append content to file with newline at end of each line", async () => {
        const { createFileWriter } = await import("../../src/logger/log-file-writer.js");
        const dir = makeTempDir();
        const filePath = join(dir, "output.log");
        const writer = createFileWriter(filePath);
        writer("first line");
        writer("second line");
        const content = readFileSync(filePath, "utf-8");
        expect(content).toBe("first line\nsecond line\n");
    });
    it("should create the file if it does not exist", async () => {
        const { createFileWriter } = await import("../../src/logger/log-file-writer.js");
        const dir = makeTempDir();
        const filePath = join(dir, "new-output.log");
        const writer = createFileWriter(filePath);
        writer("hello");
        const content = readFileSync(filePath, "utf-8");
        expect(content).toBe("hello\n");
    });
    it("should append to an existing file", async () => {
        const { createFileWriter } = await import("../../src/logger/log-file-writer.js");
        const dir = makeTempDir();
        const filePath = join(dir, "existing.log");
        writeFileSync(filePath, "existing content\n");
        const writer = createFileWriter(filePath);
        writer("new line");
        const content = readFileSync(filePath, "utf-8");
        expect(content).toBe("existing content\nnew line\n");
    });
    it("should produce valid JSON Lines when writing JSON strings", async () => {
        const { createFileWriter } = await import("../../src/logger/log-file-writer.js");
        const dir = makeTempDir();
        const filePath = join(dir, "jsonl.log");
        const writer = createFileWriter(filePath);
        const entry1 = JSON.stringify({ level: "info", message: "hello" });
        const entry2 = JSON.stringify({ level: "warn", message: "world" });
        writer(entry1);
        writer(entry2);
        const content = readFileSync(filePath, "utf-8");
        const lines = content.trimEnd().split("\n");
        expect(lines).toHaveLength(2);
        // Each line should be independently parseable as JSON
        expect(JSON.parse(lines[0])).toEqual({ level: "info", message: "hello" });
        expect(JSON.parse(lines[1])).toEqual({ level: "warn", message: "world" });
    });
});
//# sourceMappingURL=log-file-writer.test.js.map