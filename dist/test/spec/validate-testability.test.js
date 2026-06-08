import { beforeAll, describe, expect, it } from "vitest";
describe("validateTestability enhanced checks", () => {
    let validateTestability;
    beforeAll(async () => {
        const mod = await import("../../src/spec.js");
        validateTestability = mod.validateTestability;
    });
    // 合格场景 — 通过
    it("accepts requirement with verifiable assertion", () => {
        const reqs = [
            {
                title: "REQ-01",
                description: "测试场景",
                scenarios: ["当用户提交表单 则系统返回 200 状态码"],
            },
        ];
        expect(validateTestability(reqs)).toBe(true);
    });
    it("accepts scenario with measurable outcome", () => {
        const reqs = [
            {
                title: "REQ-01",
                description: "测试场景",
                scenarios: ["当覆盖率低于阈值 则 build 失败并退出码为 1"],
            },
        ];
        expect(validateTestability(reqs)).toBe(true);
    });
    // 不合格场景 — 拒绝
    it("rejects scenario with trigger but no verifiable result", () => {
        const reqs = [
            {
                title: "REQ-01",
                description: "测试场景",
                scenarios: ["当用户提交表单 则系统处理请求"],
            },
        ];
        expect(validateTestability(reqs)).toBe(false);
    });
    it("rejects scenario with vague result description", () => {
        const reqs = [
            {
                title: "REQ-01",
                description: "测试场景",
                scenarios: ["当请求超时 则系统正常工作"],
            },
        ];
        expect(validateTestability(reqs)).toBe(false);
    });
    // 向后兼容 — 非 当...则... 格式仍通过
    it("passes non-当则 format for backward compatibility", () => {
        const reqs = [
            {
                title: "REQ-01",
                description: "test",
                scenarios: ["Given a valid token When calling the API Then return 200"],
            },
        ];
        expect(validateTestability(reqs)).toBe(true);
    });
    // 基础校验
    it("rejects empty requirements array", () => {
        expect(validateTestability([])).toBe(false);
    });
    it("rejects requirement with no scenarios", () => {
        const reqs = [{ title: "REQ-01", description: "test", scenarios: [] }];
        expect(validateTestability(reqs)).toBe(false);
    });
});
//# sourceMappingURL=validate-testability.test.js.map