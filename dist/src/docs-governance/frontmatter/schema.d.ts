import { z } from "zod";
import type { Audience, Category } from "../types.js";
export declare const CATEGORY_VALUES: readonly Category[];
export declare const AUDIENCE_VALUES: readonly Audience[];
/** Display order for categories (used by reporter / index generator). */
export declare const CATEGORY_ORDER: readonly Category[];
export declare const frontmatterSchema: z.ZodObject<{
    title: z.ZodString;
    category: z.ZodEnum<{
        [x: string]: string;
    }>;
    audience: z.ZodPipe<z.ZodArray<z.ZodEnum<{
        [x: string]: string;
    }>>, z.ZodTransform<Audience[], string[]>>;
    updated: z.ZodString;
    owner: z.ZodString;
    mirror_of: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
