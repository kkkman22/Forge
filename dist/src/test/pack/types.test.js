import { describe, expect, it } from "vitest";
describe("pack types", () => {
    it("PackManifest type is importable", () => {
        const manifest = {
            name: "test",
            display_name: "Test",
            description: "A test pack",
            forge_min_version: "2.4.0",
            extends: { contexts: "./contexts" },
        };
        expect(manifest.name).toBe("test");
    });
    it("PackEntry type is importable", () => {
        const entry = {
            name: "test",
            displayName: "Test",
            description: "A test pack",
            forgeMinVersion: "2.4.0",
            dependsOn: [],
            extends: { contexts: "/abs/path" },
            featureFlags: {},
            manifestPath: "/abs/pack.yaml",
            rootPath: "/abs/",
        };
        expect(entry.name).toBe("test");
    });
    it("PackRegistry type is importable", () => {
        const registry = {
            packs: new Map(),
            warnings: [],
        };
        expect(registry.packs.size).toBe(0);
    });
    it("EnabledPacks type is importable", () => {
        const enabled = {
            order: ["pms"],
            entries: [],
            customLayerRoot: "/custom",
        };
        expect(enabled.order).toEqual(["pms"]);
    });
    it("LeakFinding type is importable", () => {
        const finding = {
            category: "code",
            file: "spec.md",
            line: 10,
            original: "UserService",
            matchedTerm: "UserService",
            suggestedRewrite: "改为业务角色描述",
            sourceLayer: "pack:demo-full",
        };
        expect(finding.line).toBe(10);
    });
    it("LintFinding type is importable", () => {
        const finding = {
            ruleId: "SCN001",
            severity: "error",
            file: "spec.md",
            line: 5,
            message: "Line must end with period",
        };
        expect(finding.ruleId).toBe("SCN001");
    });
    it("ContextEntry type is importable", () => {
        const ctx = {
            name: "reservations",
            responsibility: "预订管理",
            aggregates: ["Reservation"],
            inboundEvents: ["CheckInCompleted"],
            outboundEvents: ["ReservationConfirmed"],
            upstream: ["front-desk"],
            downstream: ["billing"],
            sourcePath: "/ctx.md",
            sourceLayer: "pack:demo-full",
            body: "content",
        };
        expect(ctx.name).toBe("reservations");
    });
    it("GlossaryEntry type is importable", () => {
        const entry = {
            term: "Room",
            context: "reservations",
            definition: "房间类型",
            aliases: ["房型"],
            updated: "2026-05-09",
            source: null,
            sourcePath: "/gloss.md",
            sourceLayer: "pack:demo-full",
        };
        expect(entry.term).toBe("Room");
    });
    it("FileSystem type is importable", () => {
        const fs = {
            readdir: async () => [],
            readFile: async () => "",
            writeFile: async () => { },
            exists: async () => false,
            stat: async () => ({ isFile: () => false, isDirectory: () => false }),
        };
        expect(typeof fs.readdir).toBe("function");
    });
    it("union types cover expected values", () => {
        const categories = ["code", "infrastructure", "framework", "technical"];
        expect(categories).toHaveLength(4);
        const mapTypes = [
            "partnership",
            "customer-supplier",
            "conformist",
            "acl",
            "open-host",
            "published-language",
            "shared-kernel",
        ];
        expect(mapTypes).toHaveLength(7);
        const extCategories = [
            "contexts",
            "glossary",
            "scenarios",
            "state_machines",
            "banned_patterns",
            "lint_rules",
            "templates",
            "agents",
            "utils",
        ];
        expect(extCategories).toHaveLength(9);
    });
});
//# sourceMappingURL=types.test.js.map