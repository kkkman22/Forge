/**
 * Property 3: 设计视角条件触发
 *
 * Uses fast-check to generate task descriptions and file lists, verifying that
 * the designer role appears in the decide Agent Team member list if and only if
 * the task involves UI changes.
 *
 * **Validates: Requirements 2.5**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type DecideContext, getDecideTeamMembers, involvesUIChanges } from "../src/decide.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MEMBER_NAMES = ["product", "architect", "security"];

// ---------------------------------------------------------------------------
// Generators — UI-positive contexts
// ---------------------------------------------------------------------------

/** Chinese and English UI keywords that signal UI changes in descriptions. */
const UI_KEYWORDS: string[] = [
  "前端",
  "UI",
  "页面",
  "组件",
  "样式",
  "界面",
  "导航栏",
  "表单",
  "布局",
  "按钮",
  "弹窗",
  "模态框",
  "下拉",
  "菜单",
  "侧边栏",
  "frontend",
  "front-end",
  "component",
  "page",
  "style",
  "css",
  "layout",
  "navigation",
  "navbar",
  "sidebar",
  "modal",
  "dialog",
  "button",
  "form",
  "dropdown",
  "menu",
  "responsive",
  "theme",
];

/** Interaction flow patterns that signal UI changes. */
const INTERACTION_PATTERNS: string[] = [
  "注册流程",
  "登录流程",
  "搜索功能",
  "用户交互",
  "交互流程",
  "用户设置",
  "设置页面",
  "购物车",
  "结账流程",
  "上传功能",
  "拖拽",
  "registration flow",
  "login flow",
  "search feature",
  "user interaction",
  "checkout flow",
  "upload feature",
  "drag and drop",
  "onboarding",
  "wizard",
  "user settings",
];

/** File extensions that indicate UI-related files. */
const UI_EXTENSIONS: string[] = [
  ".tsx",
  ".jsx",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
];

/** Non-UI file extensions for generating backend-only file lists. */
const NON_UI_EXTENSIONS: string[] = [
  ".ts",
  ".js",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".sql",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".sh",
  ".dockerfile",
  ".md",
  ".txt",
  ".env",
  ".conf",
];

/** Non-UI description fragments — pure backend / infra / logic topics. */
const NON_UI_FRAGMENTS: string[] = [
  "数据库迁移",
  "添加索引",
  "API 端点",
  "重构服务层",
  "优化查询性能",
  "CI/CD 配置",
  "修复内存泄漏",
  "更新依赖版本",
  "添加日志",
  "权限校验",
  "database migration",
  "add index",
  "API endpoint",
  "refactor service",
  "optimize query",
  "CI/CD pipeline",
  "fix memory leak",
  "update deps",
  "add logging",
  "permission check",
  "batch export",
  "cron job",
];

// --- Arbitraries for UI-positive contexts ---

/** Random filler text that does NOT contain any UI keywords. */
const safeFillerArb: fc.Arbitrary<string> = fc
  .array(
    fc.constantFrom(
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
      "n",
      "o",
      "p",
      "q",
      "r",
      "t",
      "v",
      "w",
      "x",
      "y",
      "z",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      " ",
      "-",
      "_",
    ),
    { minLength: 0, maxLength: 30 },
  )
  .map((chars) => chars.join(""));

/** Generates a description that contains at least one UI keyword. */
const uiKeywordDescriptionArb: fc.Arbitrary<string> = fc
  .tuple(safeFillerArb, fc.constantFrom(...UI_KEYWORDS), safeFillerArb)
  .map(([pre, kw, post]) => `${pre} ${kw} ${post}`.trim());

/** Generates a description that contains at least one interaction flow pattern. */
const interactionFlowDescriptionArb: fc.Arbitrary<string> = fc
  .tuple(safeFillerArb, fc.constantFrom(...INTERACTION_PATTERNS), safeFillerArb)
  .map(([pre, pattern, post]) => `${pre} ${pattern} ${post}`.trim());

/** Generates a file list that contains at least one UI-extension file. */
const uiFileListArb: fc.Arbitrary<string[]> = fc
  .tuple(
    fc.array(
      fc
        .tuple(safeFillerArb, fc.constantFrom(...NON_UI_EXTENSIONS))
        .map(([name, ext]) => `src/${name || "file"}${ext}`),
      { minLength: 0, maxLength: 5 },
    ),
    fc
      .tuple(safeFillerArb, fc.constantFrom(...UI_EXTENSIONS))
      .map(([name, ext]) => `src/${name || "component"}${ext}`),
  )
  .map(([others, uiFile]) => [...others, uiFile]);

