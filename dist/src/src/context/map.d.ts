/**
 * Context Map loader.
 *
 * Loads _map.yaml files from each layer (Custom + enabled packs) and merges
 * edges. For conflicting edges (same source+target), the higher-priority
 * layer wins: Custom > earlier pack > later pack.
 */
import type { ContextMapEntry, EnabledPacks, FileSystem } from "../pack/types.js";
/**
 * Load and merge context map edges from all layers.
 *
 * Priority: Custom > first enabled pack > later packs.
 * For conflicting edges (same source+target pair), the higher-priority
 * layer's definition wins.
 */
export declare function loadContextMap(enabledPacks: EnabledPacks, fs: FileSystem): Promise<ContextMapEntry[]>;
