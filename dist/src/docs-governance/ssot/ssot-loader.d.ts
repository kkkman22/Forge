import type { RendererFn } from "../types.js";
import { createRendererRegistry } from "./renderer-registry.js";
export declare function loadSsotData(rootDir: string): Map<string, unknown>;
export declare function buildDefaultRegistry(renderers: [string, RendererFn][]): ReturnType<typeof createRendererRegistry>;
