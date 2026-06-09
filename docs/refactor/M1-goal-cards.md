# M1 Goal Cards · ST-Reforged 多 Agent 任务卡

> 适用基线:`reforge/main` @ `6be9264a9`(2026-06-09)。
> 本文件是 `docs/refactor/M1-parallel-agent-plan.md` 的执行层补充。

## 0. 这份文件怎么用

`M1-parallel-agent-plan.md` 是并发开发总图,告诉大家为什么这样拆、谁可以并行、哪些文件不能碰。

本文件是可以直接复制给 goal agent 的任务卡。每张卡都包含:

- Goal:本 agent 要完成的明确目标。
- Start State:开始时项目是什么状态。
- Read First:开工前必须读哪些文件。
- Allowed Writes:允许修改哪些文件。
- Forbidden Writes:不允许修改哪些文件。
- Implementation Steps:建议执行步骤。
- Acceptance:完成标准。
- Verification:必须运行的验证。
- Done Report:完成时必须汇报的内容。

分派方式:

1. 给每个 agent 一个独立 worktree。
2. 让它先读 `AGENTS.md`、`M1-product-plan.md`、`M1-parallel-agent-plan.md` 和对应任务卡。
3. 只复制一张任务卡给一个 agent,不要一次塞全部卡。
4. 每个 agent 完成后先不要直接合主干,把 Done Report 交给协调 agent。

## 1. 所有 Agent 共用启动提示

把下面这段和对应任务卡一起复制给每个 goal agent。

