import { z } from "zod";
import type { Category, Audience } from "../types.js";

// ─────────────────────────────────────────────────────────────
// Category & Audience enums
// ─────────────────────────────────────────────────────────────
export const CATEGORY_VALUES: readonly Category[] = [
  "getting-started",
  "daily-use",
  "advanced",
  "troubleshooting",
  "contributing",
  "reference",
  "audits",
] as const;

export const AUDIENCE_VALUES: readonly Audience[] = [
  "new-user",
  "daily-developer",
  "advanced-user",
  "contributor",
  "maintainer",
  "auditor",
] as const;

/** Display order for categories (used by reporter / index generator). */
export const CATEGORY_ORDER: readonly Category[] = [
  "getting-started",
  "daily-use",
  "advanced",
  "troubleshooting",
  "contributing",
  "reference",
  "audits",
] as const;

const categoryEnum = z.enum(CATEGORY_VALUES as unknown as [string, ...string[]]);
const audienceEnum = z.enum(AUDIENCE_VALUES as unknown as [string, ...string[]]);

// ─────────────────────────────────────────────────────────────
// Date helper
// ─────────────────────────────────────────────────────────────
const PROJECT_START = "2026-04-28";

function todayUTC(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

// ─────────────────────────────────────────────────────────────
// mirror_of relative-path check
// ─────────────────────────────────────────────────────────────
function isRelativePath(value: string): boolean {
  if (value.startsWith("/")) return false;
  const segments = value.split("/");
  return !segments.some((s) => s === "..");
}

// ─────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────
export const frontmatterSchema = z
  .object({
    title: z.string().min(1).max(200),
    category: categoryEnum,
    audience: z
      .array(audienceEnum)
      .min(1)
      .max(6)
      .transform((v) => [...new Set(v)] as Audience[]),
    updated: z
      .string()
      .regex(datePattern, "Must be YYYY-MM-DD")
      .refine((v) => v >= PROJECT_START, `Must be >= ${PROJECT_START}`)
      .refine((v) => v <= todayUTC(), "Must not be a future date"),
    owner: z.string().min(1).max(100),
    mirror_of: z
      .string()
      .min(1)
      .max(500)
      .refine(isRelativePath, "Must be a relative path (no leading /, no .. segments)")
      .optional(),
  })
  .strict();
