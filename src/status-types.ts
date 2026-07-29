/**
 * Shared types for the status subsystem.
 *
 * Extracted from `status-manager.ts` to break the circular dependency between
 * `status-manager.ts` (high-level operations) and `status-atomic.ts` (the
 * locked atomic-write primitive). `status-atomic.ts` needed `StatusManagerIO`
 * as a parameter type; pulling it into this dependency-free leaf lets the
 * atomic writer depend only on the type, with the value edge flowing one way
 * (status-manager → status-atomic).
 *
 * Repo precedent: `router-types.ts`, `session-types.ts`, `grill/types.ts`.
 */

import type { AppendOptions } from "./tool-health-writer.js";

/** @public */
export interface ManagedTaskEntry {
  taskId: string;
  taskName: string;
  phase: string;
  tier?: string;
  updated?: string;
  filePath: string;
}

/** @public */
export interface StatusManagerIO {
  exists: (path: string) => boolean;
  dirExists: (path: string) => boolean;
  read: (path: string) => string;
  write: (path: string, content: string) => void;
  listDir: (path: string) => string[];
  move: (src: string, dest: string) => void;
  mkdirp: (path: string) => void;
  /**
   * Optional lock acquisition seam. Production IO binds this to the real
   * `acquireLockSync` (O_CREAT|O_EXCL). Tests with an in-memory IO may omit it
   * (writeStatusAtomic falls back to the real primitive) or inject a no-op to
   * keep the test off the real filesystem.
   */
  acquireLock?: (lockPath: string, opts: AppendOptions) => void;
  /** Optional lock release seam, paired with {@link acquireLock}. */
  releaseLock?: (lockPath: string) => void;
}
