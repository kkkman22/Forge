declare const ALLOW_LIST: ReadonlyArray<string>;
export type ValidatedSub = (typeof ALLOW_LIST)[number];
interface AllowResult {
    ok: true;
    value: ValidatedSub;
}
interface RejectResult {
    ok: false;
    code: "E_UNKNOWN_SUB";
    suggestion?: string;
}
export type TopicValidationResult = AllowResult | RejectResult;
export declare function validateTopic(topic: string): TopicValidationResult;
export { ALLOW_LIST };
