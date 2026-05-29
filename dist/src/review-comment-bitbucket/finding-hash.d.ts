import type { Finding } from "./types.js";
export declare function computeFindingHash(f: Pick<Finding, "file_path" | "line_number" | "finding_type" | "message">): string;
export declare function buildMarker(prefix: string, hash: string): string;
export declare const MARKER_RE: RegExp;
export declare function extractMarker(text: string, prefix: string): string | null;
