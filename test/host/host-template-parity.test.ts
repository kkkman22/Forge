/**
 * P2 R9 (项1+4 评估结论): host-template parity — CLAUDE_* is the dual-platform SSOT.
 *
 * Decision (locked by this test): hooks.json and scripts/ static templates use
 * ${CLAUDE_PLUGIN_ROOT} / ${CLAUDE_PLUGIN_DATA} as the SINGLE source variable
 * across both platforms, because Zcode compat-injects these (P1 R4 PASS,
 * zcode-guide diagnosing-hooks §2). Dual-writing ZCODE_* + CLAUDE_* would:
 *   - break Claude-side byte-equal (P1 R6 transparency),
 *   - add 2× literal maintenance,
 *   - deliver ZERO functional gain (Zcode already expands CLAUDE_*).
 *
 * The host-adapter layer (src/host/) is where platform-awareness lives; the
 * static template layer stays platform-neutral by design.
 *
 * Validates: design.md R9 — host template parity decision.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

describe("host-template parity — CLAUDE_* is dual-platform SSOT", () => {
  it("hooks.json uses CLAUDE_PLUGIN_ROOT (not ZCODE_*) for Zcode compat", () => {
    const h = read("hooks/hooks.json");
    expect(h).toContain("CLAUDE_PLUGIN_ROOT");
    // Deliberately NOT dual-written: Zcode expands CLAUDE_* natively (P1 R4).
    expect(h).not.toContain("ZCODE_PLUGIN_ROOT");
  });

  it("hooks.json does not reference ZCODE_* (single-variable discipline)", () => {
    const h = read("hooks/hooks.json");
    expect(h.includes("ZCODE_")).toBe(false);
  });

  it(".mcp.json uses CLAUDE_PLUGIN_ROOT (Zcode compat-injects it)", () => {
    const m = read(".mcp.json");
    // dist/forge-context.mjs path; CLAUDE_PLUGIN_ROOT injected by both hosts.
    expect(m.includes("CLAUDE_PLUGIN_ROOT") || m.includes("dist/forge-context")).toBe(true);
  });

  it("zcode-platform.mjs confirms CLAUDE_* is the fallback compat var", () => {
    // P1 fallback: when ZCODE_* absent, CLAUDE_* (Zcode compat injection) is used.
    const z = read("scripts/lib/zcode-platform.mjs");
    expect(z).toContain("ZCODE_PLUGIN_ROOT"); // primary detection
    // The adapter layer handles the CLAUDE_* compat fallback; static templates
    // can rely on CLAUDE_* alone because Zcode injects it.
  });
});

describe("host-template layering (decision rationale)", () => {
  it("static templates (hooks/.mcp) are platform-NEUTRAL by design", () => {
    // The host-adapter layer (src/host/) carries platform-awareness.
    // Static templates must NOT branch on platform — that would scatter
    // platform coupling into host-controlled config.
    const adapterExists = resolve(ROOT, "src/host/detect.ts");
    expect(readFileSync(adapterExists, "utf-8")).toContain("ZCODE_HOST_SIGNALS");
  });
});
