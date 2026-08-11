import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");
const MANIFEST_PATH = resolve(ROOT, "skills/tinkerman/lib/manifest.json");

describe("R2.6: lib integrity manifest", () => {
  it("manifest.json exists", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
  });

  it("manifest.json is valid JSON with subs structure", () => {
    const content = readFileSync(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(1);
    expect(parsed.subs).toBeDefined();
    expect(typeof parsed.subs).toBe("object");
  });

  it("manifest contains instructions sha256 for each sub", async () => {
    const content = readFileSync(MANIFEST_PATH, "utf-8");
    const manifest = JSON.parse(content);
    const libs = await glob("skills/tinkerman/lib/*/instructions.md", { cwd: ROOT });

    for (const libPath of libs) {
      const sub = libPath.split("/")[3];
      expect(manifest.subs, `manifest missing sub: ${sub}`).toHaveProperty(sub);
      if (manifest.subs[sub]) {
        expect(manifest.subs[sub].instructions.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(manifest.subs[sub].instructions.path).toBe(`${sub}/instructions.md`);
      }
    }
  });

  it("manifest references are arrays with valid sha256", async () => {
    const content = readFileSync(MANIFEST_PATH, "utf-8");
    const manifest = JSON.parse(content);

    for (const [sub, entry] of Object.entries(manifest.subs)) {
      const e = entry as { references: Array<{ path: string; sha256: string }> };
      expect(Array.isArray(e.references), `${sub}.references is not array`).toBe(true);
      for (const ref of e.references) {
        expect(ref.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(ref.path).toMatch(new RegExp(`^${sub}/references/`));
      }
    }
  });
});