/** Generates a non-UI file list (no UI extensions). */
const nonUIFileListArb: fc.Arbitrary<string[]> = fc.array(
  fc
    .tuple(safeFillerArb, fc.constantFrom(...NON_UI_EXTENSIONS))
    .map(([name, ext]) => `src/${name || "file"}${ext}`),
  { minLength: 0, maxLength: 5 },
);

// --- Arbitraries for UI-negative contexts ---

/** Generates a description with NO UI keywords and NO interaction flow patterns. */
const nonUIDescriptionArb: fc.Arbitrary<string> = fc
  .tuple(safeFillerArb, fc.constantFrom(...NON_UI_FRAGMENTS), safeFillerArb)
  .map(([pre, frag, post]) => `${pre} ${frag} ${post}`.trim());

// ---------------------------------------------------------------------------
// Composite context arbitraries
// ---------------------------------------------------------------------------

/**
 * Context that MUST involve UI changes.
 * Uses one of three signal categories (keyword, interaction flow, file extension).
 */
const uiContextArb: fc.Arbitrary<DecideContext> = fc.oneof(
  // Signal 1: description has UI keyword
  fc
    .tuple(uiKeywordDescriptionArb, nonUIFileListArb)
    .map(([desc, files]) => ({ taskDescription: desc, involvedFiles: files })),
  // Signal 2: description has interaction flow pattern
  fc
    .tuple(interactionFlowDescriptionArb, nonUIFileListArb)
    .map(([desc, files]) => ({ taskDescription: desc, involvedFiles: files })),
  // Signal 3: files have UI extensions
  fc
    .tuple(nonUIDescriptionArb, uiFileListArb)
    .map(([desc, files]) => ({ taskDescription: desc, involvedFiles: files })),
);

/**
 * Context that MUST NOT involve UI changes.
 * Description has no UI keywords/patterns AND files have no UI extensions.
 */
const nonUIContextArb: fc.Arbitrary<DecideContext> = fc
  .tuple(nonUIDescriptionArb, nonUIFileListArb)
  .map(([desc, files]) => ({ taskDescription: desc, involvedFiles: files }));

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("Property 3: 设计视角条件触发", () => {
  it("UI signals present → designer MUST be in the team (Req 2.5)", () => {
    fc.assert(
      fc.property(uiContextArb, (context) => {
        // Precondition: context actually involves UI changes
        expect(involvesUIChanges(context)).toBe(true);

        const members = getDecideTeamMembers(context);
        const names = members.map((m) => m.name);

        // Designer must be present
        expect(names).toContain("designer");

        // Designer member should have correct role and agent
        const designer = members.find((m) => m.name === "designer");
        expect(designer).toBeDefined();
        expect(designer?.role).toBe("设计视角");
        expect(designer?.agent).toBe("designer");
      }),
      { numRuns: 200 },
    );
  });

  it("NO UI signals → designer MUST NOT be in the team (Req 2.5)", () => {
    fc.assert(
      fc.property(nonUIContextArb, (context) => {
        // Precondition: context does NOT involve UI changes
        expect(involvesUIChanges(context)).toBe(false);

        const members = getDecideTeamMembers(context);
        const names = members.map((m) => m.name);

        // Designer must NOT be present
        expect(names).not.toContain("designer");
      }),
      { numRuns: 200 },
    );
  });

  it("product, architect, security are ALWAYS in the team regardless of UI signals", () => {
    fc.assert(
      fc.property(fc.oneof(uiContextArb, nonUIContextArb), (context) => {
        const members = getDecideTeamMembers(context);
        const names = members.map((m) => m.name);

        for (const defaultName of DEFAULT_MEMBER_NAMES) {
          expect(names).toContain(defaultName);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("team size is exactly 3 without UI signals and exactly 4 with UI signals", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          uiContextArb.map((ctx) => ({ ctx, expectUI: true })),
          nonUIContextArb.map((ctx) => ({ ctx, expectUI: false })),
        ),
        ({ ctx, expectUI }) => {
          const members = getDecideTeamMembers(ctx);

          if (expectUI) {
            expect(members).toHaveLength(4);
          } else {
            expect(members).toHaveLength(3);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("designer appears if and only if involvesUIChanges returns true (biconditional)", () => {
    fc.assert(
      fc.property(fc.oneof(uiContextArb, nonUIContextArb), (context) => {
        const members = getDecideTeamMembers(context);
        const hasDesigner = members.some((m) => m.name === "designer");
        const isUI = involvesUIChanges(context);

        // Biconditional: designer ↔ UI changes
        expect(hasDesigner).toBe(isUI);
      }),
      { numRuns: 200 },
    );
  });
});
