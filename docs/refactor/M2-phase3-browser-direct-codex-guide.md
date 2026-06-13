# M2 阶段三实施规范：浏览器直连生成（给 Codex 照做）

> 本文是 `M2-persistence-compat-plan.md` **阶段三**的执行细则，面向不了解本项目上下文的执行者，要求「照抄即可对」。
> 配套必读：`AGENTS.md`、`docs/refactor/M2-persistence-compat-plan.md`。
> 目标一句话：**让「实时」生成可以由浏览器直接 `fetch` 用户配置的 OpenAI 兼容 baseURL，不再必须经过旧版 ST 后端（8000 端口）转发；CORS 等网络层失败时自动回落旧路径并提示。**

---

## 0. 执行须知

### 必守纪律
- 只改本文授权的文件。**不改** `public/`、`package-lock.json`、`vite.config.ts`、`tsconfig*`、`src/main.ts`、`src/style.css`。
- **不新增 npm 依赖。**
- API key 只进内存金库与既有持久化通道：不写进日志、不出现在测试 fixture 的快照断言里、不进文档。
- 文案不写死在模板，一律走 `src/i18n/zh.ts` + `src/i18n/en.ts`（两个文件结构必须保持一致，`en.ts` 的类型以 `zh.ts` 推导）。
- HTTP 4xx/5xx **不触发回落**（请求已抵达上游，重发会产生重复副作用/计费）；只有「请求根本没发出去」的网络层失败（fetch 抛 `TypeError`，即 CORS/DNS/断网）才回落。

### 完成前必须全绿
```bash
cd app
npm run type-check
npm run test
npm run build
```

### 真机自查（两条都要做）
1. 起新前端 `cd app && npm run dev`，访问 `http://localhost:5173`（**必须用 localhost**，Vite 只绑 IPv6；8000 是旧版不要开它的页面）。
2. **关掉** 8000 旧后端进程，在连接页选「浏览器直连」，用一个允许 CORS 的 OpenAI 兼容服务（OpenRouter / 各类中转站）完整跑通一次流式回复。

---

## 1. 现状架构（必读背景）

「实时」模式当前唯一的真实请求路径（`legacy-proxy`，下称旧路径）：

```
ChatView.createGenerationInput()
  └─ runtimeConnectionProvider = connectionStore.runtimeHandoff().takeRuntimeConnection
       └─ chatStore.sendUserMessage → chatRuntimeService.createChatCompletionRequest()
            └─ adapter.sendChatCompletion(request)            // src/engine-adapter/headlessEngineAdapter.ts ~L215
                 └─ request.runtimeConnection 存在
                      └─ sendDirectBackendChatCompletion()     // src/engine-adapter/directBackendChatCompletionAdapter.ts
                           ├─ GET  /csrf-token                 // Vite 反代 → 旧版 ST 后端
                           └─ POST /api/backends/chat-completions/generate
                                  body: { reverse_proxy: baseUrl, proxy_password: apiKey, model, messages,
                                          stream, max_tokens?, temperature?, top_p? ... }   // 旧后端转发到用户 baseUrl
```

关键事实：
- `request.runtimeConnection` 的类型是 `HeadlessChatCompletionRuntimeConnection`（`src/contracts/engine.ts`），由 `connectionStore.runtimeHandoff().takeRuntimeConnection()` 生成（`src/stores/connectionStore.ts` 约 L395-410，slot 机制从内存金库取真实 apiKey）。
- 采样参数已在 M2 阶段二接好：`request.sampling`（`ReforgedPresetSampling`，camelCase）由 `applySamplingParams()` 映射为 snake_case 请求体字段。
- 流式解析：旧路径把上游 OpenAI SSE 原样中继，`directBackendChatCompletionAdapter.ts` 内的 `createDirectBackendStream / readStreamEvent / mergeDirectBackendChunk` 把 SSE 累积成快照流，`chatRuntimeService.normalizeChatCompletionEvents` 消费。**浏览器直连拿到的也是同格式 OpenAI SSE，解析逻辑必须复用而不是复制。**
- 持久化：`src/repositories/appPersistence.ts` 的 `writeConnection()` 把 `{draft, appliedDraft, nextLocalId, secrets}` 写进 kv `connection.state`，水合时 `$patch` 回来。新增的连接级设置必须加进这条通道。

---

## 2. 改动总览（按实施顺序）

