import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { composeDomainKnowledgeBundle } from "../../src/pack/domain-bundle.js";
import type { EnabledPacks, FileSystem, PackEntry } from "../../src/pack/types.js";

/**
 * Counting FileSystem — wraps a base in-memory fs and counts IO calls, so we
 * can assert Zero-Pack-Zero-Impact (no pack files read when order is empty).
 * Directories are treated as existing directories when any file lives under
 * them (loadContexts checks exists()+isDirectory() on the dir path).
 */
function createCountingFs(files: Record<string, string | null>): FileSystem & {
  readFileCalls: string[];
  readdirCalls: string[];
} {
  const readFileCalls: string[] = [];
  const readdirCalls: string[] = [];

  /** True if `p` is a directory that contains at least one known file. */
  function isDirWithFiles(p: string): boolean {
    const prefix = p.endsWith("/") ? p : `${p}/`;
    return Object.keys(files).some((f) => f.startsWith(prefix));
  }

  const base: FileSystem = {
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
  };
  return Object.assign(base, { readFileCalls, readdirCalls });
}

function enabledWith(names: string[]): EnabledPacks {
  const entries: PackEntry[] = names.map((name) => {
    const rootPath = `/packs/${name}`;
    return {
      name,
      displayName: name,
      description: `${name} pack`,
      forgeMinVersion: "2.4.0",
      dependsOn: [],
      extends: {
        contexts: path.join(rootPath, "contexts"),
        glossary: path.join(rootPath, "glossary"),
        state_machines: path.join(rootPath, "state-machines"),
      },
      featureFlags: {},
      manifestPath: `${rootPath}/pack.yaml`,
      rootPath,
    };
  });
  return {
    order: names,
    entries,
    customLayerRoot: "/repos/.tinkerman/custom",
  };
}

describe("composeDomainKnowledgeBundle", () => {
  it("returns empty bundle + empty:true when no pack enabled, with ZERO pack-file reads", async () => {
    const fs = createCountingFs({});
    const enabled = enabledWith([]); // empty order
    const bundle = await composeDomainKnowledgeBundle(enabled, fs);
    expect(bundle.empty).toBe(true);
    expect(bundle.contexts).toEqual([]);
    expect(bundle.glossaryTerms).toEqual([]);
    expect(bundle.stateMachines).toEqual([]);
    expect(bundle.enabledPackNames).toEqual([]);
    // INV-1: no pack files read at all on the fast no-op path
    expect(fs.readFileCalls.length).toBe(0);
  });

  it("flattens contexts/glossary/state-machines from an enabled pack", async () => {
    const fs = createCountingFs({
      "/packs/pms/contexts/reservations.md": [
        "---",
        "name: reservations",
        "responsibility: booking lifecycle",
        "aggregates:",
        "  - Reservation",
        "---",
        "body",
      ].join("\n"),
      "/packs/pms/glossary/reservations.md": [
        "---",
        "terms:",
        "  - term: Reservation",
        "    aliases: [Booking]",
        '    definition: "a booking"',
        "---",
      ].join("\n"),
      "/packs/pms/state-machines/reservation.yaml": [
        "name: reservation",
        'description: "reservation machine"',
        "states:",
        "  - name: Start",
        "    description: begin",
        "  - name: Done",
        "    terminal: true",
        "    description: end",
        "initial: Start",
        "transitions:",
        "  - from: Start",
        "    to: Done",
        "    event: Finish",
        "invariants:",
        '  - expression: "terminal_state_has_no_outgoing_transitions"',
        "    description: terminals are sinks",
      ].join("\n"),
    });
    const enabled = enabledWith(["pms"]);
    const bundle = await composeDomainKnowledgeBundle(enabled, fs);
    expect(bundle.empty).toBe(false);
    expect(bundle.enabledPackNames).toEqual(["pms"]);
    expect(bundle.contexts.map((c) => c.name)).toEqual(["reservations"]);
    expect(bundle.glossaryTerms.length).toBeGreaterThanOrEqual(1);
    expect(bundle.stateMachines.map((m) => m.definition.name)).toEqual(["reservation"]);
  });
});
