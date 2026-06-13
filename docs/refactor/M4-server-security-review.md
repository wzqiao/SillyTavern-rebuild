# reforged-server 安全审查（M4 spike）

> 审查对象：`reforged-server/server.js`（commit `db0a73ca9` 时点 + 本次修复）
> 审查日期：2026-06-13 · 审查人：Claude（产品所有者委托）
> 部署假设：本机单用户（默认绑定 `127.0.0.1:8787`），房间口令模式，无账号体系

## 结论

代码整体安全意识良好（见「做对的事」），**本机自用场景下可放心使用**。
两个高危项已当场修复；其余风险按部署形态分级记录，公网/多人部署前必须完成「B3 前置项」。

## 做对的事（验证属实）

- 默认只绑 `127.0.0.1`，不暴露局域网
- 房间口令 sha256 哈希存储 + `timingSafeEqual` 比对（长度先行检查）
- 上游错误统一脱敏（`toSanitizedProviderError`），不透传 provider 响应体
- API key 仅入内存 `credentialVault`，房间快照/事件/WebSocket 载荷/日志中无原文 key（server.test.js 有断言覆盖）
- 生成时以 WebSocket participant 身份取 vault key，忽略客户端塞来的原文 key
- WebSocket upgrade 校验 `resumeToken`，不能凭房间 ID 裸连

## 已修复（本次，含回归测试）

| 级别 | 问题 | 修复 |
| --- | --- | --- |
| 高 | `readJsonBody` 无大小上限——单个请求可耗尽内存（DoS） | 统一封顶 2MB，超限返回 413 |
| 高 | `baseUrl` 客户端任意指定且直接拼进 `fetch`——可用 `file:`/自定义协议探测 | 收口在 `requestProviderChatCompletion`：仅允许 http/https |

另修复前端配套缺陷：SSE 错误帧（`data: {"error":...}`）此前不被 `openAiSseStream` 识别，
消息会永远卡在「正在回复…」——现在抛出 `OpenAiSseStreamError` 正常进入失败态。

## 接受的风险（本机单用户部署）

| 级别 | 风险 | 接受理由 / 触发条件 |
| --- | --- | --- |
| 中 | CORS `Access-Control-Allow-Origin: *`：用户浏览器里任意网页可调用 8787（生成代理需调用方自带 key，房间需口令，实际可利用面有限；现代 Chrome 的 PNA 也会拦截公网页面→localhost） | 单机可接受。**B3 必须**改为 origin allowlist（默认 `http://localhost:5173`）+ Bearer token |
| 中 | SSRF：baseUrl 可指向内网地址（如云元数据 169.254.169.254） | 本机单用户=自己打自己。**公网部署前必须**加目标 allowlist/私网段拒绝 |
| 低 | 全部接口无鉴权 | 即 B3 任务（`REFORGED_TOKEN`） |
| 低 | 房间口令 sha256 无盐 | 口令是短期房间凭据非账号密码；B3 顺手加盐即可 |
| 低 | 无速率限制 | 本机无意义；公网部署前补 |
| 信息 | key 提交走明文 HTTP | 仅 127.0.0.1 回环,不出网卡；远程部署必须上 TLS/反代 |

## B3（最小鉴权）实施清单 —— ✅ 已完成（2026-06-13）

1. ✅ `REFORGED_TOKEN`（`X-Reforged-Token` 头）校验覆盖全部 `/api/reforged/*`（health 豁免供探测）与 WebSocket upgrade（query token）
2. ✅ CORS 收紧为可配 allowlist（`REFORGED_ALLOWED_ORIGIN`），默认 `http://localhost:5173,http://127.0.0.1:5173`
3. ✅ 房间口令哈希加盐（盐随房间生成）
4. 公网部署前置仍未实施（刻意）：TLS + SSRF allowlist + 速率限制——见「接受的风险」表

## 验收记录（P0）

- 单机链路：前端 auto transport → 8787 → 上游 API，错误脱敏返回正确显示 ✅
- 多人链路：双浏览器建房/口令加入/消息实时广播 ✅（2026-06-13 Playwright 实测）
- `node --test reforged-server/server.test.js` 7/7 通过 ✅
