import type { Finding, PostContext, PostResult, ResolvedConfig } from "./types.js";
export interface BitbucketClient {
    list_pr_tasks(params: {
        pull_request_id: string;
    }): Promise<any[]>;
    get_pull_request(params: {
        pull_request_id: string;
    }): Promise<any>;
    get_pull_request_diff(params: {
        pull_request_id: string;
    }): Promise<string>;
    create_pr_task(params: {
        pull_request_id: string;
        text: string;
        anchor?: string;
    }): Promise<{
        id: string;
    }>;
    set_pr_task_status(params: {
        task_id: string;
        done: boolean;
    }): Promise<void>;
    add_comment(params: {
        pull_request_id: string;
        file_path: string;
        line_number: number;
        line_type: string;
        comment_text: string;
        suggestion?: string;
        suggestion_end_line?: number;
        parent_comment_id?: string;
    }): Promise<{
        id: string;
    }>;
    set_review_status(params: {
        pull_request_id: string;
        request_changes: boolean;
        comment: string;
    }): Promise<void>;
}
export interface PostOptions {
    baseDir?: string;
    argv?: string[];
}
export declare function postReviewToBitbucket(reviewMarkdownPath: string, pullRequestId: string, config: ResolvedConfig, ctx: PostContext, bitbucket: BitbucketClient, _testFindings?: Finding[], options?: PostOptions): Promise<PostResult>;
