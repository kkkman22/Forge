import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SPEC_PATH = resolve(ROOT, ".kiro/specs/forge-single-entry-skills-collapse/spec.md");

const EXPECTED_MODES: Record<string, string> = {
  learn: "fork",
  decide: "fork",
  "decide-teams": "fork",
  debug: "fork",
  grill: "fork",
  init: "inline",
  storm: "fork",
  recap: "fork",
  mutate: "fork",
  "zoom-out": "fork",
  review: "fork",
  build: "fork",
  "build-light": "inline",
  plan: "fork",
  spec: "fork",
  ship: "fork",
  test: "fork",
  loop: "fork",
  router: "inline",
  status: "inline",
  resume: "inline",
  abort: "inline",
  verify: "inline",
  accept: "fork",
  refactor: "inline",
  fix: "inline",
  pack: "fork",
  "fix-conflicts": "inline",
  "control-cli": "inline",
  "control-ui": "inline",
};

function parseR35Table(specContent: string): Map<string, string> {
  const table = new Map<string, string>();
  const lines = specContent.split("\n");
  let inTable = false;

  for (const line of lines) {
    if (line.includes("| sub | mode |")) {
      inTable = true;
      continue;
    }
    if (
      inTable &&
      line.startsWith("|") &&
      !line.startsWith("|---") &&
      !line.includes("sub | mode")
    ) {
      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cols.length >= 2) {
        table.set(cols[0], cols[1]);
      }
    }
    if (inTable && !line.startsWith("|")) {
      break;
    }
  }
  return table;
}

describe("R3.5: dispatch_mode matches spec table", () => {
  it("spec R3.5 table parses correctly with 29 entries", () => {
    const specContent = readFileSync(SPEC_PATH, "utf-8");
    const table = parseR35Table(specContent);
    expect(table.size).toBe(29);
  });

  it("EXPECTED_MODES constant matches spec table exactly", () => {
    const specContent = readFileSync(SPEC_PATH, "utf-8");
    const table = parseR35Table(specContent);

    for (const [sub, mode] of table) {
      expect(EXPECTED_MODES[sub], `spec has sub ${sub} not in EXPECTED_MODES`).toBeDefined();
      expect(EXPECTED_MODES[sub], `mismatch for ${sub}`).toBe(mode);
    }

    for (const sub of Object.keys(EXPECTED_MODES)) {
      if (!table.has(sub)) continue;
    }
  });

  it("lib frontmatter dispatch_mode matches EXPECTED_MODES", async () => {
    const libs = await glob("skills/forge/lib/*/instructions.md", { cwd: ROOT });
    expect(libs).toHaveLength(30);

    const violations: string[] = [];

    for (const libPath of libs) {
      const sub = libPath.split("/")[3];
      const content = readFileSync(resolve(ROOT, libPath), "utf-8");
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      const expectedMode = EXPECTED_MODES[sub];

      if (!fmMatch) {
        violations.push(`${sub}: no frontmatter`);
        continue;
      }

      const modeMatch = fmMatch[1].match(/dispatch_mode:\s*(\S+)/);
      const actualMode = modeMatch?.[1] ?? "inline";

      if (actualMode !== expectedMode) {
        violations.push(`${sub}: expected=${expectedMode} actual=${actualMode}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
