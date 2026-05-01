# Atomic Task Format

> Extracted from forge-plan SKILL.md Section 3.

每个原子任务必须包含以下所有字段：

| Field | Description | Example |
|------|------|------|
| **Task Number** | `Task N` | `Task 1` |
| **Task Title** | One-sentence description of task goal | Create notification service core interface |
| **File Path** | Full relative path | `src/services/notification.ts` |
| **Estimated Time** | 2-5 minutes | 3 min |
| **TDD Steps** | RED → GREEN → REFACTOR | — |
| **Verify Command** | Command to verify task completion | `npm test -- --grep "notification"` |
| **Commit Message** | Atomic commit message | `feat(notification): add core service interface` |

## TDD Step Format

Each task's TDD steps must include three phases:

### RED (Write Failing Test)

```markdown
**RED** — 写失败的测试

文件：`src/services/notification.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { NotificationService } from './notification';

describe('NotificationService', () => {
  it('should send notification to user', async () => {
    const service = new NotificationService();
    const result = await service.send({
      userId: 'user-1', message: 'Hello', channel: 'email',
    });
    expect(result.success).toBe(true);
    expect(result.notificationId).toBeDefined();
  });
});
```

运行测试，确认失败。预期：NotificationService 不存在
```

### GREEN (Write Minimal Code to Pass)

```markdown
**GREEN** — 写最少代码让测试通过

文件：`src/services/notification.ts`

```typescript
export interface SendNotificationInput {
  userId: string; message: string; channel: 'email' | 'sms' | 'push';
}
export interface SendNotificationResult {
  success: boolean; notificationId: string;
}
export class NotificationService {
  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    return { success: true, notificationId: crypto.randomUUID() };
  }
}
```

运行测试，确认通过。
```

### REFACTOR (Refactor While Keeping Tests Passing)

```markdown
**REFACTOR** — 重构（保持测试通过）

- 提取类型到 `src/types/notification.ts`
- 添加输入验证（userId 非空、message 非空）
- 运行全部测试确认无回归
```
