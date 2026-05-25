import type { DiagnosticRecord, Doc, DocPair } from "./types.js";
/**
 * Pairs .md/.en.md documents by slug in the same directory.
 */
export declare function pairBilingual(docs: readonly Doc[]): DocPair[];
/**
 * Validates paired bilingual documents and returns diagnostics.
 */
export declare function checkBilingualPairs(pairs: readonly DocPair[]): DiagnosticRecord[];
