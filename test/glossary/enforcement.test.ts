import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadEnforcementGlossary } from "../../src/glossary/enforcement.js";
import type { FileSystem } from "../../src/pack/types.js";

/**
 * Counting async FileSystem (same pattern as test/pack/runtime-zero-pack.test.ts).
 * Records every readFile/readdir target so we can assert Zero-Pack zero pack reads.
 */
function createCountingFs(files: Record<string, string | null>): FileSystem & {
  readFileCalls: string[];
  readdirCalls: string[];
} {
  const readFileCalls: string[] = [];
  const readdirCalls: string[] = [];

  function isDirWithFiles(p: string): boolean {
    const prefix = p.endsWith("/") ? p : `${p}/`;
    return Object.keys(files).some((f) => f.startsWith(prefix));
  }

  return Object.assign(
    {
      readdir: vi.fn(async (dir: string) => {
        readdirCalls.push(dir);
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
      writeFile: vi.fn(async (f: string, _content: string) => {
        files[f] = _content;
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
    { readFileCalls, readdirCalls },
  );
}

const REPOS_ROOT = "/repos";
const CONFIG_PATH = path.join(REPOS_ROOT, ".forge", "config.md");
const GLOSSARY_PATH = path.join(REPOS_ROOT, ".forge", "glossary.md");
const PACKS_DIR = path.join(REPOS_ROOT, "packs");

function flatGlossaryMd(): string {
  // Flat glossary format: ## headings + **定义**/**别名** lines (see .forge/glossary.md).
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

function pmsPackYaml(): string {
  return [
    "name: pms",
    "display_name: PMS",
    "description: Hotel PMS domain pack",
    "forge_min_version: '2.4.0'",
    "extends:",
    "  glossary: ./glossary",
  ].join("\n");
}

function pmsGlossaryMd(): string {
  // Pack glossary format: YAML `terms:` list in frontmatter (NOT markdown bullets).
  return [
    "---",
    "name: reservations",
    "description: Reservations Context terms",
    "terms:",
    "  - term: Reservation",
    "    aliases: [Booking]",
    '    definition: "a booking"',
    "  - term: Folio",
    '    definition: "guest bill"',
    "---",
    "",
    "body text ignored",
  ].join("\n");
}

describe("loadEnforcementGlossary", () => {
  it("returns flat glossary unchanged when no pack is enabled (zero pack reads)", async () => {
    const fs = createCountingFs({
      [GLOSSARY_PATH]: flatGlossaryMd(),
      [CONFIG_PATH]: "---\nproject: Forge\n---\nbody",
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: pmsPackYaml(),
    });
    const result = await loadEnforcementGlossary(REPOS_ROOT, fs);
    expect(result.packTermCount).toBe(0);
    // flat term preserved
    expect(result.glossary.terms.some((t) => t.term === "Tier")).toBe(true);
    // no pack glossary files read (Zero-Pack-Zero-Impact)
    const packReads = fs.readFileCalls.filter((p) => p.includes("/packs/pms/glossary/"));
    expect(packReads.length).toBe(0);
  });

  it("merges pack glossary terms not covered by flat", async () => {
    const fs = createCountingFs({
      [GLOSSARY_PATH]: flatGlossaryMd(), // has "Tier" only
      [CONFIG_PATH]: "---\npacks:\n  - pms\n---\nbody",
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: pmsPackYaml(),
      [path.join(PACKS_DIR, "pms", "glossary", "reservations.md")]: pmsGlossaryMd(),
    });
    const result = await loadEnforcementGlossary(REPOS_ROOT, fs);
    expect(result.packTermCount).toBe(2); // Reservation + Folio appended (Tier is flat)
    const terms = result.glossary.terms.map((t) => t.term);
    expect(terms).toContain("Reservation");
    expect(terms).toContain("Folio");
    expect(terms).toContain("Tier");
  });

  it("skips pack terms that collide with flat (flat sovereignty)", async () => {
    // Flat defines "Tier"; pack also defines "Tier" — must not double-count.
    const fs = createCountingFs({
      [GLOSSARY_PATH]: flatGlossaryMd(), // "Tier"
      [CONFIG_PATH]: "---\npacks:\n  - pms\n---\nbody",
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: pmsPackYaml(),
      [path.join(PACKS_DIR, "pms", "glossary", "core.md")]: [
        "---",
        "name: core",
        "terms:",
        "  - term: Tier",
        '    definition: "PACK conflicting definition"',
        "---",
      ].join("\n"),
    });
    const result = await loadEnforcementGlossary(REPOS_ROOT, fs);
    expect(result.packTermCount).toBe(0); // Tier covered by flat → skipped
    const tierTerms = result.glossary.terms.filter((t) => t.term === "Tier");
    expect(tierTerms).toHaveLength(1);
  });

  it("seeds flat glossary when .forge/glossary.md is absent", async () => {
    const files: Record<string, string | null> = {
      [CONFIG_PATH]: "---\nproject: Forge\n---\nbody",
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: pmsPackYaml(),
    };
    const fs = createCountingFs(files);
    const result = await loadEnforcementGlossary(REPOS_ROOT, fs, {
      now: new Date("2026-06-29T00:00:00Z"),
    });
    // seeded with the core terms
    expect(result.glossary.terms.length).toBeGreaterThanOrEqual(12);
    expect(result.packTermCount).toBe(0); // no pack enabled
    // the seed was written to disk (file now present in the fs map)
    expect(files[GLOSSARY_PATH]).toBeTruthy();
    expect(files[GLOSSARY_PATH]).toContain("Tier");
  });
});
