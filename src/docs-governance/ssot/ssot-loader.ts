import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfigWithDefaults } from "../config.js";
import { createRendererRegistry } from "./renderer-registry.js";
import type { RendererFn } from "../types.js";

export function loadSsotData(rootDir: string): Map<string, string> {
  const configPath = resolve(rootDir, ".forge/config.md");
  let raw = "";
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    return new Map();
  }

  const config = loadConfigWithDefaults(raw);
  const ssotData = new Map<string, string>();

  for (const entry of config.docs.ssot_sources) {
    const sourcePath = resolve(rootDir, entry.source);
    try {
      if (existsSync(sourcePath)) {
        ssotData.set(entry.topic, readFileSync(sourcePath, "utf-8"));
      }
    } catch {
      // Source file missing — renderer will handle null source
    }
  }

  return ssotData;
}

export function buildDefaultRegistry(renderers: [string, RendererFn][]): ReturnType<typeof createRendererRegistry> {
  const reg = createRendererRegistry();
  for (const [name, fn] of renderers) {
    reg.register(name, fn);
  }
  return reg;
}
