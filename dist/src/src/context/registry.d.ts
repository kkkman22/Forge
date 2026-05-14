/**
 * Bounded Context registry loader.
 *
 * Loads context definition files (*.md with YAML frontmatter) from the Custom
 * layer and enabled packs, merging by name with priority: Custom > earlier
 * pack > later pack.
 */
import type { ContextRegistry, EnabledPacks, FileSystem } from "../pack/types.js";
/**
 * Load and merge context definitions from all layers.
 *
 * Priority: Custom layer > first enabled pack > later packs.
 * For same-name contexts, the higher-priority layer wins.
 */
export declare function loadContexts(enabledPacks: EnabledPacks, fs: FileSystem): Promise<ContextRegistry>;
