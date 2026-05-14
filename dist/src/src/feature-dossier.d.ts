export type StageName = "decisions" | "specs" | "plans" | "reviews" | "progress" | "findings" | "debug";
export interface StageFileEntry {
    path: string;
    mtime: string;
    frontmatter: Record<string, unknown>;
    firstSection: string;
    kind?: "dated" | "adr";
    adrId?: string;
}
export interface StageScanResult {
    topic: string;
    forgeRoot: string;
    stages: Record<StageName, StageFileEntry[]>;
}
export interface DossierFrontmatter {
    topic: string;
    generated_at: string;
    auto_generated: true;
    stage_count: number;
    total_files: number;
}
export interface DossierDocument {
    frontmatter: DossierFrontmatter;
    body: string;
}
export interface TopicDiscoveryResult {
    topics: string[];
    drifts: Array<{
        topicA: string;
        topicB: string;
        reason: "trailing-digit" | "plural-form" | "substring" | "separator";
    }>;
    emptySpecDirs: string[];
}
export declare const STAGE_NAMES: StageName[];
export declare function deriveTopicFromPath(relPath: string): string | null;
export declare function matchStageFiles(stage: StageName, topic: string, files: string[]): string[];
export declare function scanStagesForTopic(topic: string, forgeRoot: string): StageScanResult;
export declare function buildDossier(input: {
    topic: string;
    forgeRoot: string;
    stageScan: StageScanResult;
}): DossierDocument;
export declare function discoverTopics(forgeRoot: string): TopicDiscoveryResult;
