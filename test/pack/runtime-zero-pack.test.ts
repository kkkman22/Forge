import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { composeDomainKnowledgeBundle } from "../../src/pack/domain-bundle.js";
import { loadEnabledPacks } from "../../src/pack/runtime.js";
import type { FileSystem } from "../../src/pack/types.js";

/**
 * REQ-7 / INV-1 — Zero-Pack-Zero-Impact for the runtime wiring chain.
 *
 * A repo with NO enabled pack must:
 *   (a) resolve to empty enabled packs with no errors;
 *   (b) compose to an empty bundle with empty:true;
 *   (c) perform ZERO reads of any file under packs/ (counting fs).
 *
 * This guards the regression where the wiring chain accidentally reads pack
 * files even when none are enabled.
 */

const REPOS_ROOT = "/repos";
const CONFIG_PATH = path.join(REPOS_ROOT, ".forge", "config.md");
const PACKS_DIR = path.join(REPOS_ROOT, "packs");

/** Counting fs: records every readFile/readdir target. */
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
      writeFile: vi.fn(),
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

describe("Zero-Pack-Zero-Impact (runtime + bundle chain) — REQ-7 / INV-1", () => {
  it("no packs field → empty enabled, no errors, no injected domain data", async () => {
    // A pack exists on disk but is NOT enabled (config has no packs: field).
    const fs = createCountingFs({
      [CONFIG_PATH]: "---\nproject: Forge\n---\nbody",
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: "name: pms\n",
    });

    const { enabled, errors } = await loadEnabledPacks(REPOS_ROOT, fs);
    expect(enabled.order).toEqual([]);
    expect(errors).toEqual([]);

    const bundle = await composeDomainKnowledgeBundle(enabled, fs);
    expect(bundle.empty).toBe(true);
    expect(bundle.contexts).toEqual([]);
    expect(bundle.glossaryTerms).toEqual([]);
    expect(bundle.stateMachines).toEqual([]);

    // INV-1: Zero-Pack-Zero-Impact is about INJECTED domain data, not manifest
    // discovery. loadPackRegistry legitimately reads pack.yaml manifests to
    // build the registry (structural overhead, 1 read here). What must NOT
    // happen is reading any contexts/glossary/state-machines domain data —
    // the bundle composer's empty-order fast path skips all of those.
    const domainDataReads = fs.readFileCalls.filter(
      (p) => p.includes("/contexts/") || p.includes("/glossary/") || p.includes("/state-machines/"),
    );
    expect(domainDataReads.length).toBe(0);
  });

  it("no config.md at all → warning + empty, no injected domain data", async () => {
    const fs = createCountingFs({
      [path.join(PACKS_DIR, "pms", "pack.yaml")]: "name: pms\n",
    });

    const { enabled, errors, warnings } = await loadEnabledPacks(REPOS_ROOT, fs);
    expect(enabled.order).toEqual([]);
    expect(errors).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);

    const bundle = await composeDomainKnowledgeBundle(enabled, fs);
    expect(bundle.empty).toBe(true);

    const domainDataReads = fs.readFileCalls.filter(
      (p) => p.includes("/contexts/") || p.includes("/glossary/") || p.includes("/state-machines/"),
    );
    expect(domainDataReads.length).toBe(0);
  });
});