| # | 文件 | 动作 |
|---|---|---|
| 1 | `src/engine-adapter/openAiSseStream.ts` | **新建**：从 directBackend 适配器抽出 SSE 解析公共件 |
| 2 | `src/engine-adapter/directBackendChatCompletionAdapter.ts` | 改用公共件，删除被抽走的私有实现 |
| 3 | `src/contracts/connection.ts` + `src/contracts/engine.ts` | 新增 `transport` 类型字段 |
| 4 | `src/engine-adapter/browserDirectChatCompletionAdapter.ts` | **新建**：浏览器直连适配器 |
| 5 | `src/engine-adapter/headlessEngineAdapter.ts` | `sendChatCompletion` 加路由 + 回落 |
| 6 | `src/stores/connectionStore.ts` | 新增 `transportMode` 状态与动作 |
| 7 | `src/repositories/appPersistence.ts` | `connection.state` 带上 `transportMode` |
| 8 | `src/views/ConnectionView.vue` | 「连接方式」选择器 |
| 9 | `src/views/ChatView.vue` | 监听回落事件,显示提示 |
| 10 | `src/i18n/zh.ts` + `src/i18n/en.ts` | 新文案 |
| 11 | 测试（见 §5） | 新增/更新 |

---

## 3. 逐文件细则

### 3.1 新建 `src/engine-adapter/openAiSseStream.ts`

把 `directBackendChatCompletionAdapter.ts` 中下列**私有**实现原样搬来并导出（搬移，不是复制——原文件里删掉）：

- `DirectBackendStreamState` → 改名 `OpenAiSseStreamState`
- `createDirectBackendStream(body)` → 改名导出 `createOpenAiSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown>`
- `readStreamEvent`、`mergeDirectBackendChunk`（→ `mergeOpenAiSseChunk`）、`mergeToolCallDeltas`、`readContentDelta`、`readString`、`isRecord`

行为零改动：`split(/\r?\n\r?\n/)` 事件分帧、`data:` 行聚合、`[DONE]` 跳过、快照累积结构 `{text, reasoning, reasoningSignature, logprobs, finishReason, toolCalls, state:{...}}` 全部保持原样（`chatRuntimeService` 的归一化依赖这个形状）。

### 3.2 改 `directBackendChatCompletionAdapter.ts`

- 顶部 `import { createOpenAiSseStream } from './openAiSseStream';`
- 流式分支 `return createDirectBackendStream(response.body)` → `return createOpenAiSseStream(response.body)`
- 删除被搬走的私有函数。`applySamplingParams`、请求体构造等其余内容**不动**。

### 3.3 契约：新增 transport 字段

`src/contracts/connection.ts`：
```ts
// DRAFT: 待主干评审
export type ReforgedConnectionTransportMode = 'auto' | 'browser-direct' | 'legacy-proxy';
```
- `ReforgedConnectionRuntimeRequestConfig` 增加 `transport: ReforgedConnectionTransportMode;`

`src/contracts/engine.ts` 的 `HeadlessChatCompletionRuntimeConnection` 增加：
```ts
/** 请求走线方式(M2 阶段三)。缺省按 auto 处理。 */
transport?: ExtensibleString<'auto' | 'browser-direct' | 'legacy-proxy'>;
```

### 3.4 新建 `src/engine-adapter/browserDirectChatCompletionAdapter.ts`

```ts
// DRAFT: 待主干评审

import type { HeadlessChatCompletionRequest, HeadlessChatCompletionRuntimeConnection } from '@/contracts/engine';
import { createOpenAiSseStream } from './openAiSseStream';

export type BrowserDirectFailureKind = 'config' | 'cors-or-network' | 'http';

export class BrowserDirectChatCompletionError extends Error {
  constructor(
    public readonly kind: BrowserDirectFailureKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'BrowserDirectChatCompletionError';
  }
}

export interface BrowserDirectDependencies {
  fetch?: typeof fetch;
}

export async function sendBrowserDirectChatCompletion(
  request: HeadlessChatCompletionRequest,
  dependencies: BrowserDirectDependencies = {},
): Promise<unknown> { ... }
```

