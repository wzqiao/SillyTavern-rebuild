# contracts/ —— 模块间接口契约

本目录是**模块之间 TypeScript 接口契约的唯一来源**。

## 规则(对应 PRD §6.1 "接口先行")
- M2 开闸多 agent 并行**之前**,相关接口必须先在此定义并冻结。
- 各模块(stores / services / engine-adapter / ui-kit / chat-view …)只能**只读依赖**这里的类型。
- 修改契约需经主干评审,避免并行 worktree 各说各话。

## 现状
M2.5 收口评审(2026-06-13):

- `character.ts`、`chat.ts`、`connection.ts`、`engine.ts`、`preset.ts`、`ui.ts`、`worldbook.ts`
  作为 M2.5 主线基线契约采纳;后续改动仍需按主干评审处理。
- 仓储网关、persona、preset、旧聊天导入与 Reforged runtime client 已进入 M2.5 主线路径。
- `multiplayer.ts` 仍保持 `// DRAFT: 待主干评审`:当前房间协议只完成 M4 spike/M2.5 验收,
  M4 主体还需要 durable room/event storage、流式 `generation.chunk`、账号/权限、主持人控制、
  rate limit、TLS 与 provider target allowlist 等公网部署前置设计。
