# ADR-006: Persist Connection Secrets to Local Browser Storage

## Status
Accepted（产品所有者拍板,2026-06-12;2026-06-13 复核维持）

## Date
2026-06-13

## Context
ADR-003 规定 API key 只存在于内存瞬态 vault,刷新即失。M2 阶段一引入持久化层后,
这一约束成为日常使用的最大痛点:每次刷新页面都要重新输入 key 并重新应用连接草稿。

产品所有者在 M2 计划评审中明确选择「默认记住 + 一键清除」
(见 `docs/refactor/M2-persistence-compat-plan.md` §1.2),并于 2026-06-13 复核确认:
单机自用场景下,本机存储的 key 「只要用户不主动泄露就没人知道」,体验优先。

安全事实(评审时已陈述):浏览器侧对 key 做「加密」属于伪安全——解密密钥同样必须
存在本机,XSS 或本机恶意软件的威胁模型下与明文无异。真实的选项只有
「记住(明文 + 显式清除)」与「每次重填」两种,产品选择前者。

## Decision
1. 持久化层(`app/src/repositories/appPersistence.ts`)**允许且仅允许**通过
   `exportConnectionSecretsForPersistence()` / `restoreConnectionSecretsFromPersistence()`
   两个专用接口,把内存金库快照写入本机 IndexedDB 的 `connection.state` 条目并在启动时恢复。
2. ADR-003 的其余纪律**全部维持**:key 不进 Pinia 可序列化状态/action payload/
   日志/诊断/聊天快照/测试快照断言;运行时取 key 仍走单次 `takeRuntimeConnection()`。
3. 设置页必须始终提供「清除本机密钥」入口(已实现,SettingsView 状态面板)。
4. 测试 fixture 中允许使用形如 `sk-test-secret` 的假 key 做行为断言,禁止出现真实 key。

## Consequences
- 刷新/重启浏览器后连接配置与 key 完整恢复,Runtime 模式即开即用。
- 风险边界从「不落盘」放宽为「只落本机浏览器存储」:本机磁盘取证、共用电脑、
  恶意浏览器扩展可读取该 key。多用户/部署场景(M4 Reforged 后端)必须重新设计
  凭据方案,不得沿用本机明文通道——ADR-005 的后端 credential vault 评审时需引用本条。
- 后续若产品要求,可加「首次保存时显式 opt-in 勾选」,属增强而非阻塞项。
