# Design Document — cmux-extension-sidebar

> 配套 `requirements.md`。本文锁定架构与数据流；Swift authoring 面标为 Implementation_Gate。

## 1. 背景与定位

`cmux-integration` 已建立 Forge → cmux 的状态投影：Mirror_Daemon（fs.watch `.tinkerman/`）→ 翻译为 `cmux set-status`/`set-progress`/`log`/`notify` CLI 调用。这是"把结构化数据压扁成侧栏 pill + 进度条 + 日志行"的**有损、CLI 驱动**投影。

cmux 0.64.13–0.64.15 引入 **custom sidebar**（运行时 Swift interpreter），允许第三方用原生 SwiftUI 组件绘制侧栏。本特性把 Forge 的呈现层从"CLI pill 投影"升级为"原生 SwiftUI 侧栏"，作为**首选呈现通道**；CLI 投影保留为 fallback。

**核心洞察**：Forge 侧早已具备稳定的、结构化的状态源（`.tinkerman/` + events.ndjson + Mirror_Push_Socket R17）。缺的只是一个"富 UI 渲染前端"。custom sidebar 正好填这个缺口，且不需要 Forge 新增任何状态出口。

## 2. 架构

### 2.1 分层

```
┌─────────────────────────────────────────────────────────┐
│  cmux workspace (in-process / out-of-process interpreter)│
│  ┌───────────────────────────────────────────────────┐  │
│  │  Forge Custom_Sidebar (Swift)                     │  │
│  │   Phase_Region | DAG_Region | Review_Region |     │  │
│  │   Loop_Region   | Attention_Queue                 │  │
│  └───────────────▲───────────────────────────────────┘  │
│                  │ Mirror_Push_Event (NDJSON over socket)│
│                  │ OR file-watch .tinkerman/                 │
└──────────────────┼──────────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────────┐
│  Forge (既有，零改动)                                      │
│  Mirror_Daemon (cmux-integration R2/R7)                  │
│   ├─ fs.watch .tinkerman/{status,progress,reviews,runs}      │
│   ├─ lib/reader.mjs → Canonical_Sidebar_Payload          │
│   ├─ → cmux set-status/... (CLI_Projection_Fallback)     │
│   └─ Mirror_Push_Socket .tinkerman/.cmux-mirror.sock (R17)   │
│  src/sdk-driver.ts → events.ndjson (R14, 既有)            │
└─────────────────────────────────────────────────────────┘
```

- **上层**（cmux sidebar）：新增，纯渲染，只读消费者。
- **下层**（Forge + Mirror_Daemon）：既有，**零改动**（R3.3 约束）。Mirror_Daemon 继续跑 CLI 投影（fallback）+ 暴露 push socket。

### 2.2 数据通道选择（Requirement 3）

两种 Data_Source，按 capabilities 与稳定性优选：

| 模式 | 来源 | sidebar 复杂度 | Forge 改动 | 优选场景 |
|------|------|--------------|-----------|---------|
| **Push_Subscribe** | 订阅 Mirror_Push_Socket (R17) | 最薄（仅渲染） | 零 | **首选** — 复用 TS 解析 |
| **File_Watch** | 直接 watch `.tinkerman/` | 中（重实现解析或调 .mjs） | 零 | push socket 不可用时 |

**决策**：Push_Subscribe 为首选。Mirror_Push_Socket 已在 `cmux-integration` R17 定义并接受 `phase_changed`/`layer_completed`/`resync_now` 事件类型——sidebar 订阅这些已结构化事件即可渲染，无需在 Swift 中重做 .tinkerman/ 解析。这最大化复用、最小化漂移风险。

**未决（Implementation_Gate）**：cmux sidebar interpreter 是否能在 Swift 中连接 Unix socket 并消费 NDJSON。若 Beta interpreter 不支持 socket I/O，则降级 File_Watch；若两者都不支持，sidebar 暂不启用，回退 CLI 投影。这个判定必须在实现前用 0.64.15 实测确认，不能靠文档推断。

### 2.3 降级链（Zero-Impact）

```
Sidebar_Capability_Probe (cmux capabilities --json, 2s, sticky)
  ├─ false (cmux 缺席 / <0.64.13 / Beta 关) → CLI_Projection_Fallback (既有 R2)  [零 sidebar 代码运行]
  ├─ true 但运行时 Swift 异常 → 进程外隔离保护 cmux；回退 CLI 投影；sidebar log 记一次错
  └─ true 且稳定 → sidebar 渲染；Mirror_Daemon 仍并发跑 CLI 投影（双写无害，sidebar 只读）
```

降级链保证：sidebar 永远不是 Forge 可见性的单点。最坏情况退化为既有 CLI 投影，行为与 `cmux-integration` 完全一致。

## 3. API-Deferral 理由（核心设计决策）

**为何不直接锁 Swift sidebar 语法**：

