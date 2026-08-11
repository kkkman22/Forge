---
updated: 2026-08-11
---
# Examples

> Extracted from forge-plan SKILL.md Section 10.

## Example 1: Full Format Task (Standard Path)

```markdown
### Task 1：创建导出服务接口和筛选逻辑（4 min）

**文件**：`src/services/export.ts`、`src/services/export.test.ts`

**RED** — 写失败的测试
```typescript
describe('ExportService', () => {
  it('should filter orders by date range', async () => {
    const service = new ExportService();
    const result = await service.filterOrders({
      startDate: '2025-01-01', endDate: '2025-01-07',
    });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
```

**GREEN** — 写最少代码让测试通过
```typescript
export interface OrderFilter {
  startDate: string; endDate: string; status?: string;
  minAmount?: number; maxAmount?: number;
}
export class ExportService {
  async filterOrders(filter: OrderFilter): Promise<Order[]> {
    return [];
  }
}
```

**REFACTOR** — 重构
- 添加 filter 参数验证（startDate 不晚于 endDate）
- 运行全部测试确认无回归

**验证命令**：`npx vitest run --grep "ExportService"`
**提交信息**：`feat(export): add export service with order filtering`
```

## Example 2: Self-Check Found Issue

```
📋 计划自检
✅ Spec 覆盖率：所有 5 个场景均已覆盖
❌ 占位符扫描：Task 4 第 15 行 `// TODO: implement notification sending` → 替换为具体代码
✅ 类型一致性：所有引用均有定义
正在修正...
```

修正后重新自检至全部通过。
