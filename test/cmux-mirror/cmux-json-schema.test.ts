import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural conformance gate for templates/cmux.json.
 *
 * Validates against the REAL cmux.json schema (commands[].workspace.layout
 * recursive split tree; surfaces are terminal|browser only) — NOT the
 * Forge-idealized `layouts`/`Mirror_Pane` shape that previously drifted in
 * and was masked by a tautological test + cmux's own `config doctor` (which
 * only checks JSONC syntax, not semantic schema).
 *
 * Authority: https://raw.githubusercontent.com/manaflow-ai/cmux/main/web/data/cmux.schema.json
 *            https://cmux.com/docs/custom-commands
 */

type Surface = { type?: unknown; command?: unknown; url?: unknown; name?: unknown };
type PaneNode = { pane?: { surfaces?: Surface[] } };
type SplitNode = {
  direction?: unknown;
  split?: unknown;
  children?: LayoutNode[];
};
type LayoutNode = PaneNode | SplitNode;

interface CmuxCommand {
  name?: unknown;
  command?: unknown;
  workspace?: { layout?: LayoutNode };
}
interface CmuxConfig {
  schemaVersion?: unknown;
  version?: unknown;
  commands?: CmuxCommand[];
  agent_resume_approvals?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

const configPath = join(process.cwd(), "templates", "cmux.json");
const LEGACY_PANE_TYPES = new Set(["Mirror_Pane", "Progress_Pane", "Loop_State"]);

function parseConfig(): CmuxConfig {
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

function isSplitNode(n: LayoutNode): n is SplitNode {
  return n !== null && typeof n === "object" && "children" in n;
}
function isPaneNode(n: LayoutNode): n is PaneNode {
  return n !== null && typeof n === "object" && "pane" in n;
}

/** Walk the layout tree, collecting every schema violation. */
function layoutViolations(node: LayoutNode, path: string, out: string[]): void {
  if (isSplitNode(node)) {
    const dir = node.direction;
    if (dir !== "horizontal" && dir !== "vertical") {
      out.push(`${path}.direction must be horizontal|vertical, got ${JSON.stringify(dir)}`);
    }
    const sp = node.split;
    if (typeof sp !== "number" || sp < 0.1 || sp > 0.9) {
      out.push(`${path}.split must be a number in [0.1,0.9], got ${JSON.stringify(sp)}`);
    }
    const kids = node.children ?? [];
    if (kids.length !== 2) {
      out.push(`${path}.children must have exactly 2 nodes, got ${kids.length}`);
    }
    kids.forEach((k, i) => layoutViolations(k, `${path}.children[${i}]`, out));
    return;
  }
  if (isPaneNode(node)) {
    const surfaces = node.pane?.surfaces;
    if (!Array.isArray(surfaces) || surfaces.length === 0) {
      out.push(`${path}.pane.surfaces must be a non-empty array`);
      return;
    }
    surfaces.forEach((s, i) => {
      if (s.type !== "terminal" && s.type !== "browser") {
        out.push(
          `${path}.pane.surfaces[${i}].type must be terminal|browser, got ${JSON.stringify(s.type)}`,
        );
      }
    });
    return;
  }
  out.push(`${path} is neither a split node (children) nor a pane node (pane.surfaces)`);
}

/** Flatten all surfaces reachable from a layout tree. */
function collectSurfaces(node: LayoutNode, out: Surface[] = []): Surface[] {
  if (isSplitNode(node)) {
    (node.children ?? []).forEach((c) => collectSurfaces(c, out));
  } else if (isPaneNode(node)) {
    out.push(...(node.pane?.surfaces ?? []));
  }
  return out;
}

// Resolved once at module load; cmux is macOS-native so CI (headless) lacks it.
const HAS_CMUX = (() => {
  try {
    execFileSync("cmux", ["--version"], { stdio: "ignore", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
})();
// When cmux is absent, register the doctor test as skipped rather than failing.
const doctorIt = HAS_CMUX ? it : it.skip;

describe("templates/cmux.json — real cmux schema conformance", () => {
  it("is valid JSON with schemaVersion 1", () => {
    const config = parseConfig();
    expect(config.schemaVersion).toBe(1);
  });

  it("has NO legacy top-level `layouts` key (the prior drift)", () => {
    const config = parseConfig();
    expect(config).not.toHaveProperty("layouts");
  });

  it("declares commands as a non-empty array", () => {
    const config = parseConfig();
    expect(Array.isArray(config.commands)).toBe(true);
    expect((config.commands ?? []).length).toBeGreaterThan(0);
  });

  it("defines the three R9.2 Forge workspace commands by name", () => {
    const config = parseConfig();
    const names = (config.commands ?? []).map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(["Forge Workflow", "Forge Loop Monitor", "Forge Dev"]),
    );
  });

  it("every Forge command is a valid workspace layout command (no label/action drift)", () => {
    const config = parseConfig();
    const forge = (config.commands ?? []).filter((c) =>
      ["Forge Workflow", "Forge Loop Monitor", "Forge Dev"].includes(c.name as string),
    );
    expect(forge.length).toBe(3);
    for (const cmd of forge) {
      expect(cmd).not.toHaveProperty("label"); // legacy drift field
      expect(cmd).not.toHaveProperty("action"); // legacy drift field
      expect(typeof cmd.workspace).toBe("object");
      expect(cmd.workspace).not.toBeUndefined();
    }
  });

  it("every Forge layout tree conforms to the cmux split/pane schema", () => {
    const config = parseConfig();
    const forge = (config.commands ?? []).filter((c) =>
      ["Forge Workflow", "Forge Loop Monitor", "Forge Dev"].includes(c.name as string),
    );
    const violations: string[] = [];
    for (const cmd of forge) {
      const layout = cmd.workspace?.layout;
      if (layout === undefined) {
        violations.push(`${cmd.name}: missing workspace.layout`);
        continue;
      }
      layoutViolations(layout as LayoutNode, `${cmd.name}.layout`, violations);
    }
    expect(violations).toEqual([]);
  });

  it("uses only terminal|browser surfaces (no Mirror_Pane/Progress_Pane/Loop_State)", () => {
    const config = parseConfig();
    const raw = JSON.stringify(config);
    for (const legacy of LEGACY_PANE_TYPES) {
      expect(raw).not.toContain(`"type": "${legacy}"`);
      expect(raw).not.toContain(`"${legacy}"`);
    }
  });

  it("each Forge layout runs the Mirror_Daemon (R9.2 mirror pane intent)", () => {
    const config = parseConfig();
    const forge = (config.commands ?? []).filter((c) =>
      ["Forge Workflow", "Forge Loop Monitor", "Forge Dev"].includes(c.name as string),
    );
    for (const cmd of forge) {
      const surfaces = collectSurfaces(cmd.workspace!.layout as LayoutNode);
      const hasMirror = surfaces.some(
        (s) => typeof s.command === "string" && s.command.includes("mirror.mjs"),
      );
      expect(hasMirror, `${cmd.name}: no terminal runs scripts/cmux-mirror/mirror.mjs`).toBe(true);
    }
  });

  it("at least one layout surfaces a Claude Code terminal (R9.3 intent)", () => {
    const config = parseConfig();
    const allSurfaces = (config.commands ?? []).flatMap(
      (c) => collectSurfaces(c.workspace?.layout as LayoutNode) ?? [],
    );
    const hasClaude = allSurfaces.some(
      (s) => typeof s.command === "string" && /\bclaude\b/.test(s.command),
    );
    expect(hasClaude).toBe(true);
  });

  it("preserves agent_resume_approvals (cmux 0.64.10 feature)", () => {
    const config = parseConfig();
    expect(Array.isArray(config.agent_resume_approvals)).toBe(true);
    const approvals = config.agent_resume_approvals as unknown[] | undefined;
    expect((approvals ?? []).length).toBeGreaterThan(0);
  });

  doctorIt("passes `cmux config doctor --path` when cmux is installed (R9.9)", () => {
    const result = execFileSync("cmux", ["config", "doctor", "--path", configPath], {
      encoding: "utf-8",
      timeout: 5000,
    });
    // doctor prints "JSONC syntax is valid" on success; a syntax error would
    // print a diagnostic and exit non-zero (caught by execFileSync throwing).
    expect(result).toContain("valid");
  });
});
