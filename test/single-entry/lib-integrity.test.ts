import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { glob } from "glob";

const ROOT = resolve(import.meta.dirname, "..", "..");
const MANIFEST_PATH = resolve(ROOT, "skills/forge/lib/manifest.json");

describe("R2.6: lib integrity manifest", () => {
  it("manifest.json exists", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
  });

  it("manifest.json is valid JSON", () => {
    const content = readFileSync(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(content);
    expect(typeof parsed).toBe("object");
  });

  it("manifest contains sha256 for each sub", async () => {
    const content = readFileSync(MANIFEST_PATH, "utf-8");
    const manifest = JSON.parse(content);
    const libs = await glob("skills/forge/lib/*/instructions.md", { cwd: ROOT });
    for (const libPath of libs) {
      const sub = libPath.split("/")[3];
      expect(manifest, `manifest missing sub: ${sub}`).toHaveProperty(sub);
      if (manifest[sub]) {
        expect(manifest[sub].sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });
});
