import type { LivingDocContext, LivingDocData } from "./generator.js";
export declare function escapeHtml(str: string): string;
export declare function renderIndexPage(data: LivingDocData): string;
export declare function renderContextPage(context: LivingDocContext, contextName: string, generatedAt: string): string;
export declare function renderLivingDoc(data: LivingDocData, outputDir: string): void;