1. **Beta + 无独立文档**：custom sidebar 的 SwiftUI primitive 集、数据绑定、生命周期钩子在 0.64.13–0.64.15 持续演进（0.64.13 "runtime Swift interpreter"，0.64.14 "broader SwiftUI primitives"，0.64.15 "in-process by default"）。changelog 是唯一来源，无 stable API 文档。锁语法 = 必然漂移。
2. **前车之鉴**：`templates/cmux.json` 正是锁了未经验证的 schema（`layouts`/`Mirror_Pane`）导致长期不渲染，且被自我闭环的测试掩盖（任务 #1 已修复）。同一错误模式不能在 sidebar 重演。
3. **稳定面 vs 不稳定面**：Forge 这边，`.tinkerman/` 状态 + events.ndjson schema + Mirror_Push_Socket 协议**都是稳定的**（`cmux-integration` 已锁定并有属性测试）。cmux 那边，sidebar authoring API **不稳定**。正确策略：锁稳定面、延后不稳定面。

**Implementation_Gate 的具体内容**（实现前必须用 0.64.15 实测确认，非文档推断）：

- (G1) sidebar interpreter 能否连接 Unix socket / 读本地文件？（决定 Push_Subscribe vs File_Watch）
- (G2) 可用 SwiftUI primitive 集？（决定 Render_Model → primitive 映射）
- (G3) sidebar 发现/安装路径与清单格式？（决定 install-template 扩展）
- (G4) CLI 校验命令的确切签名？（类比 `cmux config doctor --path`，需 probe）

G1–G4 任一不满足 → 该子能力不启用、降级，但 spec 的其余部分（Render_Model、降级链、属性测试）不受影响。

## 4. Render_Model → 实现映射（示意，非契约）

```
Forge_State_Snapshot          Render_Model region         SwiftUI primitive (G2, 未锁)
─────────────────────         ───────────────────         ─────────────────────────
phase + tier + topic    →     Phase_Region                Label(icon, text) + 色标
dag waves + ratio       →     DAG_Region                  ProgressView + List(task states)
layers_status + counts  →     Review_Region               HStack of colored Labels (chips)
events.ndjson iters     →     Loop_Region                 TimelineView / List
frozen/P0/P1/breaker    →     Attention_Queue             Section(pinned) of tappable rows
```

字段→区域映射是**契约**（requirements R2.1 锁定）；primitive 选择是**示意**（G2 实现）。

## 5. 备选方案与拒绝理由

| 方案 | 拒绝理由 |
|------|---------|
| sidebar 直接调 Forge TS（spawn node）解析 .tinkerman/ | 引入进程开销 + 跨语言边界；Push_Subscribe 已提供结构化数据 |
| 用 cmux 的 `set-status` 富文本/多 pill 模拟富 UI | pill 是有损投影，正是本特性要淘汰的；且 cmux 无"多 pill"语义 |
| 把 sidebar 作为 Forge 控制面（点按钮触发 /forge） | 超出本 spec 范围（Out of Scope #3）；先做呈现，控制面留后续 |
| 等待 cmux sidebar 正式版（非 Beta）再写 spec | 设计决策（数据契约、降级、属性）现在就能锁；Implementation_Gate 已隔离不稳定面 |
| 在 Forge 侧新增 sidebar 专用事件流 | 违反 R3.3（零 src 改动）；events.ndjson + push socket 已足够 |

## 6. 与 `cmux-integration` 的关系

- **继承**：Zero-Impact、capabilities 探测、Canonical_Sidebar_Payload、events.ndjson、Mirror_Push_Socket、属性测试风格。
- **增强**：呈现层从 CLI pill 升级为原生 sidebar。
- **不修改**：`cmux-integration` 的 R1–R17 全部不变；本特性是其上层的可选前端。
- **依赖**：`depends_on: [cmux-integration]`（frontmatter 已声明）。

## 7. 验收与验证策略

- **属性测试**（TS，CI 可跑）：Sidebar_Capability_Probe 幂等、Render_Model totality、events.ndjson 容错——这些不依赖 Swift，锁在稳定面。
- **CLI 校验 smoke**（cmux 可用时）：校验 Sidebar_Source 有效（G4）。
- **端到端渲染**：不在 CI（Out of Scope #6）；实现阶段在装了 cmux 0.64.15 的开发机人工验收 5 个区域渲染。
- **降级测试**：模拟 capabilities 缺 sidebar 方法 → 断言回退 CLI 投影、Forge 行为不变。

## 8. 开放问题（实现阶段解决）

1. cmux sidebar 是否支持 per-workspace 实例（Forge 多 workspace 各自渲染）？若仅全局单例，Attention_Queue 需聚合当前聚焦 workspace。
2. events.ndjson 的 redaction（R5.2）在 sidebar 侧如何执行——push socket 是否已 redact，还是 sidebar 再 redact？（倾向 push 侧已 redact，遵循 `cmux-integration` R14.8）
3. `cmux_sidebar` frontmatter 字段是否挤占 `cmux-integration` R11.9 的 5 字段预算——需复核是否合并到既有 `cmux_integration` 开关。
