---
updated: 2026-08-11
---
# 四视角输出格式 / Four-Perspective Output Formats

**约束**：每个角色输出限制在 **500 tokens 以内**。安全视角**不可跳过**。各视角独立输出，但可以引用和质疑其他视角的结论。

## 3.0 Glossary alignment check

Round 1 启动前，如用户提案中含新术语，调用 `checkDecideGlossaryConflicts(candidateTerms, glossary)`。如返回非空冲突（含同义词、禁用词、语义矛盾、关系验证 4 种类型），暂停 Round 1 并用 `renderDecideGlossaryConflictPrompt` 输出澄清提示。用户选择保留/替换/新增别名后继续。

## 3.1 Product Perspective (product.md)

以苏格拉底式提问厘清问题本质：问题定义、目标用户、成功标准。

**Behavior rules**: 一次只问一个问题，不给答案只提问，模糊回答则追问具体化。

**Output Format**:

```markdown
### Product Definition

**Problem**: <One-sentence description of the core problem to solve>
**Users**: <Target users and usage scenarios>
**Success Criteria**: - <Measurable criteria>
**Scope Boundaries**: <Explicitly what NOT to do>
```

## 3.2 Architecture Perspective (architect.md)

评估技术方案的合理性和风险：技术选型合理性、架构风险、扩展性、兼容性。

**Output Format**:

```markdown
### Technical Solution

**Tech Selection**: <Technology choice and rationale>
**Risks**: - <Risk>: <Impact> / <Mitigation>
**Scalability**: <Scalability assessment>
**Compatibility**: <Compatibility assessment with existing systems>
```

## 3.3 Security Perspective (security.md)

基于 OWASP Top 10 和 STRIDE 进行威胁建模。**此视角不可跳过**，即使任务看起来与安全无关。结论可以是"无显著安全风险"，但过程不能省略。

**Output Format**:

```markdown
### Security Assessment

**OWASP Check**: - <Relevant item>: <Risk level> — <Description>
**STRIDE Analysis**: - <Relevant threat>: <Description> / <Suggested measures>
**Conclusion**: <Overall security assessment conclusion>
```

## 3.4 Design Perspective (designer.md) — Conditional Trigger

评估 UI/UX 方面的可用性、可访问性和一致性。仅当 `involvesUIChanges()` 返回 true 时动态加入。

判定信号：任务描述提及前端/UI/页面/组件/样式、涉及的文件含 UI 扩展名（`.tsx`/`.jsx`/`.vue`/`.svelte`/`.css`）、任务涉及用户交互流程变更。不触发：纯后端 API、数据库变更、CI/CD、纯逻辑重构。

**Output Format**:

```markdown
### Design Assessment

**Usability**: <Assessment conclusion>
**Accessibility**: <WCAG-related recommendations>
**Consistency**: <Consistency assessment with existing design system>
**Recommendations**: - <Recommendation>
```
