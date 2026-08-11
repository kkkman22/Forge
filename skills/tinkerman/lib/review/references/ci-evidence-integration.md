---
updated: 2026-08-11
---
# CI Evidence Integration

> 由 forge-review SKILL.md §1b 引用。开始评审前，检查是否存在 CI ultrareview 产物以避免重复评审同一 PR。

## 检测与读取

```bash
PR_NUMBER=$(git log -1 --format=%s | grep -oE '#[0-9]+' | head -1 | tr -d '#')
CI_REVIEW=".tinkerman/reviews/${PR_NUMBER}-ci.md"
[ -f "$CI_REVIEW" ] && head -100 "$CI_REVIEW"
```

## 存在分支

如果 CI 评审产物存在：

- 读取 frontmatter 的 `severity_counts`
- 读取 `## Findings` 各严重度列表
- 在本次评审的 summary 中首行注明：
  > "CI 评审已覆盖 N 条 finding，本地评审将补充对齐 spec 与 ADR 的深度检查"

## 缺失分支

如果不存在：按原有评审流程进行，不报警告。

## `[confirmed-by-ci]` 前缀规则

当本地发现的 finding 与 CI 产物中的 finding 匹配（`file_path` 与 `category` 相同）时，输出格式为：

```
- **[confirmed-by-ci] src/foo.ts:42** — <本地描述>
```

不匹配的本地 finding 不加前缀。

## CI 产物只读保护

`.tinkerman/reviews/<pr>-ci.md` 不得被本地 `/tinkerman review` 修改。
