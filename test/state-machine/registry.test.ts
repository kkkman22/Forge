import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadStateMachineDefinitions } from "../../src/state-machine/registry.js";
import type { EnabledPacks, FileSystem, PackEntry } from "../../src/pack/types.js";

/**
 * In-memory FileSystem stub (same pattern as test/pack/loader.test.ts).
 */
function createMockFs(files: Record<string, string | null>): FileSystem {
  return {
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
      const content = files[f];
      if (content === undefined || content === null) throw new Error(`ENOENT: ${f}`);
      return content;
    }),
    writeFile: vi.fn(),
    exists: vi.fn(async (f: string) => f in files && files[f] !== null),
    stat: vi.fn(async () => ({ isFile: () => true, isDirectory: () => false })),
  };
}

/** Build an EnabledPacks with given pack entries (each carrying state_machines dir). */
function enabledWith(packs: Array<{ name: string; stateMachinesDir?: string }>): EnabledPacks {
  const entries: PackEntry[] = packs.map((p) => {
    const rootPath = `/packs/${p.name}`;
    const extendsRec: Record<string, string> = {};
    if (p.stateMachinesDir !== undefined) {
      extendsRec.state_machines = path.resolve(rootPath, p.stateMachinesDir);
    }
    return {
      name: p.name,
      displayName: p.name,
      description: `${p.name} pack`,
      forgeMinVersion: "2.4.0",
      dependsOn: [],
      extends: extendsRec,
      featureFlags: {},
      manifestPath: `${rootPath}/pack.yaml`,
      rootPath,
    };
  });
  return {
    order: packs.map((p) => p.name),
    entries,
    customLayerRoot: "/repos/.forge/custom",
  };
}

/** A minimal valid state-machine YAML. */
function validYaml(name: string): string {
  return [
    `name: ${name}`,
    `description: "${name} machine"`,
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
  ].join("\n");
}

describe("loadStateMachineDefinitions", () => {
  it("returns empty machines + errors for empty enabled order", async () => {
    const fs = createMockFs({});
    const enabled = enabledWith([]);
    const result = await loadStateMachineDefinitions(enabled, fs);
    expect(result.machines).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("loads all *.yaml files from each enabled pack state_machines dir", async () => {
    const dir = "/packs/pms/state-machines";
    const fs = createMockFs({
      [path.join(dir, "reservation.yaml")]: validYaml("reservation"),
      [path.join(dir, "folio.yaml")]: validYaml("folio"),
      [path.join(dir, "README.md")]: "# not a yaml", // ignored (not .yaml)
    });
    const enabled = enabledWith([{ name: "pms", stateMachinesDir: "./state-machines" }]);
    const result = await loadStateMachineDefinitions(enabled, fs);
    expect(result.machines).toHaveLength(2);
    const names = result.machines.map((m) => m.definition.name).sort();
    expect(names).toEqual(["folio", "reservation"]);
    // sourceLayer tags the pack; sourcePath is absolute (order-independent check)
    for (const m of result.machines) {
      expect(m.sourceLayer).toBe("pack:pms");
      expect(m.sourcePath).toMatch(/\/packs\/pms\/state-machines\/\w+\.yaml$/);
    }
    expect(result.errors).toEqual([]);
  });

  it("collects validation errors instead of throwing for malformed yaml", async () => {
    const dir = "/packs/pms/state-machines";
    const malformed = [
      "name: broken",
      "description: bad",
      "states:",
      "  - name: Only",
      "initial: NonExistent", // initial not in states → validation error
      "transitions: []",
      "invariants: []",
    ].join("\n");
    const fs = createMockFs({
      [path.join(dir, "reservation.yaml")]: validYaml("reservation"),
      [path.join(dir, "broken.yaml")]: malformed,
    });
    const enabled = enabledWith([{ name: "pms", stateMachinesDir: "./state-machines" }]);
    const result = await loadStateMachineDefinitions(enabled, fs);
    // valid one still loaded
    expect(result.machines.map((m) => m.definition.name)).toEqual(["reservation"]);
    // broken one reported in errors
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("broken.yaml");
  });

  it("skips pack entries with no state_machines extends category", async () => {
    const fs = createMockFs({});
    const enabled = enabledWith([{ name: "pms" }]); // no stateMachinesDir
    const result = await loadStateMachineDefinitions(enabled, fs);
    expect(result.machines).toEqual([]);
    expect(result.errors).toEqual([]); // not an error, just skipped
  });

  it("loads from multiple packs in order", async () => {
    const fs = createMockFs({
      "/packs/pms/state-machines/reservation.yaml": validYaml("reservation"),
      "/packs/ecom/state-machines/order.yaml": validYaml("order"),
    });
    const enabled = enabledWith([
      { name: "pms", stateMachinesDir: "./state-machines" },
      { name: "ecom", stateMachinesDir: "./state-machines" },
    ]);
    const result = await loadStateMachineDefinitions(enabled, fs);
    expect(result.machines).toHaveLength(2);
    const layers = result.machines.map((m) => m.sourceLayer).sort();
    expect(layers).toEqual(["pack:ecom", "pack:pms"]);
  });
});
