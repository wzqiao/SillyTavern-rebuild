# M1 下一轮 Goal 开发指导

> 适用基线:`reforge/main` @ `874d210d2`。
> 用途:给下一轮 `/goal` 开发提供当前状态、推荐任务、边界和可复制提示词。

## 0. 当前主线状态

当前 `reforge/main` 已完成并合入:

- M1 多 agent 并发计划与 goal cards。
- `/connection` 产品化第一版。
- `/characters` 产品化第一版。
- `/worldbooks` 产品化第一版。
- `/settings` 简单/高级设置框架。
- `/chat` 基础聊天闭环。
- Runtime-E2E 真实 OpenAI-compatible direct backend streaming 验证。

最近关键提交:

```text
874d210d2 fix: verify direct backend streaming runtime
a2e077586 merge: integrate basic chat view
ffc2b450a merge: integrate settings progressive disclosure
bba875490 merge: integrate worldbooks view productization
22f408565 merge: integrate characters view productization
b70c1b904 merge: integrate connection view productization
c60a42e26 docs: add M1 parallel goal cards
```

当前质量门:

```text
cd app
npm run type-check  # passed
npm run test        # 24 files, 193 tests passed
```

Runtime-E2E 结果:

- ST backend: `http://127.0.0.1:8000`
- Reforged Vite: `http://127.0.0.1:5173`
- Direct backend streaming: HTTP 200
- Parsed SSE chunks: 2
- `finishReason: "stop"`
- API key 未写入代码、文档、测试或 git。

## 1. 下一步推荐

优先做:

```text
docs/refactor/M1-goal-cards.md
Card 7 · Chat-Actions 高级聊天操作
```

原因:

- `/chat` 基础发送、demo/runtime、composer、消息 timeline 已有。
- Runtime direct backend streaming 已真实验证通过。
- M1 产品验收还缺 `regenerate`、`continue`、`swipe`、`retry`、编辑、删除这些发送体验。

完成 `Chat-Actions` 后再做:

```text
docs/refactor/M1-goal-cards.md
Card 8 · Product-QA M1 端到端验收
```

## 2. Chat-Actions 的开发边界

### 推荐分支

```text
reforge/chat-actions
```

如果你在 Codex 里用 high reasoning 重开独立线程,也可以使用 `reforge/chat-actions-high`,但完成汇报时要明确说明实际分支名。

### 允许修改

以 `M1-goal-cards.md` 的 Card 7 为准。通常允许:

- `app/src/views/ChatView.vue`
- `app/src/stores/chatStore.ts` 仅当现有 action 不足
- `app/src/stores/chatStore.test.ts`
- `app/src/contracts/chat.ts` 仅当现有契约不够,新增项必须标 `// DRAFT: 待主干评审`

### 不允许修改

- 不改 `public/`。
- 不改 `app/package.json` / `app/package-lock.json`。
- 不改 `app/vite.config.ts`。
- 不改 `app/src/router/index.ts`。
- 不改 `app/src/main.ts`。
- 不新增 npm 依赖。
- 不重写整个 `chatStore`。
- 不改 connection/characters/worldbooks/settings 页面。
- 不改 engine-adapter 架构。
- 不调用 `Generate()`。
- 不操作 SillyTavern jQuery DOM。
- 不把 API key 写进任何可序列化状态、日志、测试 fixture 或文档。

## 3. Chat-Actions 验收标准

完成时至少满足:

- demo adapter 下可用:
  - regenerate
  - continue
  - swipe alternatives
  - retry failed
  - edit user message
  - delete message
- runtime 模式不破坏基础发送。
- 生成中不能触发互相冲突的操作。
- alternatives/swipes 状态正确。
- 移动端操作区不溢出,375px 宽度可用。
- 深色主题下按钮和错误态可读。
- type-check/test 通过。

必须运行:

```bash
cd app
npm run type-check
npm run test
```

建议补充测试:

- assistant alternatives 切换。
- regenerate 不破坏 session/message 状态。
- continue 追加/生成行为。
- retry failed message。
- edit/delete 后 selected session 状态。

## 4. Product-QA 触发条件

只有当 `Chat-Actions` 合入并验证通过后,再开 Product-QA。

Product-QA 目标:

- 不进入 `/dev` 也能跑完整流程:
  - `/connection`
  - `/characters`
  - `/chat`
  - `/worldbooks`
  - 回 `/chat`
- 375px 手机宽度可用。
- 桌面宽度可用。
- 深色主题可读。
- `/dev` 只保留为调试入口。

## 5. 给 Goal 的推荐提示词

复制下面这一段到新的 `/goal` 线程。建议使用 high reasoning 和 new worktree。

```text
/goal 执行 ST-Reforged M1 下一轮任务 HIGH 版: docs/refactor/M1-goal-cards.md 中的 “Card 7 · Chat-Actions 高级聊天操作”。

请先阅读并严格遵守:
- AGENTS.md
- docs/REFACTOR-PRD.md
- docs/refactor/M1-product-plan.md
- docs/refactor/M1-parallel-agent-plan.md
- docs/refactor/M1-goal-cards.md
- docs/refactor/M1-next-goal-guide.md

当前基线:
- 第一波页面已合入: ConnectionView、CharactersView、WorldbooksView、SettingsView。
- ChatView 基础聊天闭环已合入。
- Runtime-E2E direct backend streaming 已验证通过。
- 当前主线质量门通过: npm run type-check / npm run test。

本次任务:
- 执行 Card 7: Chat-Actions 高级聊天操作。
- 使用分支: reforge/chat-actions。
- 在 /chat 上实现 regenerate、continue、swipe alternatives、retry failed、编辑用户消息、删除消息。
- demo adapter 下这些操作必须可用。
- runtime 模式不能破坏基础发送。

边界:
- 只修改 Card 7 Allowed Writes 允许的文件。
- 不改 public/。
- 不改 app/package.json、app/package-lock.json、vite.config.ts、router、main.ts、tsconfig*。
- 不新增 npm 依赖。
- 不重写整个 chatStore。
- 不改 connection/characters/worldbooks/settings 页面。
- 不改 engine-adapter 架构。
- 不调用 Generate()。
- 不操作 SillyTavern jQuery DOM。
- 不把 API key 写进 Pinia 可序列化 state/action payload、日志、测试 fixture 或文档。
- 你不是独自工作,不要 revert 其他 agent 或主线已有改动,不要合并到 reforge/main。

完成前必须运行:
cd app
npm run type-check
npm run test

完成后按任务卡 Done Report 格式汇报:
- 分支
- 实现了什么
- 新增/修改文件
- 契约变更
- 验证结果
- 移动端/深色主题检查
- 遗留问题
- 需要主干协调
- 关键假设
```
