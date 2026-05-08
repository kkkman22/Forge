import { describe, expect, it } from "vitest";
import en from "../../locales/en.json";
import zh from "../../locales/zh.json";

function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v as Record<string, unknown>, full));
    } else {
      keys.push(full);
    }
  }
  return keys.sort();
}

describe("i18n parity (R11.4)", () => {
  it("zh.json and en.json have identical key sets", () => {
    const zhKeys = collectKeys(zh as unknown as Record<string, unknown>);
    const enKeys = collectKeys(en as unknown as Record<string, unknown>);
    expect(zhKeys).toEqual(enKeys);
  });
});
