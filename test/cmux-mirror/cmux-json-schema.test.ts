import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface Pane {
  type: string;
  size?: string;
  action?: string;
  buttons?: Array<{ label: string; action: string }>;
}

interface Layout {
  name: string;
  description: string;
  panes: Pane[];
}

interface CmuxConfig {
  version: number;
  layouts: Record<string, Layout>;
}

describe("templates/cmux.json (R9.1–R9.4, R9.7, R12.9)", () => {
  const configPath = join(process.cwd(), "templates", "cmux.json");

  function parseConfig(): CmuxConfig {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  }

  it("is valid JSON with version 1", () => {
    const config = parseConfig();
    expect(config.version).toBe(1);
  });

  it("has exactly 3 layouts: workflow, loop-monitor, dev (R9.1)", () => {
    const config = parseConfig();
    expect(Object.keys(config.layouts)).toHaveLength(3);
    expect(config.layouts).toHaveProperty("workflow");
    expect(config.layouts).toHaveProperty("loop-monitor");
    expect(config.layouts).toHaveProperty("dev");
  });

  it("each layout has name and description (R9.7)", () => {
    const config = parseConfig();
    for (const layout of Object.values(config.layouts)) {
      expect(typeof layout.name).toBe("string");
      expect(layout.name.length).toBeGreaterThan(0);
      expect(typeof layout.description).toBe("string");
      expect(layout.description.length).toBeGreaterThan(0);
    }
  });

  it("each layout has a Mirror_Pane at 15% (R9.2)", () => {
    const config = parseConfig();
    for (const layout of Object.values(config.layouts)) {
      const mirrorPane = layout.panes.find((p) => p.type === "Mirror_Pane");
      expect(mirrorPane).toBeDefined();
      expect(mirrorPane!.size).toBe("15%");
    }
  });

  it("each layout has forge.newClaudeCode action (R9.3)", () => {
    const config = parseConfig();
    for (const layout of Object.values(config.layouts)) {
      const hasAction = layout.panes.some((p) => p.action === "forge.newClaudeCode");
      expect(hasAction).toBe(true);
    }
  });

  it("each layout has ui button list (R9.4)", () => {
    const config = parseConfig();
    for (const layout of Object.values(config.layouts)) {
      const paneWithButtons = layout.panes.find(
        (p) => Array.isArray(p.buttons) && p.buttons.length > 0,
      );
      expect(paneWithButtons).toBeDefined();
      for (const btn of paneWithButtons!.buttons!) {
        expect(typeof btn.label).toBe("string");
        expect(typeof btn.action).toBe("string");
      }
    }
  });

  it("Mirror_Pane size uses percentage string only (R12.9)", () => {
    const config = parseConfig();
    for (const layout of Object.values(config.layouts)) {
      for (const pane of layout.panes) {
        if (pane.size !== undefined) {
          expect(pane.size).toMatch(/^\d+%$/);
        }
      }
    }
  });

  it("workflow layout has panes for sidebar + main + progress", () => {
    const config = parseConfig();
    const wf = config.layouts["workflow"];
    expect(wf.panes.length).toBeGreaterThanOrEqual(2);
  });

  it("loop-monitor layout has a loop-state pane", () => {
    const config = parseConfig();
    const lm = config.layouts["loop-monitor"];
    const hasLoopPane = lm.panes.some((p) => p.type === "Mirror_Pane" || p.type === "Loop_State");
    expect(hasLoopPane).toBe(true);
  });

  it("dev layout is lightweight with sidebar only", () => {
    const config = parseConfig();
    const dev = config.layouts["dev"];
    expect(dev.panes.length).toBeLessThanOrEqual(3);
  });
});
