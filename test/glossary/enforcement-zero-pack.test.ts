import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadEnforcementGlossary } from "../../src/glossary/enforcement.js";
import { mergeGlossaries } from "../../src/glossary/merge.js";
import type { FileSystem } from "../../src/pack/types.js";
import type { Glossary } from "../../src/glossary.js";

/**
 * REQ-5 / INV-1 — Zero-Pack invariance for the glossary enforcement bridge.
 *
 * A repo with NO enabled pack must produce an enforcement glossary that is the
 * flat glossary unchanged, with ZERO pack-file reads. This guarantees
 * `runGlossaryCheck` behavior is byte-identical to pre-slice-C when no pack is on.
 */

function createCountingFs(files: Record<string, string | null>): FileSystem & {
  readFileCalls: string[];
} {
  const readFileCalls: string[] = [];
  function isDirWithFiles(p: string): boolean {
    const prefix = p.endsWith("/") ? p : `${p}/`;
    return Object.keys(files).some((f) => f.startsWith(prefix));
  }
  return Object.assign(
    {
      readdir: vi.fn(async (dir: string) => {
        const dirPrefix = dir.endsWith("/") ? dir : `${dir}/`;
        const entries = new Set<string>();
        for (const f of Object.keys(files)) {
          if (f.startsWith(dirPrefix)) {
            const rest = f.slice(dirPrefix.length);
            const firstSegment = rest.split("/")[0];
            if (firstSegment) entries.add(firstSegment);
          }
        }
        return [...entries];
      }),
      readFile: vi.fn(async (f: string) => {
        readFileCalls.push(f);
        const content = files[f];
        if (content === undefined || content === null) throw new Error(`ENOENT: ${f}`);
        return content;
      }),
      writeFile: vi.fn(async (f: string, c: string) => {
        files[f] = c;
      }),
      exists: vi.fn(async (f: string) => {
        if (f in files && files[f] !== null) return true;
        return isDirWithFiles(f);
      }),
      stat: vi.fn(async (f: string) => ({
        isFile: () => f in files && files[f] !== null,
        isDirectory: () => isDirWithFiles(f),
      })),
    },
    { readFileCalls },
  );
}

const REPOS_ROOT = "/repos";
const GLOSSARY_PATH = path.join(REPOS_ROOT, ".forge", "glossary.md");
const CONFIG_PATH = path.join(REPOS_ROOT, ".forge", "config.md");
const PACKS_DIR = path.join(REPOS_ROOT, "packs");

function flatGlossaryMd(): string {
  return [
    "---",
    "schema_version: 2",
    'updated: "2026-01-01"',
    "---",
    "",
    "# Forge Glossary",
    "",
    "## Tier",
    "**定义**: Forge 复杂度档位。",
    "**更新**: 2026-01-01",
    "",
  ].join("\n");
}

describe("Zero-Pack invariance — glossary enforcement (REQ-5 / INV-1)", () => {
  it("no packs field → enforcement glossary is flat unchanged, zero pack reads", async () => {
    const fs = createCountingFs({
      [GLOSSARY_PATH]: flatGlossaryMd(),
      [CONFIG_PATH]: "---\nproject: Forge\n---\nbody",
      // A pack exists on disk but is NOT enabled (config has no packs: field).
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: "name: pms\n",
    });
    const result = await loadEnforcementGlossary(REPOS_ROOT, fs);
    expect(result.packTermCount).toBe(0);
    // The flat term is present and it's the ONLY term.
    expect(result.glossary.terms.map((t) => t.term)).toEqual(["Tier"]);
    // No pack glossary data was read.
    const packDataReads = fs.readFileCalls.filter((p) => p.includes("/packs/pms/glossary/"));
    expect(packDataReads.length).toBe(0);
  });

  it("mergeGlossaries returns the flat reference unchanged when packEntries is empty", () => {
    const flat: Glossary = {
      schema_version: 2,
      updated: "2026-01-01",
      terms: [{ term: "Tier", definition: "档位", last_updated: "2026-01-01" }],
    };
    const merged = mergeGlossaries(flat, []);
    expect(merged).toBe(flat); // identity — same reference, no allocation
  });
});
