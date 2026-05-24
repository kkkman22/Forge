import type { RendererFn, RendererRegistry } from "../types.js";

export function createRendererRegistry(): RendererRegistry {
  const map = new Map<string, RendererFn>();

  return {
    register(name: string, fn: RendererFn): void {
      map.set(name, fn);
    },

    resolve(name: string): RendererFn | undefined {
      return map.get(name);
    },

    list(): readonly string[] {
      return [...map.keys()];
    },
  };
}
