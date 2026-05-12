[← 返回索引](./INDEX.md)

# 工作流示例：Bug 修复（轻量路径）

**项目类型**：Web API（Node.js/Express）
**任务描述**：修复用户登录超时 bug — 登录接口在慢网络下无响应
**涉及文件**：`src/auth/login.ts`

---

## 背景

用户报告：在慢网络环境下，登录接口超过 30 秒无响应，最终超时。本地测试复现：设置网络限速后，`/api/login` 请求挂起。

---

## 完整流程

### 阶段 1：build

**用户输入**：

```bash
/forge 修复登录接口在慢网络下超时的问题
```

**Forge 行为**：
- 分析任务复杂度：影响 1 个文件，改动约 15 行 → **轻量路径**
- 自动执行 `build → review`

**build 阶段输出摘要**：

```
🔍 探针：确认 login.ts 存在且含 setTimeout 调用 ✅
→ 修改 src/auth/login.ts：添加请求超时处理（5 秒）
→ 添加错误返回：408 Request Timeout
→ 运行相关测试：auth.test.ts ✅
```

**目的**：定位超时原因（缺少请求超时控制），添加 5 秒超时限制，确保慢网络下优雅失败。

**做了什么**：在登录处理函数中添加 `req.setTimeout(5000)` 和超时事件监听器。

**为什么这样做**：默认 Node.js HTTP 请求无超时，慢网络下连接会无限挂起。显式设置超时边界是防御性编程。

---

### 阶段 2：review

**Forge 自动执行**（build 成功后自动进入）

**review 阶段输出摘要**：

```
Layer 1 (spec-check)：实现与任务描述对齐 ✅
Layer 2 (quality-check)：命名清晰，错误处理完整 ✅
Layer 3 (security-check)：无注入风险，超时值合理 ✅

结论：无 P0/P1，通过
```

**目的**：三层独立评审确认修复正确、代码质量合格、无安全隐患。

**自动推进**：review 通过 → 完成（轻量路径无 test/ship 阶段）

---

## 失败恢复场景

### 场景：review 发现 P1 问题

**假设**：Layer 3 发现超时值 5 秒过短，正常网络下也可能触发。

**系统提示**：

```
🚫 review 未通过
P1 (security-check): 超时值 5 秒可能影响正常用户
建议：调整为 30 秒，并区分连接超时与处理超时

修复后运行：/forge review
```

**用户修复操作**：

```bash
# Forge 自动修复或用户手动调整
# 修改 src/auth/login.ts：将 5000ms 改为 30000ms
# 添加注释说明超时策略

/forge review
```

**重新执行 review**：

```
Layer 1-3：全部通过 ✅
结论：无 P0/P1，通过
```

---

## 自动推进 vs 用户介入

| 阶段 | 结果 | 行为 |
|------|------|------|
| build | 成功 | **自动进入 review** |
| review | 通过 | **完成，提示提交信息** |
| review | 未通过 | **停止，提示修复后重跑 review** |

---

## 最终状态

- `src/auth/login.ts`：添加 30 秒请求超时
- 提交：`fix(auth): add request timeout to login endpoint`
- review 报告：`.forge/reviews/login-timeout.md`
