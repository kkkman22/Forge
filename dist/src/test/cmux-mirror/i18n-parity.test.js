import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import zh from "../../locales/zh.json";
function collectKeys(obj, prefix = "") {
    const keys = [];
    for (const [k, v] of Object.entries(obj)) {
        const full = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) {
            keys.push(...collectKeys(v, full));
        }
        else {
            keys.push(full);
        }
    }
    return keys.sort();
}
describe("i18n parity (R11.4)", () => {
    it("zh.json and en.json have identical key sets", () => {
        const zhKeys = collectKeys(zh);
        const enKeys = collectKeys(en);
        expect(zhKeys).toEqual(enKeys);
    });
});
//# sourceMappingURL=i18n-parity.test.js.map