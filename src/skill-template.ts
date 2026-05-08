// Skill template validator — checks SKILL.md against required section structure.

export interface TemplateValidation {
  filePath: string;
  styleGuideVersion: string;
  missingSections: string[];
  valid: boolean;
  errors: string[];
}

export function validateSkillTemplate(
  filePath: string,
  content: string,
  requiredSections: readonly string[],
): TemplateValidation {
  const missingSections: string[] = [];
  const errors: string[] = [];

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
