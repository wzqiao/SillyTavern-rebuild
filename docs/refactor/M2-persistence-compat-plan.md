# M2 计划：持久化、旧资产兼容补全与联机地基

> 状态：已确认（2026-06-12，与项目所有者对齐三项关键决策）
> 进度：阶段一 ✅ 已完成并验收（2026-06-12）；阶段二 ✅ 已完成并验收（2026-06-12）；阶段三 ✅ 已实现并完成真实代理验收（2026-06-12）；阶段四 ✅ ADR 已产出（`docs/decisions/ADR-005-adopt-reforged-backend-for-multiplayer.md`），且后端 spike 已提前落地（`reforged-server/`，产品所有者 2026-06-13 批准保留）
> 决策补记（2026-06-13）：API key 本机持久化维持「默认记住 + 一键清除」，正式化为 `docs/decisions/ADR-006-persist-connection-secrets-locally.md`；three / fake-indexeddb 依赖已获批准并记入 AGENTS.md
> 前置：M1.5 收尾波次可与本计划阶段一并行推进，互不阻塞

## 0. 背景与决策记录

M1.5 后的最大体验洞是**全部领域数据不持久化**（刷新即丢，唯一例外是语言偏好）；
兼容面上**预设（preset）完全缺失**；架构面上实时生成**全链路依赖旧版后端**。

与项目所有者确认的三项决策（覆盖/修正 PRD v0.2 的对应条目）：

| 决策点 | 结论 | 对 PRD 的影响 |
| --- | --- | --- |
| 持久化架构 | **IndexedDB + 仓储（repository）接口**：store 一律经由仓储接口读写，IndexedDB 只是第一个实现，联机时替换为后端 API 实现，前端业务代码不动 | 无冲突，落实 §6.3「模块独立」 |
| 预设支持深度 | **采样参数 + prompt 结构**：导入旧版 preset JSON 的采样参数（temperature/top_p/max_tokens 等）与 prompts/prompt_order 主结构，生成时按序拼装；不复刻完整 prompt manager 的全部开关 | 填补 PRD 未规划的缺口 |
| 联机终态形态 | **多人同一会话共玩**（同一会话、多玩家与 AI 角色共同对话，需实时同步与房间系统）。**修正 PRD §5.2「世界书房间」原案** | M4 范围重写；意味着终态必须有 Reforged 自有后端（WebSocket 房间 + 会话权威状态在服务端），「后端基本不动」策略到 M4 终止 |

联机本身仍不在本计划内实施，但本计划的数据模型按上述终态做**不后悔预留**（见 §1.3）。

## 1. 阶段一：持久化层（优先级最高）

### 1.1 仓储接口

新增 `app/src/repositories/`：

- `types.ts`：`ReforgedRepository<T>` 通用接口（`list/get/put/delete/clear`，全异步），
  以及各领域仓储类型 `CharacterRepository`、`WorldbookRepository`、`ChatSessionRepository`、
  `ConnectionRepository`、`PresetRepository`。
- `indexedDbRepository.ts`：基于裸 IndexedDB（不引依赖；若 wrapper 超过 ~200 行再考虑 `idb`）。
  单库 `st-reforged`，每领域一个 object store，版本化 schema + 迁移钩子。
- `memoryRepository.ts`：现行为的内存实现，测试与 SSR/降级兜底用。

### 1.2 store 接线

- 四个领域 store（character/worldbook/chat/connection）启动时从仓储水合，变更后写回
  （防抖批量写，会话消息为追加写）。
- **连接配置含 API key 默认持久化**，设置页提供「清除本机密钥」按钮与风险提示。
  （修正 ADR-003 的内存瞬态 vault 决策；理由：单机自用场景下刷新即丢的体验代价更高。）
- 持久化失败（隐私模式/配额）静默降级为内存实现 + 一次性 toast 提示。

### 1.3 联机不后悔预留（只改数据形状，不写同步逻辑）

- 消息记录增加 `authorId`（当前恒为 `local-user`）与 `seq`（会话内单调递增）。
- 会话增加 `participants: string[]`（当前恒为单元素）。
- 所有持久化实体带 `updatedAt` + `revision`，仓储接口保留 `since(revision)` 可选查询签名。

### 1.4 验收

- 导入角色/世界书、聊天数轮、配置连接 → 刷新页面 → 一切如初，可直接继续生成。
- 测试覆盖：仓储接口契约测试（memory 与 indexedDb 两实现跑同一套用例，indexedDb 用 fake-indexeddb）。

## 2. 阶段二：预设导入

- `app/src/parsers/presetJson.ts`：解析旧版 OpenAI preset JSON——
  采样参数（temperature/top_p/frequency_penalty/presence_penalty/max_tokens/上下文长度）、
  `prompts[]`（含 main/nsfw/jailbreak 与自定义注入项的 content/role/injection_position/depth）、
  `prompt_order`。宽容解析：缺字段给默认值并产出导入诊断（沿用角色卡导入的诊断模式）。
- `presetStore` + 仓储持久化；连接页增加预设选择（极简：一个 Select + 导入按钮，
  细节遵循渐进式披露，点开才见完整参数清单）。
- 生成接线：
  - prompt 结构 → `chatGenerationService.createChatEngineMessages` 按 `prompt_order` 拼装，
    宏替换复用世界书已有 seam（`{{char}}`/`{{user}}` 等）。
  - 采样参数 → 直连后端请求体直接透传（已验证旧后端 `chat-completions.js` 接受
    `temperature`/`top_p` 等字段）。
- 验收：导入一个社区流行预设 → 检查最终 messages 拼装顺序与采样参数到达上游（runtime 诊断面板可见）。

## 3. 阶段三：浏览器直连生成（摘第一条旧后端依赖）

- 新适配器 `browserDirectChatCompletionAdapter.ts`：对 OpenAI 兼容 baseURL 直接
  `fetch ${baseUrl}/chat/completions`（Bearer 鉴权，SSE 流式解析复用现有 normalizer）。
- 连接页「连接方式」开关：自动优先直连，CORS 失败自动回落旧后端代理并提示原因。
- 验收：关闭 8000 旧后端，直连模式完整跑通流式生成。

## 4. 阶段四：联机地基 ADR（只写决策，不写代码）

- 已新增 `docs/decisions/ADR-005-adopt-reforged-backend-for-multiplayer.md`。
- 决策：终态=服务器部署的多人同一会话共玩 → 需要 Reforged 自有后端；
  采用 WebSocket 房间 + 服务端权威 append-only 事件日志，与 §1.3 的 `seq` / `revision` 预留衔接。
- 首版身份模型：房间链接 + 昵称 + 房间密码；暂不做账号系统。
- API key 模型：每个玩家使用自己的 key，后端只在服务端使用，不广播给其他玩家。
- 生成权限：所有房间参与者都可以触发 AI 生成，事件日志记录触发者与使用的玩家配置。
- 旧 ST 后端策略：短期继续作为兼容桥，M4 的 Reforged 自有后端成熟后替换旧代理路径。

## 5. 开放问题（待项目所有者反馈）

1. API key 持久化默认开启是否接受？（本计划按「默认记住 + 一键清除」执行，不同意请反馈）
2. 预设里的 utility prompts（如 impersonation/继续填充提示）是否需要？阶段二先不做，遇到再补。
3. 聊天记录从旧版导入（jsonl）未排期——需要的话插在阶段二之后。
