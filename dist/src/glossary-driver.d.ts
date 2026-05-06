/**
 * Glossary Driver — IO-bearing layer for the Forge glossary.
 *
 * The pure parser/renderer live in `./glossary.ts`. This module adds the
 * thin driver that touches the file system: on first use it lazily creates
 * `.forge/glossary.md` seeded with the 12 core Forge terms; on subsequent
 * calls it parses and returns the existing file.
 *
 * Filesystem access is expressed through the small `GlossaryFs` interface
 * so callers can inject a real `node:fs` adapter in production and an
 * in-memory Map in tests. The driver never reaches out to `node:fs`
 * directly.
 *
 * **Validates: Requirements 1.3, 1.10**
 */
import { type Glossary, type GlossaryTerm } from "./glossary.js";
/**
 * Minimal filesystem contract required by the glossary driver.
 *
 *   - `exists(path)`   — whether a file exists at `path`
 *   - `readFile(path)` — read the file's text contents; only called when
 *                        `exists(path)` is `true`
 *   - `writeFile(path, content)` — write `content` to `path`; the adapter
 *                        is responsible for creating any missing parent
 *                        directories (see `mkdirp` note below)
 *
 * Adapters backed by `node:fs` should call `mkdirSync(dirname(path), {
 * recursive: true })` inside `writeFile` to satisfy the "create parent
 * dirs" contract. The in-memory test adapter can treat this as a no-op.
 */
export interface GlossaryFs {
    exists(path: string): boolean;
    readFile(path: string): string;
    writeFile(path: string, content: string): void;
}
/** Default path (relative to repo root) for the glossary file. */
export declare const DEFAULT_GLOSSARY_PATH = ".forge/glossary.md";
/**
 * Initial seed of 12 core Forge terms used when lazily creating the
 * glossary. Definitions are concise (≤ 2 lines each) and drawn from the
 * Forge documentation (CLAUDE.md / README / spec terminology).
 *
 * Ordering is deliberate — foundational concepts first, then workflow
 * zones, then operational disciplines.
 *
 * The `last_updated` field is filled in by {@link ensureGlossaryExists}
 * at write time so tests can pin it via the `now` parameter.
 */
export declare const INITIAL_GLOSSARY_TERMS: readonly Omit<GlossaryTerm, "last_updated">[];
/**
 * Options for {@link ensureGlossaryExists}.
 *
 *   - `path` — override the default glossary file path. Defaults to
 *     `.forge/glossary.md` (relative to repo root). Callers may pass an
 *     absolute path.
 *   - `now`  — timestamp to stamp into the seed's `last_updated` field and
 *     the frontmatter `updated` field. Defaults to `new Date()`. Injected
 *     for deterministic tests.
 */
export interface EnsureGlossaryOptions {
    path?: string;
    now?: Date;
}
/**
 * Ensure `.forge/glossary.md` exists and return its parsed `Glossary`.
 *
 * Behaviour:
 *   - When the file does not exist, seed it with the 12 preset terms in
 *     {@link INITIAL_GLOSSARY_TERMS}, write to disk, and return the seeded
 *     glossary.
 *   - When the file exists, parse its contents and return the result. The
 *     existing file is never overwritten.
 *
 * The timestamp written into `updated` and each term's `last_updated`
 * uses the ISO date form (`YYYY-MM-DD`) derived from `options.now`.
 */
export declare function ensureGlossaryExists(fs: GlossaryFs, options?: EnsureGlossaryOptions): Glossary;
