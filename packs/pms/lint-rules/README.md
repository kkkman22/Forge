# PMS Pack Lint Rules

YAML 声明式 lint 规则，由 `src/lint/pack-rules.ts` 解析，通过 `scripts/lint-pack-rules.mjs` 按需执行。

## 运行方式

```bash
# 检查所有启用的 Pack lint 规则
node scripts/lint-pack-rules.mjs

# 指定目录
node scripts/lint-pack-rules.mjs --target src/domain/reservations/
```

## 规则清单

| 规则 ID | 分组 | 描述 | target_globs |
|---------|------|------|-------------|
| `money/no-number-for-money` | money | 禁止 number 类型承载金额 | `src/**/*.ts` |
| `money/explicit-currency-exchange` | money | 要求汇率转换显式声明 | `src/**/*.ts` |
| `money/require-money-factory` | money | 要求通过 Money 工厂方法创建实例 | `src/**/*.ts` |
| `time/no-raw-date-in-domain` | time | 禁止在领域层使用裸 Date 构造 | `src/**/*.ts` |
| `time/prefer-business-day-clock` | time | 推荐使用 BusinessDayClock | `src/**/*.ts` |

## 形态说明

规则以 YAML 数据文件存储（不包含可执行 JS），由 `src/lint/pack-rules.ts` 统一解析和执行。

- **零新依赖**：不引入 Biome/ESLint 插件依赖
- **Pack 安全**：Pack 代码是纯数据，无任意 JS 执行
- **Zero-Pack-Zero-Impact**：未启用 Pack 时不加载任何规则

如需 IDE 实时反馈，可另建 spec 将 YAML 规则包装为 Biome 插件。
