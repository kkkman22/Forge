import type { Category, DocPair } from "../types.js";
export declare const CATEGORY_ORDER: readonly Category[];
export declare function formatEntry(pair: DocPair): string;
export declare function formatCategoryGroup(category: Category, pairs: DocPair[]): string;
export declare function generateIndexFooter(): string;