实现要点：
1. **校验**（不满足抛 `kind: 'config'`）：`runtimeConnection` 存在、`provider === 'openai-compatible'`、baseUrl/model/apiKey 非空（参照 directBackend 适配器的 `normalizeRuntimeConnection` 写法）。
2. **URL 拼接** `resolveChatCompletionsUrl(baseUrl)`（单独导出，便于测试）：
   - 去尾部 `/`；
   - 若已以 `/chat/completions` 结尾则原样用；
   - 否则追加 `/chat/completions`。
   （社区约定 baseUrl 形如 `https://host/v1`。不做 `/v1` 自动补全——用户填什么就是什么。）
3. **请求体**（OpenAI 标准字段 + 兼容扩展，仅在有值时携带）：
   ```ts
   { model, messages: request.messages, stream: request.stream !== false,
     max_tokens?, temperature?, top_p?, top_k?, top_a?, min_p?,
     frequency_penalty?, presence_penalty?, repetition_penalty?, seed? }
   ```
   `max_tokens` 优先取 `request.responseLength`，否则 `request.sampling?.maxTokens`。采样映射逻辑与 directBackend 的 `applySamplingParams` 相同（camelCase → snake_case，`!= null` 才赋值）。`request.jsonSchema` 本路径 v1 不支持：存在时追加 `response_format: { type: 'json_object' }` 即可，不要报错。
4. **请求**：
   ```ts
   fetcher(url, { method: 'POST',
     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
     body: JSON.stringify(body), signal: request.signal })
   ```
   - `fetcher` 同步抛错或 reject 出 `TypeError` → 包成 `kind: 'cors-or-network'`（这是回落信号）。
   - `AbortError`（`error.name === 'AbortError'`）**原样 rethrow**，不得吞掉也不得触发回落。
   - `!response.ok` → `kind: 'http'`，message 含 `response.status`，并尽力附上响应体前 200 字符（`await response.text().catch(() => '')`）。
5. **响应**：流式 → `createOpenAiSseStream(response.body)`（body 为空抛 `http`）；非流式 → `response.json()`。

### 3.5 路由：`headlessEngineAdapter.ts`

`HeadlessEngineAdapterDependencies`（同文件内的依赖注入接口）新增可注入项，命名 `browserDirectChatCompletion?: BrowserDirectDependencies`。

`sendChatCompletion` 的 `runtimeConnection` 分支改为：

```ts
if (request.runtimeConnection) {
  const transport = request.runtimeConnection.transport ?? 'auto';

  if (transport !== 'legacy-proxy') {
    try {
      return await sendBrowserDirectChatCompletion(request, dependencies.browserDirectChatCompletion);
    } catch (error) {
      const fallbackEligible =
        transport === 'auto' &&
        error instanceof BrowserDirectChatCompletionError &&
        error.kind === 'cors-or-network';

      if (!fallbackEligible) {
        throw error;
      }

      emitTransportFallback(error.message);
    }
  }

  return sendDirectBackendChatCompletion(request, dependencies.directBackendChatCompletion);
}
```

`emitTransportFallback`（同文件私有函数）：
```ts
function emitTransportFallback(reason: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('reforged-transport-fallback', { detail: { reason } }));
}
```
事件名**必须**是 `reforged-transport-fallback`（ChatView 按此监听）。

### 3.6 `connectionStore.ts`

- `ConnectionStoreState` 新增 `transportMode: ReforgedConnectionTransportMode`，初始 `'auto'`。
- 新增 action `setTransportMode(mode: ReforgedConnectionTransportMode): void`（直接赋值）。
- `runtimeHandoff` 内组装 `ReforgedConnectionRuntimeRequestConfig` 处（`takeRuntimeConnection` 返回值，约 L395-410）带上 `transport: this.transportMode`。
- `clearAll()` 重置 `transportMode = 'auto'`。

### 3.7 `appPersistence.ts`

`ConnectionPersistedState` 增加 `transportMode?: string;`：
- `writeConnection()` 写入 `transportMode: connectionStore.transportMode`；
- 水合分支 `$patch` 时恢复：`transportMode: (connectionState.transportMode as never) ?? 'auto'`。

### 3.8 `ConnectionView.vue`

在「预设（可选）」section **之前**、表单 `</form>` 之后插入一个同风格 section：

- 标题/描述 + 一个 `Select`：
  ```
  :model-value="connectionStore.transportMode"
  :options="transportOptions"
  @update:model-value="connectionStore.setTransportMode($event as ReforgedConnectionTransportMode)"
  ```
- `transportOptions`（computed，三项，value 分别为 `auto` / `browser-direct` / `legacy-proxy`，label+description 走 i18n `t.connection.transport.*`）。

