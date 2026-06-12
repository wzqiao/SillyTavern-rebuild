# contracts/ —— 模块间接口契约

本目录是**模块之间 TypeScript 接口契约的唯一来源**。

## 规则(对应 PRD §6.1 "接口先行")
- M2 开闸多 agent 并行**之前**,相关接口必须先在此定义并冻结。
- 各模块(stores / services / engine-adapter / ui-kit / chat-view …)只能**只读依赖**这里的类型。
- 修改契约需经主干评审,避免并行 worktree 各说各话。

## 现状
M0 阶段,契约草案随架构验证逐步成形(见 `docs/REFACTOR-PRD.md` §7 M0 产出)。
M4 多人联机 spike 的房间、参与者、append-only 事件日志与 WebSocket payload 草案见 `multiplayer.ts`。
