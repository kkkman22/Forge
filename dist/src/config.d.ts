/** Review-specific configuration parsed from .forge/config.md and env. @public */
export interface ReviewConfig {
    subagent_concurrency: number;
}
/** Parse review concurrency config. Priority: env > config.md > default(3). @public */
export declare function parseReviewConfig(configContent: string | undefined): ReviewConfig;
