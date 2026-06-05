/**
 * Context Map loader.
 *
 * Loads _map.yaml files from each layer (Custom + enabled packs) and merges
 * edges. For conflicting edges (same source+target), the higher-priority
 * layer wins: Custom > earlier pack > later pack.
 */

import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { ContextMapEntry, ContextMapType, EnabledPacks, FileSystem } from "../pack/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawMapEdge {
  source: string;
  target: string;
  type: string;
}

interface RawMapFile {
  edges?: RawMapEdge[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a dedup key from source+target. */
function edgeKey(source: string, target: string): string {
  return `${source}::${target}`;
}

/** Read and parse a single _map.yaml file. */
async function readMapFile(
  dirPath: string,
  layer: string,
  fs: FileSystem,
): Promise<ContextMapEntry[]> {
  const mapPath = path.join(dirPath, "_map.yaml");
  const exists = await fs.exists(mapPath);
  if (!exists) return [];

  try {
    const content = await fs.readFile(mapPath);
    const parsed = parseYaml(content) as RawMapFile | null;
    if (!parsed?.edges) return [];

    return parsed.edges
      .filter((e) => e.source && e.target && e.type)
      .map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type as ContextMapType,
        sourceLayer: layer,
      }));
  } catch (_err: unknown) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and merge context map edges from all layers.
 *
 * Priority: Custom > first enabled pack > later packs.
 * For conflicting edges (same source+target pair), the higher-priority
 * layer's definition wins.
 */
export async function loadContextMap(
  enabledPacks: EnabledPacks,
  fs: FileSystem,
): Promise<ContextMapEntry[]> {
  const merged = new Map<string, ContextMapEntry>();

  // 1. Load pack maps (later packs first so earlier packs overwrite)
  for (let i = enabledPacks.entries.length - 1; i >= 0; i--) {
    const pack = enabledPacks.entries[i];
    const contextsDir = pack.extends.contexts;
    if (!contextsDir) continue;

    const layer = `pack:${pack.name}`;
    const edges = await readMapFile(contextsDir, layer, fs);
    for (const edge of edges) {
      merged.set(edgeKey(edge.source, edge.target), edge);
    }
  }

  // 2. Load custom layer map (highest priority, overwrites all)
  const customDir = path.join(enabledPacks.customLayerRoot, "contexts");
  const customEdges = await readMapFile(customDir, "custom", fs);
  for (const edge of customEdges) {
    merged.set(edgeKey(edge.source, edge.target), edge);
  }

  return Array.from(merged.values());
}