```text
你正在参与 ST-Reforged M1 产品化开发。

必须遵守:
- 读 AGENTS.md。
- 读 docs/REFACTOR-PRD.md。
- 读 docs/refactor/M1-product-plan.md。
- 读 docs/refactor/M1-parallel-agent-plan.md。
- 只修改任务卡 Allowed Writes 里的文件。
- 不改 public/。
- 不改 app/package.json、app/package-lock.json、vite.config.ts、tsconfig*、main.ts、router/index.ts,除非任务卡明确授权。
- 不新增 npm 依赖。
- 不调用 Generate()。
- 不操作 SillyTavern jQuery DOM。
- API key 不进入 Pinia 可序列化 state/action payload,不写日志,不写测试 fixture,不写文档。
- 模块间只通过 contracts/stores/services/ui-kit/engine-adapter 交互。

完成前必须运行:
cd app
npm run type-check
npm run test

完成汇报必须包含:
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

## 2. Card 0 · M1-Coord 主干协调

### Goal

维护 M1 多 agent 开发秩序,审核契约变更,协调合流,保证 `reforge/main` 始终能通过 type-check 和 test。

### Start State

- 当前主干 `reforge/main` 已有 AppShell、正式路由、ui-kit、M0 stores/services。
- `/dev` 仍是功能最完整 workbench。
- 多个页面 agent 会并发开发。

### Recommended Branch

```text
reforge/m1-coordination
```

### Read First

- `AGENTS.md`
- `docs/REFACTOR-PRD.md`
- `docs/refactor/M1-product-plan.md`
- `docs/refactor/M1-parallel-agent-plan.md`
- `docs/refactor/M1-goal-cards.md`
- `app/src/contracts/README.md`

### Allowed Writes

- `docs/refactor/M1-parallel-agent-plan.md`
- `docs/refactor/M1-goal-cards.md`
- `docs/refactor/M1-product-plan.md` 仅用于状态更新
- `docs/decisions/*.md` 仅当需要记录新架构决策
- `app/src/contracts/*.ts` 仅用于合并经审核的契约草案

### Forbidden Writes

- 不直接实现页面功能。
- 不代替页面 agent 大改 store/service。
- 不改 `public/`。
- 不改依赖文件。

### Implementation Steps

1. 建立当前任务状态表,记录每个 agent 的分支、负责文件和依赖。
2. 收到 agent Done Report 后,检查是否越权改文件。
3. 检查契约变更是否必要,是否标了 `// DRAFT: 待主干评审`。
4. 合流前运行:

   ```bash
   cd app
   npm run type-check
   npm run test
   ```

5. 如果多个 agent 修改同一文件,不要硬合。先判断是否应该拆出公共协调任务。
6. 合流后更新本文件或并发计划里的状态说明。

### Acceptance

- 每次合流后主干质量门全绿。
- 没有未授权修改公共基座。
- 契约变更有记录。
- 各 agent 的任务边界清晰。

### Verification

```bash
cd app
npm run type-check
npm run test
```

### Done Report

```text
任务:M1-Coord
分支:
合流了哪些任务:
拒绝或退回了哪些任务:
契约变更:
当前质量门:
后续建议:
```

## 3. Card 1 · ConnectionView 产品化

### Goal

把 `/connection` 从占位页变成真正可用的连接配置页面,让用户能配置 OpenAI-compatible base URL、model、API key,并应用到 runtime handoff。

### Start State

- `app/src/views/ConnectionView.vue` 目前是占位说明页。
- `/dev` 的 `HomeView.vue` 已有连接配置面板逻辑可参考。
- `connectionStore` 已存在:
  - `draft`
  - `appliedDraft`
  - `draftErrors`
  - `draftStatus`
  - `maskedApiKey`
  - `runtimeHandoff(input)`
  - `patchDraft(input)`
  - `applyDraft()`
  - `resetDraft()`
  - `clearApiKey()`
  - `clearAll()`
  - `setConnectionDraftApiKeySecret(store, value)`

### Recommended Branch

```text
reforge/connection-view
```

### Read First

- `app/src/views/ConnectionView.vue`
- `app/src/views/HomeView.vue`
- `app/src/stores/connectionStore.ts`
- `app/src/stores/connectionStore.test.ts`
- `app/src/contracts/connection.ts`
- `app/src/ui-kit/index.ts`
- `docs/decisions/ADR-003-accept-direct-backend-chat-completions-seam.md`

### Allowed Writes

- `app/src/views/ConnectionView.vue`
- `app/src/stores/connectionStore.test.ts` 仅当需要补测试
- `app/src/contracts/connection.ts` 仅当现有契约不够,新增项必须标 `// DRAFT: 待主干评审`

### Forbidden Writes

- 不改 `connectionStore.ts`,除非发现明确 bug 且先在汇报里说明。
- 不改 `engine-adapter/`。
- 不改 `vite.config.ts`。
- 不写入 localStorage/sessionStorage。
- 不让 API key 出现在 Pinia state、action payload、日志、测试快照、文档。

### Implementation Steps

1. 阅读 `HomeView.vue` 中连接配置相关逻辑,只搬需要的交互,不要复制整个 workbench 结构。
2. 在 `ConnectionView.vue` 使用 `<script setup lang="ts">`。
3. 接入 `useConnectionStore()`。
4. 用 ui-kit 组件构建页面:
   - `Select` 或同等 ui-kit 选择 provider。
   - `Input` 输入 base URL。
   - `Input` 输入 model。
   - `Input` 输入 API key。
   - `Button` 执行应用/重置/清空。
5. provider 第一版只支持 `openai-compatible`。
6. API key 输入时调用 `setConnectionDraftApiKeySecret(store, value)`,不要通过 `patchDraft` 传原始 key。
7. 显示状态:
   - draft status
   - validation issues
   - runtime handoff status
   - masked API key
8. "Apply configuration" 调用 `store.applyDraft()`。
9. "Reset draft" 调用 `store.resetDraft()`。
10. "Clear key" 调用 `store.clearApiKey()`。
11. 如果要展示 "Test connection",先做禁用/未接入状态,不要假装能测。
12. 保持移动端单列布局,桌面可两列。

### Acceptance

- 用户能在 `/connection` 输入 base URL、model、API key。
- 点击应用后,页面显示 applied/ready 相关状态。
- draft 不完整时,页面显示具体字段错误。
- 清空 key 后,key metadata 和 applied draft 状态正确。
- 没有任何原始 API key 出现在可序列化状态或页面调试文本里。
- 375px 宽度下表单不溢出。

### Verification

```bash
cd app
npm run type-check
npm run test
```

如补了 store 测试,重点覆盖:

- key 不进 state。
- applyDraft 成功/失败。
- clearApiKey 行为。

### Done Report

```text
任务:ConnectionView 产品化
分支:reforge/connection-view
实现了什么:
新增/修改文件:
契约变更:
验证结果:
移动端/深色主题检查:
遗留问题:
需要主干协调:
关键假设:
```

## 4. Card 2 · CharactersView 产品化

### Goal

把 `/characters` 从占位页变成角色导入和选择页面,让用户能导入 JSON/PNG 角色卡,查看角色列表,选择当前角色。

### Start State

- `app/src/views/CharactersView.vue` 目前是占位说明页。
- `/dev` 已有角色导入和选择逻辑可参考。
- `characterStore` 已存在:
  - `characters`
  - `selectedCharacterId`
  - `lastImportResult`
  - `selectedCharacter`
  - `hasCharacters`
  - `importCharacter(input)`
  - `selectCharacter(id)`
  - `removeCharacter(id)`
  - `clearCharacters()`
- `characterFileImportService` 已能处理浏览器 File 到 import input。

### Recommended Branch

```text
reforge/characters-view
```

### Read First

- `app/src/views/CharactersView.vue`
- `app/src/views/HomeView.vue`
- `app/src/stores/characterStore.ts`
- `app/src/stores/characterStore.test.ts`
- `app/src/services/characterFileImportService.ts`
- `app/src/contracts/character.ts`
- `app/src/ui-kit/index.ts`

### Allowed Writes

- `app/src/views/CharactersView.vue`
- `app/src/stores/characterStore.test.ts` 仅当需要补测试
- `app/src/contracts/character.ts` 仅当现有契约不够,新增项必须标 `// DRAFT: 待主干评审`

### Forbidden Writes

- 不改 parser 来支持新格式。
- 不支持 YAML/CHARX/BYAF。
- 不调用 SillyTavern legacy DOM import。
- 不改 `public/`。
- 不让角色页面直接发送聊天消息。

### Implementation Steps

1. 阅读 `HomeView.vue` 的角色导入部分,确认如何处理 file input。
2. 在 `CharactersView.vue` 接入 `useCharacterStore()`。
3. 建立 file input,支持 `.json` 和 `.png`。
4. 选择文件后调用现有 file import service,再走 `store.importCharacter(...)`。
5. 显示导入结果:
   - 成功:角色名、来源文件、warnings。
   - 失败:错误 message。
6. 显示角色列表:
   - 名称
   - 来源文件
   - 导入时间
   - warnings 数量
   - selected 状态
7. 点击列表项调用 `store.selectCharacter(id)`。
8. 提供删除按钮,调用 `store.removeCharacter(id)`。
9. 提供清空列表按钮,调用 `store.clearCharacters()`。
10. 显示当前角色详情:
    - name
    - description
    - first message/greeting
    - scenario/personality 等放折叠区。
11. 处理空状态:没有角色时提示导入,不要显示大段说明。
12. 移动端列表用卡片/列表,不要用宽表格。

### Acceptance

- 用户能在 `/characters` 导入 JSON 角色卡。
- 用户能在 `/characters` 导入 PNG 角色卡。
- 导入成功后自动选中新角色。
- 用户能切换当前角色。
- 用户能删除角色。
- 导入失败有可读提示。
- 375px 宽度不横向溢出。

### Verification

```bash
cd app
npm run type-check
npm run test
```

如补测试,重点覆盖:

- 导入后选中。
- 删除选中角色后的 fallback 选择。
- clearCharacters。

### Done Report

```text
任务:CharactersView 产品化
分支:reforge/characters-view
实现了什么:
新增/修改文件:
契约变更:
验证结果:
移动端/深色主题检查:
遗留问题:
需要主干协调:
关键假设:
```

## 5. Card 3 · WorldbooksView 产品化

### Goal

把 `/worldbooks` 从占位页变成世界书导入、选择和注入预览页面,让用户能导入 JSON 世界书并选择当前激活世界书。

### Start State

- `app/src/views/WorldbooksView.vue` 目前是占位说明页。
- `/dev` 已有世界书导入和 active lore preview 可参考。
- `worldbookStore` 已存在:
  - `worldbooks`
  - `selectedWorldbookId`
  - `lastImportResult`
  - `selectedWorldbook`
  - `hasWorldbooks`
  - `importWorldbook(input)`
  - `selectWorldbook(id)`
  - `removeWorldbook(id)`
  - `clearWorldbooks()`
- `worldbookLoreContextService` 已有注入计算能力。

### Recommended Branch

```text
reforge/worldbooks-view
```

### Read First

- `app/src/views/WorldbooksView.vue`
- `app/src/views/HomeView.vue`
- `app/src/stores/worldbookStore.ts`
- `app/src/stores/worldbookStore.test.ts`
- `app/src/services/worldbookFileImportService.ts`
- `app/src/services/worldbookLoreContextService.ts`
- `app/src/contracts/worldbook.ts`
- `app/src/contracts/chat.ts`
- `app/src/ui-kit/index.ts`

### Allowed Writes

- `app/src/views/WorldbooksView.vue`
- `app/src/stores/worldbookStore.test.ts` 仅当需要补测试
- `app/src/contracts/worldbook.ts` 仅当现有契约不够,新增项必须标 `// DRAFT: 待主干评审`

### Forbidden Writes

- 不扩展 worldbook 引擎匹配规则。
- 不做完整世界书编辑器。
- 不支持非 JSON 格式。
- 不改 `worldbookLoreContextService.ts`,除非只是修明确 bug 并补测试。
- 不改 `public/`。

### Implementation Steps

1. 阅读 `HomeView.vue` 的世界书导入和 active lore preview 部分。
2. 在 `WorldbooksView.vue` 接入 `useWorldbookStore()`。
3. 建立 file input,支持 `.json`。
4. 选择文件后调用现有 file import service,再走 `store.importWorldbook(...)`。
5. 显示导入结果:
   - 成功:世界书名、entry 数、warnings。
   - 失败:错误 message。
6. 显示世界书列表:
   - 名称
   - 来源
   - entry 总数
   - enabled 数
   - selected 状态
7. 点击列表项调用 `store.selectWorldbook(id)`。
8. 提供删除和清空。
9. 当前世界书详情展示:
   - entry 总数
   - enabled 数
   - constant 数
   - primary key 覆盖情况
   - 前若干条 enabled entries 的摘要。
10. 轻量注入预览可以基于现有 service 或静态摘要,重点让用户知道"哪些内容可能参与 prompt"。
11. 长 content 必须折叠或截断,避免移动端撑爆。

### Acceptance

- 用户能在 `/worldbooks` 导入 JSON 世界书。
- 导入成功后自动选中新世界书。
- 用户能切换当前世界书。
- 用户能删除世界书。
- 失败和 warnings 有可读提示。
- 页面不新增 worldbook 规则。
- 375px 宽度不横向溢出。

### Verification

```bash
cd app
npm run type-check
npm run test
```

如补测试,重点覆盖:

- 导入后选中。
- 删除选中世界书后的 fallback 选择。
- clearWorldbooks。

### Done Report

```text
任务:WorldbooksView 产品化
分支:reforge/worldbooks-view
实现了什么:
新增/修改文件:
契约变更:
验证结果:
移动端/深色主题检查:
遗留问题:
需要主干协调:
关键假设:
```

## 6. Card 4 · SettingsView 第一版

### Goal

把 `/settings` 从占位页变成简单/高级设置框架,为后续参数配置留出空间,但不阻塞聊天闭环。

### Start State

- `app/src/views/SettingsView.vue` 目前是占位说明页。
- 当前没有正式 settings store。
- ui-kit 已有 `Collapse`、`Switch`、`Input`、`Select` 等组件。

### Recommended Branch

```text
reforge/settings-polish
```

### Read First

- `app/src/views/SettingsView.vue`
- `app/src/ui-kit/index.ts`
- `app/src/contracts/ui.ts`
- `docs/refactor/M1-product-plan.md` 中 B6

### Allowed Writes

- `app/src/views/SettingsView.vue`
- `app/src/contracts/settings.ts` 仅当确实需要新增设置契约,并标 `// DRAFT: 待主干评审`

### Forbidden Writes

- 不新增 settings store,除非主干协调明确批准。
- 不改 chat/worldbook/connection 参数契约。
- 不新增 npm 依赖。
- 不引入其它 UI 框架。

### Implementation Steps

1. 使用 ui-kit 做页面结构。
2. 做一个"Simple"区域:
   - 常用偏好占位,例如 compact mode / show diagnostics 等本地 UI 状态。
   - 如果没有真实 store,必须在文案或状态上明确未接入。
3. 做一个"Advanced"区域:
   - 默认折叠。
   - 放采样参数、prompt 参数等未来位置的 placeholder。
   - 不把 placeholder 接到真实引擎。
4. 移动端保持单列。
5. 检查底部导航不会遮挡最后一项。
6. 不要写大段教学文案,页面要像工具页。

### Acceptance

- `/settings` 不再是纯占位。
- 默认只展示简单设置。
- 高级设置默认折叠。
- 未接入的设置不会误导用户以为已经生效。
- 375px 宽度不溢出。

### Verification

```bash
cd app
npm run type-check
npm run test
```

### Done Report

```text
任务:SettingsView 第一版
分支:reforge/settings-polish
实现了什么:
新增/修改文件:
契约变更:
验证结果:
移动端/深色主题检查:
遗留问题:
需要主干协调:
关键假设:
```

## 7. Card 5 · ChatView 基础聊天闭环

### Goal

把 `/chat` 从占位页变成可以发送消息、显示回复、处理生成状态的基础聊天页面。

### Start State

- `app/src/views/ChatView.vue` 目前是占位说明页。
- `/dev` 已有聊天 workbench 可参考。
- `chatStore` 已存在:
  - sessions/messages/generation state
  - send user message through injectable adapter
  - runtime mode
  - streaming snapshots
  - abort
  - edit/delete/switch alternatives 等部分 action
- `characterStore` 提供当前选中角色。
- `worldbookStore` 提供当前选中世界书。
- `connectionStore` 提供 runtime handoff。

### Recommended Branch

```text
reforge/chat-basic
```

### Dependencies

建议在这些任务之后合入:

- `ConnectionView 产品化`
- `CharactersView 产品化`

可以提前开发,但合入前要确认 store/contract 没冲突。

### Read First

- `app/src/views/ChatView.vue`
- `app/src/views/HomeView.vue`
- `app/src/stores/chatStore.ts`
- `app/src/stores/chatStore.test.ts`
- `app/src/stores/characterStore.ts`
- `app/src/stores/connectionStore.ts`
- `app/src/stores/worldbookStore.ts`
- `app/src/services/chatGenerationService.ts`
- `app/src/services/chatRuntimeService.ts`
- `app/src/services/worldbookLoreContextService.ts`
- `app/src/contracts/chat.ts`
- `app/src/contracts/engine.ts`
- `app/src/ui-kit/index.ts`

### Allowed Writes

- `app/src/views/ChatView.vue`
- `app/src/stores/chatStore.test.ts` 仅当需要补测试
- `app/src/services/chatGenerationService.test.ts` 仅当需要补测试
- `app/src/contracts/chat.ts` 仅当现有契约不够,新增项必须标 `// DRAFT: 待主干评审`

### Forbidden Writes

- 第一版不实现完整 swipe/regenerate/continue。
- 不改 `runtimeAdapterLoader.ts`。
- 不改 direct backend adapter。
- 不绕过 `connectionStore` 读取密钥。
- 不让 chat 页面直接 import parser。
- 不操作 legacy DOM。

### Implementation Steps

1. 阅读 `HomeView.vue` 的聊天区域,识别可复用逻辑。
2. 在 `ChatView.vue` 接入:
   - `useChatStore()`
   - `useCharacterStore()`
   - `useConnectionStore()`
   - `useWorldbookStore()`
3. 建立 computed:
   - current session
   - current messages
   - selected character
   - selected worldbook
   - connection handoff
   - can send
4. 建立 message timeline:
   - user message
   - assistant message
   - generating state
   - failed state
5. 建立 composer:
   - textarea
   - send button
   - stop button
   - empty message guard
6. 发送时组装:
   - content
   - selected character context
   - selected lorebook context
   - generation options
   - demo adapter or runtime options
7. 没有 API 配置时,显示去 `/connection` 的操作。
8. 没有角色时,显示去 `/characters` 的操作,但不要阻止 demo 聊天除非 store 当前要求。
9. generation 中禁用重复发送。
10. stop 调用 chat store 的 abort/cancel 能力。
11. streaming snapshot 要实时更新 assistant message。
12. composer 移动端不能被底部导航遮挡。

### Acceptance

- `/chat` 可以显示会话消息。
- demo 模式可以发送并显示回复。
- runtime ready 时可以尝试真实发送。
- 生成中显示状态。
- 生成中可以停止。
- 失败时有错误提示。
- 空消息不能发送。
- 当前角色和世界书状态在页面上清晰可见。
- 375px 宽度 composer 可用。

### Verification

```bash
cd app
npm run type-check
npm run test
```

如补测试,重点覆盖:

- empty message guard。
- generation in progress guard。
- streaming snapshot 合入 assistant message。
- abort 后状态。

### Done Report

```text
任务:ChatView 基础聊天闭环
分支:reforge/chat-basic
实现了什么:
新增/修改文件:
契约变更:
验证结果:
移动端/深色主题检查:
遗留问题:
需要主干协调:
关键假设:
```

## 8. Card 6 · Runtime-E2E 真实同源验证

### Goal

用真实 SillyTavern backend 和真实 OpenAI-compatible 配置验证 runtime inspect、direct backend seam、流式生成和停止行为。

### Start State

- `docs/refactor/M0-engine-adapter-spike.md` 已记录 runtime inspect 通过。
- 真实 API 流式生成还未完成最终记录。
- 需要用户提供 base URL、model、API key。

### Recommended Branch

```text
reforge/runtime-e2e
```

### Dependencies

建议在这些任务可用后执行:

- `ConnectionView 产品化`
- `ChatView 基础聊天闭环`

如果页面还没合入,可先在 `/dev` 验证。

### Read First

- `docs/refactor/M0-engine-adapter-spike.md`
- `docs/decisions/ADR-003-accept-direct-backend-chat-completions-seam.md`
- `docs/decisions/ADR-004-use-hidden-same-origin-runtime-host.md`
- `app/vite.config.ts`
- `app/src/engine-adapter/directBackendChatCompletionAdapter.ts`
- `app/src/engine-adapter/legacyRuntimeHost.ts`
- `app/src/stores/connectionStore.ts`
- `app/src/stores/chatStore.ts`

### Allowed Writes

- `docs/refactor/M0-engine-adapter-spike.md`
- `app/src/engine-adapter/*.ts` 仅当发现明确 bug
- `app/src/engine-adapter/*.test.ts` 修 bug 时必须补
- `app/src/stores/chatStore.test.ts` 仅当发现 chat runtime 状态 bug

### Forbidden Writes

- 不把 API key 写进任何文件。
- 不提交测试用真实 base URL/key。
- 不改 `public/`。
- 不调用 `Generate()`。
- 不把 direct backend seam 换成 legacy settings mutation。

### Implementation Steps

1. 启动真实 SillyTavern backend,通常是:

   ```bash
   npm run start
   ```

   或按当前项目已有方式启动到 `http://127.0.0.1:8000`。

2. 启动 Reforged Vite:

   ```bash
   cd app
   ST_REFORGED_ST_ORIGIN=http://127.0.0.1:8000 npm run dev
   ```

3. 打开 Reforged app。
4. 运行 runtime inspect,确认通过。
5. 配置 OpenAI-compatible:
   - base URL
   - model
   - API key
6. 发送一条短消息。
7. 观察:
   - 是否开始 streaming。
   - assistant message 是否增量更新。
   - complete 事件是否正常。
   - stop 是否能 abort。
   - 失败时错误是否可读。
8. 检查 API key:
   - 不在 Pinia state。
   - 不在控制台日志。
   - 不在文档。
9. 把结果写入 `docs/refactor/M0-engine-adapter-spike.md`。
10. 如果发现 bug,最小修复并补测试。

### Acceptance

- runtime inspect 通过。
- 至少一次真实发送有明确结果:
  - 成功流式回复;或
  - 明确记录卡点和错误。
- 文档记录验证日期、环境、结果、剩余风险。
- 没有泄露 API key。

### Verification

```bash
cd app
npm run type-check
npm run test
```

### Done Report

```text
任务:Runtime-E2E 真实同源验证
分支:reforge/runtime-e2e
验证环境:
真实发送结果:
流式结果:
停止生成结果:
新增/修改文件:
契约变更:
验证结果:
遗留问题:
需要主干协调:
关键假设:
```

## 9. Card 7 · Chat-Actions 高级聊天操作

### Goal

在基础 `/chat` 已可用之后,补齐 regenerate、continue、swipe、retry、编辑、删除等聊天高级操作。

### Start State

- `ChatView 基础聊天闭环` 已合入。
- `chatStore` 已有 assistant alternatives/swipes 相关状态和部分 action。
- 需要把 store 能力做成可用 UI,不足处再小范围补 store action。

### Recommended Branch

```text
reforge/chat-actions
```

### Dependencies

必须等 `reforge/chat-basic` 合入后再开工或至少 rebase 到该分支。

### Read First

- `app/src/views/ChatView.vue`
- `app/src/stores/chatStore.ts`
- `app/src/stores/chatStore.test.ts`
- `app/src/contracts/chat.ts`
- `app/src/services/chatRuntimeService.ts`
- `app/src/ui-kit/index.ts`

### Allowed Writes

- `app/src/views/ChatView.vue`
- `app/src/stores/chatStore.ts` 仅当现有 action 不足
- `app/src/stores/chatStore.test.ts`
- `app/src/contracts/chat.ts` 仅当现有契约不够,新增项必须标 `// DRAFT: 待主干评审`

### Forbidden Writes

- 不重写整个 chat store。
- 不改 connection/characters/worldbooks 页面。
- 不改 engine-adapter 架构。
- 不新增依赖。

### Implementation Steps

1. 列出现有 `chatStore` 已支持的 action。
2. 在 `ChatView.vue` 为每条消息增加紧凑操作区:
   - assistant: regenerate、continue、swipe left/right、retry failed、delete。
   - user: edit、delete。
3. swipe 操作切换 `activeAlternativeIndex`。
4. regenerate 以当前上下文重新请求 assistant 回复。
5. continue 以当前 assistant 内容作为延续上下文。
6. retry 针对 failed 状态重新触发。
7. 编辑用户消息后,状态要清楚;如果需要重跑后续回复,先做明确按钮,不要自动悄悄重跑。
8. 删除消息前确认或提供清晰可逆/不可逆提示。
9. 移动端操作按钮使用图标或短标签,保证不挤爆。
10. 给新增 store 行为补测试。

### Acceptance

- demo adapter 下:
  - regenerate 可用。
  - continue 可用。
  - swipe alternatives 可用。
  - retry failed 可用。
  - edit/delete 可用。
- runtime 模式不破坏基础发送。
- alternatives 状态正确。
- 生成中不允许互相冲突的操作。
- 移动端操作区不溢出。

### Verification

```bash
cd app
npm run type-check
npm run test
```

### Done Report

```text
任务:Chat-Actions 高级聊天操作
分支:reforge/chat-actions
实现了什么:
新增/修改文件:
契约变更:
验证结果:
移动端/深色主题检查:
遗留问题:
需要主干协调:
关键假设:
```

## 10. Card 8 · Product-QA M1 端到端验收

### Goal

在主要功能合入后,从用户角度跑通 M1 Demo,修小范围 UI/polish 问题,确认 `/dev` 不再是核心路径。

### Start State

- ConnectionView、CharactersView、WorldbooksView、ChatView 基础功能已合入。
- Runtime-E2E 最好已经有结果。
- Chat-Actions 可已合入或正在合入。

### Recommended Branch

```text
reforge/product-qa
```

### Read First

- `docs/refactor/M1-product-plan.md`
- `docs/refactor/M1-parallel-agent-plan.md`
- `docs/refactor/M1-goal-cards.md`
- `app/src/components/AppShell.vue`
- `app/src/views/ConnectionView.vue`
- `app/src/views/CharactersView.vue`
- `app/src/views/ChatView.vue`
- `app/src/views/WorldbooksView.vue`
- `app/src/views/SettingsView.vue`

### Allowed Writes

- `app/src/views/*.vue` 仅限小范围 polish
- `app/src/components/AppShell.vue` 仅限导航/布局小问题
- `docs/refactor/M1-product-plan.md` 仅用于更新验收状态
- `docs/refactor/M1-goal-cards.md` 仅用于记录发现的任务卡缺口

### Forbidden Writes

- 不新增大功能。
- 不重构 store/service。
- 不改 engine-adapter 架构。
- 不新增依赖。
- 不改 `public/`。

### Implementation Steps

1. 启动 dev server:

   ```bash
   cd app
   npm run dev
   ```

2. 桌面宽度跑:
   - `/connection` 配置 API 或 demo 状态。
   - `/characters` 导入角色。
   - `/chat` 发送消息。
   - `/worldbooks` 导入并选择世界书。
   - 回 `/chat` 发送消息。
3. 375px 宽度重复上述流程。
4. 检查:
   - 导航是否清晰。
   - 输入框是否被底部导航挡住。
   - 按钮是否够大。
   - 长文本是否溢出。
   - 空状态是否明确。
   - 错误状态是否可读。
   - 深色主题对比度是否足够。
5. 只修小范围 UI/polish。
6. 把无法小修的问题记录到后续任务。

### Acceptance

- 用户可以不进入 `/dev` 完成主流程。
- 移动端 375px 可完成主流程。
- 桌面端布局清楚。
- 没有明显文字溢出或遮挡。
- `/dev` 只作为 debug 入口。

### Verification

```bash
cd app
npm run type-check
npm run test
```

如能做浏览器验证,记录:

- 桌面 viewport。
- 手机 viewport。
- 主要问题和修复。

### Done Report

```text
任务:Product-QA M1 端到端验收
分支:reforge/product-qa
跑通流程:
移动端结果:
桌面端结果:
修复了什么:
新增/修改文件:
验证结果:
遗留问题:
需要主干协调:
关键假设:
```

## 11. 推荐分派顺序

### 只有 1 个 agent

```text
1. ConnectionView
2. CharactersView
3. ChatView 基础聊天
4. Runtime-E2E
5. WorldbooksView
6. Chat-Actions
7. SettingsView
8. Product-QA
```

### 有 2 个 agent

第一轮:

```text
Agent A:ConnectionView
Agent B:CharactersView
```

第二轮:

```text
Agent A:ChatView 基础聊天
Agent B:WorldbooksView
```

第三轮:

```text
Agent A:Runtime-E2E
Agent B:SettingsView
```

第四轮:

```text
Agent A:Chat-Actions
Agent B:Product-QA
```

### 有 4 个 agent

第一轮:

```text
Agent A:ConnectionView
Agent B:CharactersView
Agent C:WorldbooksView
Agent D:SettingsView
```

第二轮:

```text
Agent A:ChatView 基础聊天
Agent B:Runtime-E2E 准备
Agent C:等待合流后补 worldbook/chat 接线检查
Agent D:等待合流后做移动端 polish
```

第三轮:

```text
Agent A:Chat-Actions
Agent B:Runtime-E2E 完整验证
Agent C:Product-QA
Agent D:文档/状态更新
```

## 12. 哪些任务不能并发

这些不要同时改:

- `ChatView 基础聊天` 和 `Chat-Actions`
- `Runtime-E2E` 的 adapter 修复 和另一个 agent 的 engine-adapter 修改
- 多个 agent 同时改 `app/src/contracts/chat.ts`
- 多个 agent 同时改 `app/src/components/AppShell.vue`
- 任何页面 agent 和协调 agent 同时改同一个契约文件

如果发生,先暂停其中一个任务,由 M1-Coord 拆出公共协调任务。

## 13. 最终 M1 Done 定义

M1 不能只看测试绿,必须满足用户流程:

1. 打开 App。
2. 在 `/connection` 配置或确认 runtime 状态。
3. 在 `/characters` 导入并选择角色。
4. 在 `/chat` 发送消息。
5. 看到回复,最好是流式。
6. 在 `/worldbooks` 导入并选择世界书。
7. 回到 `/chat` 再发消息,世界书上下文参与 prompt。
8. 在 375px 手机上也能完成以上流程。
9. `/dev` 只作为调试入口,不是必经路径。

完成后,协调 agent 更新 `docs/refactor/M1-product-plan.md` 的 M1 验收状态。
