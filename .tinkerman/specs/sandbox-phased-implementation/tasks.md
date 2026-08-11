---
feature: sandbox-phased-implementation
layout: tasks
created: 2026-05-29
spec_ref: ".tinkerman/specs/sandbox-phased-implementation/requirements.md"
---

# 分阶段沙箱实现 — 任务清单

- [ ] 1. 定义 SandboxConfig 类型和检查纯函数（RED）
  - 扩展 `src/sandbox-policy.ts`
  - 定义 `SandboxConfig` 接口（version, profile, filesystem, network, commands）
  - 定义 `SandboxCheckResult` 接口（allowed, reason, matchedRule）
  - 定义纯函数签名：`checkFilesystemPolicy`、`checkCommandPolicy`、`checkNetworkPolicy`
  - 编写失败场景测试（TDD RED）
  - 测试覆盖：deny 优先、glob 匹配、配置缺失降级
  - _Requirements: 1.1, 1.2_

- [x] 2. 实现 checkFilesystemPolicy（GREEN）
  - 实现路径与 glob 模式匹配（使用 micromatch 或 minimatch）
  - deny 列表优先级高于 write/read allow 列表
  - 未匹配任何规则时默认允许
  - 返回 matchedRule 便于调试
  - 确保 task 1 的测试通过
  - _Requirements: 1.2_

- [x] 3. 实现 checkCommandPolicy 和 checkNetworkPolicy（GREEN）
  - 命令检查：前缀匹配 + deny 优先
  - 网络检查：URL 域名匹配 + deny 优先
  - 复用相同的匹配逻辑
  - _Requirements: 1.2_

- [x] 4. 实现配置加载和 Profile 解析
  - `loadSandboxConfig(configPath?)` 从 .tinkerman/sandbox.json 读取
  - 文件不存在时返回默认配置（全部允许）
  - `resolveProfile(config, profileName)` 选择指定 profile
  - JSON 解析错误时输出警告并降级到默认配置
  - 编写配置加载测试（文件存在/不存在/格式错误）
  - _Requirements: 1.3, 1.4_

- [x] 5. 生成 sandbox.json 模板
  - 在 `templates/` 下创建 `sandbox.json`（默认全部允许）
  - 创建 `sandbox.example.jsonc`（带注释说明各字段）
  - _Requirements: 1.3_

- [x] 6. 集成 forge init
  - 更新 forge init SKILL 文档，在生成 .tinkerman/ 时同时生成 sandbox.json
  - 从 templates/sandbox.json 复制到 .tinkerman/sandbox.json
  - _Requirements: 1.3_

- [x] 7. 增强 --sandbox CLI 选项
  - `--sandbox` 无参数 → 使用 .tinkerman/sandbox.json 的 default profile
  - `--sandbox <profile>` → 使用指定 profile
  - `--sandbox=off` → 禁用沙箱检查
  - 无 `--sandbox` 参数时行为不变（不加载配置）
  - Profile 不存在时输出错误并退出
  - _Requirements: 1.4_

- [ ] 8. SKILL 文档集成 sandbox 检查点（advisory 模式）
  - 更新 forge-build SKILL：文件写入步骤前调用 `checkFilesystemPolicy`
  - 更新 forge-review SKILL：文件读取步骤前调用（可选）
  - 更新 forge-ship SKILL：命令执行前调用 `checkCommandPolicy`
  - 至少 3 个步骤集成检查点
  - 输出格式：`⚠️ 沙箱策略建议阻止此操作：{reason}（Phase 1 advisory，不阻断）`
  - _Requirements: 1.2_

- [x] 9. 编写集成测试
  - 测试完整流程：加载配置 → 检查策略 → 返回结果
  - 测试配置缺失时的降级行为
  - 测试 Profile 解析
  - 测试 deny 优先级
  - _Requirements: 验收标准_
