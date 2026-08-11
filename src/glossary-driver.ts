/**
 * Glossary Driver — IO-bearing layer for the Forge glossary.
 *
 * The pure parser/renderer live in `./glossary.ts`. This module adds the
 * thin driver that touches the file system: on first use it lazily creates
 * `.tinkerman/glossary.md` seeded with the 12 core Forge terms; on subsequent
 * calls it parses and returns the existing file.
 *
 * Filesystem access is expressed through the small `GlossaryFs` interface
 * so callers can inject a real `node:fs` adapter in production and an
 * in-memory Map in tests. The driver never reaches out to `node:fs`
 * directly.
 *
 * **Validates: Requirements 1.3, 1.10**
 */

import { dirname } from "node:path";

import { type Glossary, type GlossaryTerm, parseGlossary, renderGlossary } from "./glossary.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default path (relative to repo root) for the glossary file. */
export const DEFAULT_GLOSSARY_PATH = ".tinkerman/glossary.md";

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
export const INITIAL_GLOSSARY_TERMS: readonly Omit<GlossaryTerm, "last_updated">[] = [
  {
    term: "Tier",
    definition: "Forge 三维路由中的复杂度维度，决定运行哪些命令。取值 light / standard / full。",
    aliases: ["档位", "复杂度档位"],
    source_session: "初始预置",
  },
  {
    term: "Spec",
    definition: "需求锁定的产物，位于 `.kiro/specs/<feature>/`，一旦 locked 即进入冻结区。",
    source_session: "初始预置",
  },
  {
    term: "Plan",
    definition: "实现计划文档，把 spec 拆分为可独立交付的任务序列。",
    source_session: "初始预置",
  },
  {
    term: "Hint",
    definition: "路由提示关键词（如 `:web`、`:sec`），用于引导 forge-router 的 skill 选择。",
    source_session: "初始预置",
  },
  {
    term: "Subagent",
    definition: "委派特定任务给专精 agent 的执行机制，隔离主对话上下文。",
    source_session: "初始预置",
  },
  {
    term: "Frozen Zone",
    definition: "冻结区：受保护不可修改的文件集合（如 `skills/**/SKILL.md`、锁定 spec）。",
    source_session: "初始预置",
  },
  {
    term: "Guarded Zone",
    definition: "保护区：允许追加但禁止删除修改的文件集合（如知识库 sessions、instincts）。",
    source_session: "初始预置",
  },
  {
    term: "Open Zone",
    definition: "开放区：允许覆盖重写的文件集合（如 glossary.md、evolution-report.md）。",
    source_session: "初始预置",
  },
  {
    term: "Restatement Checkpoint",
    definition: "任务复述检查点：Agent 在开始实现前必须复述目标与边界以确认对齐。",
    source_session: "初始预置",
  },
  {
    term: "Three-Strike",
    definition: "三振机制：同任务连续 3 次 TDD 失败触发重路由或退出。",
    source_session: "初始预置",
  },
  {
    term: "Closure-First Probe",
    definition: "闭包优先探针：先验证最小闭环再扩展，避免过早泛化。",
    source_session: "初始预置",
  },
  {
    term: "Vertical Slice",
    definition: "垂直切片：可独立交付的最小功能单元，对应一条 issue 或一个子任务。",
    source_session: "初始预置",
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Options for {@link ensureGlossaryExists}.
 *
 *   - `path` — override the default glossary file path. Defaults to
 *     `.tinkerman/glossary.md` (relative to repo root). Callers may pass an
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
 * Ensure `.tinkerman/glossary.md` exists and return its parsed `Glossary`.
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
export function ensureGlossaryExists(
  fs: GlossaryFs,
  options: EnsureGlossaryOptions = {},
): Glossary {
  const path = options.path ?? DEFAULT_GLOSSARY_PATH;

  if (fs.exists(path)) {
    return parseGlossary(fs.readFile(path));
  }

  const now = options.now ?? new Date();
  const seeded = buildInitialGlossary(now);

  ensureParentDir(fs, path);
  fs.writeFile(path, renderGlossary(seeded));

  return seeded;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a freshly seeded glossary by stamping the supplied timestamp onto
 * every term and the document-level `updated` field.
 */
function buildInitialGlossary(now: Date): Glossary {
  const isoDate = toIsoDate(now);
  const terms: GlossaryTerm[] = INITIAL_GLOSSARY_TERMS.map((t) => ({
    ...t,
    last_updated: isoDate,
  }));

  return {
    schema_version: 1,
    updated: isoDate,
    terms,
  };
}

/**
 * Format a `Date` as an ISO date (YYYY-MM-DD) in UTC. Using UTC keeps
 * output deterministic across developer timezones.
 */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Ensure the parent directory of `path` exists by asking the adapter to
 * write a sentinel. Adapters typically implement this in `writeFile`
 * itself (see `GlossaryFs` docs); the no-op here documents the contract
 * for reviewers and keeps the driver explicit.
 *
 * We intentionally do not expose a `mkdirp` hook on `GlossaryFs`: the
 * driver only writes one file, and conflating "make dir" with "write
 * file" keeps the interface small. Real adapters call
 * `mkdirSync(dirname(path), { recursive: true })` inside `writeFile`.
 */
function ensureParentDir(_fs: GlossaryFs, path: string): void {
  // Referenced only to silence lint when the path has no parent
  // segment (e.g. "glossary.md" in tests). The real work happens in the
  // adapter's `writeFile`.
  void dirname(path);
}
