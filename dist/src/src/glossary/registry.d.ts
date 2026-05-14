/**
 * Per-context glossary registry loader.
 *
 * Reads glossary markdown files from enabled packs and the custom layer,
 * builds a `GlossaryRegistry` keyed by `context::term` and by term name.
 * Supports backward compatibility with the legacy single-file `.forge/glossary.md`.
 *
 * **Validates: R1 Glossary loading, R2 Backward compat, R3 Custom override**
 */
import type { EnabledPacks, FileSystem, GlossaryRegistry } from "../pack/types.js";
/**
 * Load glossary entries from enabled packs and the custom layer.
 *
 * Pack glossary files live at `<pack.rootPath>/<pack.extends.glossary>/*.md`.
 * Custom glossary files live at `<customLayerRoot>/glossary/*.md`.
 *
 * Backward compat: when `enabledPacks.order` is empty AND
 * `customLayerRoot/glossary/` doesn't exist, falls back to reading
 * `.forge/glossary.md` as the `_shared` context.
 */
export declare function loadGlossary(enabledPacks: EnabledPacks, fs: FileSystem): Promise<GlossaryRegistry>;
