import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOW_LIST, validateTopic } from "../../src/forge-dispatcher/allowlist.js";

const FORGE_ROOT = join(import.meta.dirname, "../..");
const REGISTRY_PATH = join(FORGE_ROOT, "skills/forge/registry.toml");

function parseRegistrySections(tomlContent: string): string[] {
  const sections: string[] = [];
  for (const line of tomlContent.split("\n")) {
    const match = /^\[([^\]]+)\]/.exec(line);
    if (match) sections.push(match[1]);
  }
  return sections;
}

describe("allowlist parity with registry.toml", () => {
  it("ALLOW_LIST length matches registry.toml section count", () => {
    const toml = readFileSync(REGISTRY_PATH, "utf-8");
    const sections = parseRegistrySections(toml);
    expect(ALLOW_LIST.length).toBe(sections.length);
  });

  it("dispatches 'init' successfully", () => {
    const result = validateTopic("init");
    expect(result).toEqual({ ok: true, value: "init" });
  });

  it("dispatches 'review-comment-bitbucket' successfully", () => {
    const result = validateTopic("review-comment-bitbucket");
    expect(result).toEqual({ ok: true, value: "review-comment-bitbucket" });
  });

  it("every registry section is in ALLOW_LIST", () => {
    const toml = readFileSync(REGISTRY_PATH, "utf-8");
    const sections = parseRegistrySections(toml);
    for (const section of sections) {
      expect(ALLOW_LIST).toContain(section);
    }
  });
});
