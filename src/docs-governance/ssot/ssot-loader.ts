import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getWorkflowRoutingSsot } from "../../workflow-graph.js";
import { loadConfigWithDefaults } from "../config.js";
import type { RendererFn } from "../types.js";
import { createRendererRegistry } from "./renderer-registry.js";

export function loadSsotData(rootDir: string): Map<string, unknown> {
  const configPath = resolve(rootDir, ".forge/config.md");
  let raw = "";
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch (_err: unknown) {
    return new Map();
  }

  const config = loadConfigWithDefaults(raw);
  const ssotData = new Map<string, unknown>();

  for (const entry of config.docs.ssot_sources) {
    if (entry.topic === "routing") {
      ssotData.set(entry.topic, getWorkflowRoutingSsot());
      continue;
    }
    const sourcePath = resolve(rootDir, entry.source);
    try {
      if (existsSync(sourcePath)) {
        const content = readFileSync(sourcePath, "utf-8");
        // Attempt JSON parse for .json files
        if (sourcePath.endsWith(".json")) {
          try {
            ssotData.set(entry.topic, JSON.parse(content));
          } catch (_err: unknown) {
            ssotData.set(entry.topic, content);
          }
        } else {
          ssotData.set(entry.topic, content);
        }
      }
    } catch (_err: unknown) {
      // Source file missing — renderer will handle null source
    }
  }

  return ssotData;
}

export function buildDefaultRegistry(
  renderers: [string, RendererFn][],
): ReturnType<typeof createRendererRegistry> {
  const reg = createRendererRegistry();
  for (const [name, fn] of renderers) {
    reg.register(name, fn);
  }
  return reg;
}
