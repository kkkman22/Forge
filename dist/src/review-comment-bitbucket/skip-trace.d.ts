import type { GateSkipReason, PostContext } from "./types.js";
export declare function recordSkip(reviewMarkdownPath: string, reason: GateSkipReason, ctx: PostContext): Promise<void>;