### 3.9 `ChatView.vue`

- `onMounted` 注册、`onBeforeUnmount` 注销 `window` 事件 `reforged-transport-fallback`；
- 回调里 `runtimeFallbackNotice.value = t.value.chat.transportFallback(detail.reason)`（`runtimeFallbackNotice` 已存在，amber 横幅会自动显示）；
- 下一次成功发送已有清空逻辑，无需额外处理。

### 3.10 i18n（zh 为准，en 对应翻译）

`connection` 下新增：
```ts
transport: {
  title: '连接方式',
  description: '浏览器直连不经过旧版后端；部分服务商不允许跨域时会自动回落。',
  auto: '自动（推荐）',
  autoDescription: '先尝试浏览器直连，跨域被拒时自动回落旧版代理。',
  direct: '浏览器直连',
  directDescription: '只用浏览器直接请求 baseURL，失败不回落。',
  proxy: '旧版代理',
  proxyDescription: '始终经由本机旧版 ST 后端（8000）转发。',
},
```
`chat` 下新增：
```ts
transportFallback: (reason: string) => `浏览器直连失败，已回落旧版代理：${reason}`,
```

---

## 4. 不要做的事

- 不要在 HTTP 4xx/5xx 时回落（理由见 §0）。
- 不要把 apiKey 放进 URL、日志或错误 message。
- 不要动 `chatRuntimeService` 的归一化逻辑——SSE 快照形状不变，它不需要知道走线方式。
- 不要给旧路径(`sendDirectBackendChatCompletion`)改任何行为。
- 不要新建第二个 WebGL/特效相关文件（与本任务无关）。

---

## 5. 测试要求（全部新增到对应 `.test.ts`）

1. **`browserDirectChatCompletionAdapter.test.ts`**（新建，参考 `directBackendChatCompletionAdapter.test.ts` 的 mock fetch 写法）：
   - `resolveChatCompletionsUrl`：`https://a/v1` → `https://a/v1/chat/completions`；尾斜杠去重；已含 `/chat/completions` 不重复追加。
   - 请求头含 `Authorization: Bearer sk-…`、不含 CSRF；body 含 model/messages/stream 及采样 snake_case 字段。
   - 非流式：mock `response.json()` 返回 choices 结构，原样返回。
   - 流式：mock `ReadableStream` 推两帧 `data: {...}\n\n` + `data: [DONE]`，断言快照 text 累积。
   - fetch 抛 `TypeError` → `BrowserDirectChatCompletionError` 且 `kind === 'cors-or-network'`。
   - `response.ok === false`（如 401）→ `kind === 'http'`，**不**是 cors-or-network。
   - `AbortError` 原样穿透（`expect(...).rejects.toMatchObject({ name: 'AbortError' })`）。
2. **`headlessEngineAdapter.test.ts`** 增补路由用例（用依赖注入 mock 两个适配器）：
   - `transport: 'auto'` + 直连抛 cors-or-network → 调用了旧路径，且 `window` 收到 `reforged-transport-fallback`；
   - `transport: 'auto'` + 直连抛 http(401) → 直接 reject，旧路径未被调用；
   - `transport: 'browser-direct'` + 任意失败 → reject 不回落；
   - `transport: 'legacy-proxy'` → 直连函数从未被调用。
3. **`connectionStore.test.ts`** 增补：`transportMode` 默认 `auto`；`setTransportMode` 生效；`runtimeHandoff().takeRuntimeConnection()` 返回值含 `transport`；`clearAll` 重置。
4. **`appPersistence.test.ts`** 第一个用例里：生命周期 A `setTransportMode('browser-direct')`，生命周期 B 断言恢复。

---

## 6. 验收清单（完成后逐条自检并在 PR 描述里勾选）

- [ ] `npm run type-check`、`npm run test`、`npm run build` 全绿。
- [ ] 关停 8000 后端 → 连接页选「浏览器直连」→ 用允许 CORS 的服务商完整流式生成一条回复。
- [ ] 连接页选「自动」+ 一个不允许 CORS 的 baseUrl + 开着 8000 → 聊天页出现回落提示横幅，且回复正常生成。
- [ ] 连接页选「旧版代理」→ 行为与改动前完全一致。
- [ ] 刷新页面后「连接方式」选择保持。
- [ ] 中英两种语言下新文案显示正常（设置页切换语言检查）。
