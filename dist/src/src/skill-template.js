// Skill template validator — checks SKILL.md against required section structure.
export function validateSkillTemplate(filePath, content, requiredSections) {
    const missingSections = [];
    const errors = [];
    for (const section of requiredSections) {
        const re = new RegExp(`^##\\s+\\d+\\.\\s*${section}`, "m");
        if (!re.test(content)) {
            missingSections.push(section);
            errors.push(`缺少 ## ${section} 章节`);
        }
    }
    return {
        filePath,
        styleGuideVersion: "1.0",
        missingSections,
        valid: missingSections.length === 0,
        errors,
    };
}
//# sourceMappingURL=skill-template.js.map