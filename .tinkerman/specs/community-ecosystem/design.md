---
feature: community-ecosystem
layout: design
created: 2026-04-29
---

# 设计文档：社区与生态建设（v3.0）

## Overview

本设计为 Forge 项目构建社区基础设施和 SKILL 插件生态。分为三个阶段：(1) 完善贡献者指南和 Issue/PR 模板；(2) 设计并实现 SKILL 插件机制，支持第三方开发和安装；(3) 创建示例项目和最佳实践文档。

## Architecture

### SKILL 插件加载架构

```
┌─────────────────────────────────────────────────────────┐
│                    forge-loop CLI                        │
│  --skills-dir <path>                                     │
├─────────────────────────────────────────────────────────┤
│                    SkillLoader                           │
│  1. 扫描内置 skills/ 目录                                │
│  2. 扫描 --skills-dir 指定的额外目录                      │
│  3. 合并 SKILL 列表（内置优先，同名不覆盖）               │
├─────────────────────────────────────────────────────────┤
│                    SkillValidator                        │
│  1. 验证 skill.json 格式                                 │
│  2. 检查 forgeVersion 兼容性                             │
│  3. 验证 SKILL.md frontmatter                            │
├─────────────────────────────────────────────────────────┤
│                    SkillResolver (已有)                   │
│  解析 SKILL.md 路径（含 i18n 回退）                       │
└─────────────────────────────────────────────────────────┘
```

### skill.json 格式

```json
{
  "name": "forge-custom-deploy",
  "version": "1.0.0",
  "description": "Custom deployment skill for AWS Lambda",
  "author": "community-contributor",
  "forgeVersion": ">=2.3.0",
  "phases": ["deploy"],
  "i18n": ["zh", "en"]
}
```

### 目录结构

```
my-custom-skill/
├── skill.json              # 插件元数据
├── SKILL.md                # 默认语言版本
├── SKILL.en.md             # 英文版本（可选）
└── templates/              # 技能模板文件（可选）
```

## Components and Interfaces

### SkillLoader (`src/skill-loader.ts`)

```typescript
interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  forgeVersion: string;
  phases: string[];
  i18n?: string[];
}

interface LoadedSkill {
  manifest: SkillManifest;
  skillDir: string;
  isBuiltin: boolean;
}

/** 扫描目录加载 SKILL 列表（纯函数：接受目录内容，返回结果） */
function loadSkillsFromDir(
  dirEntries: { name: string; isDirectory: boolean }[],
  readManifest: (skillDir: string) => SkillManifest | null,
  isBuiltin: boolean,
): LoadedSkill[];

/** 合并内置和第三方 SKILL 列表（内置优先） */
function mergeSkillLists(
  builtin: LoadedSkill[],
  external: LoadedSkill[],
): LoadedSkill[];
```

### SkillValidator (`src/skill-validator.ts`)

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** 验证 skill.json 格式 */
function validateManifest(manifest: unknown): ValidationResult;

/** 检查 forgeVersion 兼容性 */
function checkVersionCompatibility(
  requiredRange: string,
  currentVersion: string,
): boolean;
```

## Testing Strategy

- 属性测试：SKILL 列表合并的幂等性和优先级正确性
- 单元测试：skill.json 验证、版本兼容性检查、目录扫描
- 集成测试：端到端 SKILL 加载和解析
