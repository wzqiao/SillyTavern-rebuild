# M1 并发开发指导 · ST-Reforged

> 适用基线:`reforge/main` @ `6be9264a9`(2026-06-09)。
> 配合 `AGENTS.md`、`docs/REFACTOR-PRD.md`、`docs/refactor/M1-product-plan.md` 使用。

## 0. 当前状态一句话

项目已经从 M0 的"能跑实验台"进入 M1 的"正式 App 产品化"阶段:

- `/dev` 仍是功能最完整的 M0 workbench。
- `/chat`、`/characters`、`/worldbooks`、`/connection`、`/settings` 已有正式路由和 AppShell,但多数还是占位页。
- `ui-kit` 基础组件已存在。
- `characterStore`、`worldbookStore`、`connectionStore`、`chatStore` 和 engine-adapter 已有测试覆盖。
- 当前质量门: `npm run type-check` 通过,`npm run test` 通过(193 tests)。

M1 的核心任务是:**把 `/dev` 里的真实功能拆进正式页面,形成完整产品闭环。**

完整闭环:

```text
/connection 配 API
  -> /characters 导入并选择角色
  -> /chat 发送消息并看到流式回复
  -> /worldbooks 导入并激活世界书
  -> /chat 再次发送,看到世界书注入生效
```

## 1. 并发开发总原则

### 1.1 不共享写入同一个文件

每个 agent 只写自己任务卡列出的文件。没有明确授权时,不要改:

- `app/package.json`
- `app/package-lock.json`
- `app/vite.config.ts`
- `app/tsconfig*`
- `app/src/main.ts`
- `app/src/router/index.ts`
- `app/src/App.vue`
- `public/`

确实需要改公共基座时,不要在任务分支里直接改,在汇报里交给主干协调 agent。

### 1.2 先吃现有契约,不要互相 import 内部实现

页面和模块之间只通过这些层交互:

- `app/src/contracts/`
- `app/src/stores/`
- `app/src/services/`
- `app/src/ui-kit/`
- `app/src/engine-adapter/`

不要让一个页面直接依赖另一个页面的内部实现。比如 `/chat` 不应 import `ConnectionView.vue`。

### 1.3 `/dev` 是参考,不是最终形态

可以读 `app/src/views/HomeView.vue` 来搬逻辑,但不要把新的正式页面做成另一个巨型 workbench。

拆分目标:

- `/connection`:只负责连接配置和 runtime readiness。
- `/characters`:只负责角色导入、列表、选择、详情。
- `/chat`:只负责消息、composer、生成控制和聊天状态。
- `/worldbooks`:只负责世界书导入、激活、预览。
- `/settings`:只负责设置分层和移动端 polish。

### 1.4 不继续扩 worldbook 引擎

worldbook 引擎能力已经足够 M1。除非 UI 编辑器必须新增字段契约,否则不要继续给 `worldbookLoreContextService` 加规则细节。

### 1.5 每个 agent 必须自验证

每个任务完成前至少运行:

```bash
cd app
npm run type-check
npm run test
```

组件或页面任务还要人工确认:

- 375px 宽度可用。
- 深色主题下文字可读。
- 底部导航不遮挡主要操作。
- 按钮/输入框触控尺寸合理。

## 2. 推荐 worktree / 分支

每个任务一个独立 worktree 和分支。分支命名:

```text
reforge/<task-name>
```

推荐:

```text
reforge/m1-coordination
reforge/connection-view
reforge/characters-view
reforge/chat-basic
reforge/worldbooks-view
reforge/chat-actions
reforge/settings-polish
reforge/runtime-e2e
```

合流顺序不要按完成时间硬合。优先合:

1. 不改公共基座、文件边界清楚的 leaf page。
2. 契约变更最少的任务。
3. 依赖已经落地的任务。

## 3. Wave 0 · 主干协调与契约冻结

### Agent M1-Coord · 协调/合流

**目标**:确保并发开发不会互相踩文件,并在每轮合并后维持质量门全绿。

**可写范围**:

- `docs/refactor/*.md`
- `docs/decisions/*.md`
- `app/src/contracts/*.ts` 仅用于合并各 agent 明确申请的契约草案
- 必要时协调改 `router` / `AppShell`,但这应该很少发生

**只读参考**:

- `AGENTS.md`
- `docs/REFACTOR-PRD.md`
- `docs/refactor/M1-product-plan.md`
- `app/src/contracts/`
- `app/src/router/index.ts`

**任务**:

1. 维护本文件和任务状态。
2. 审核各 agent 的契约变更申请。
3. 合并前检查是否有人修改公共基座。
4. 每次合并后运行:

   ```bash
   cd app
   npm run type-check
   npm run test
   ```

**验收**:

- 主干始终能跑 type-check/test。
- 冲突文件和契约变更都有记录。
- 不把未验证的大改直接合入 `reforge/main`。

## 4. Wave 1 · 可以立即并发的页面接线

Wave 1 的原则:各 agent 使用已有 store/service/ui-kit,各自只改一个正式页面,不改 router。

### Agent Connection · `/connection` 产品化

**目标**:把连接配置从 `/dev` 搬到正式 `/connection` 页面。

**建议分支**:`reforge/connection-view`

**可写范围**:

- `app/src/views/ConnectionView.vue`
- `app/src/stores/connectionStore.test.ts` 如需补测试
- `app/src/contracts/connection.ts` 仅在确实缺字段时新增 `// DRAFT: 待主干评审`

**只读依赖**:

- `app/src/stores/connectionStore.ts`
- `app/src/contracts/connection.ts`
- `app/src/ui-kit/`
- `app/src/views/HomeView.vue`

**要实现**:

- provider 选择,先只支持 `openai-compatible`。
- base URL、model、API key 输入。
- API key 仍只进入 transient vault,不得进 Pinia 可序列化 state/action payload。
- 显示 handoff 状态:
  - `empty`
  - `incomplete`
  - `complete-unapplied`
  - `applied-but-unwired`
  - `ready-to-attempt`
- "应用配置"按钮。
- 清楚展示 validation issue。
- 如果"测试连接"暂时无法真实测试,显示为未接入或禁用,不要假装成功。

**不要做**:

- 不改 direct backend seam。
- 不写入 localStorage/sessionStorage。
- 不把 key 打印到日志、错误详情或 UI。

**验收**:

- `/connection` 可独立完成配置并应用。
- 离开页面再回来,非密钥字段状态合理,key 只显示 masked metadata。
- `npm run type-check` / `npm run test` 通过。

### Agent Characters · `/characters` 产品化

**目标**:把角色导入、列表、选择搬到正式 `/characters` 页面。

**建议分支**:`reforge/characters-view`

**可写范围**:

- `app/src/views/CharactersView.vue`
- `app/src/stores/characterStore.test.ts` 如需补测试
- `app/src/contracts/character.ts` 仅在确实缺字段时新增 `// DRAFT: 待主干评审`

**只读依赖**:

- `app/src/stores/characterStore.ts`
- `app/src/services/characterFileImportService.ts`
- `app/src/contracts/character.ts`
- `app/src/ui-kit/`
- `app/src/views/HomeView.vue`

**要实现**:

- JSON / PNG 角色卡导入入口。
- 角色列表。
- 当前选中角色状态。
- 角色摘要卡:
  - name
  - description
  - first message / greeting
  - scenario/personality 等高级信息可折叠。
- 导入失败和 warnings 的可读提示。

**不要做**:

- 不支持 YAML/CHARX/BYAF,除非另有任务。
- 不调用 SillyTavern legacy DOM import。
- 不让 `/characters` 直接控制聊天发送。

**验收**:

- 用户能在 `/characters` 导入并选中角色。
- 选中状态可被 chat store 使用。
- 移动端列表可读,不会横向溢出。
- `npm run type-check` / `npm run test` 通过。

### Agent Worldbooks · `/worldbooks` 产品化

**目标**:把世界书导入、激活和注入预览搬到正式 `/worldbooks` 页面。

**建议分支**:`reforge/worldbooks-view`

**可写范围**:

- `app/src/views/WorldbooksView.vue`
- `app/src/stores/worldbookStore.test.ts` 如需补测试
- `app/src/contracts/worldbook.ts` 仅在确实缺字段时新增 `// DRAFT: 待主干评审`

**只读依赖**:

- `app/src/stores/worldbookStore.ts`
- `app/src/services/worldbookFileImportService.ts`
- `app/src/services/worldbookLoreContextService.ts`
- `app/src/contracts/worldbook.ts`
- `app/src/ui-kit/`
- `app/src/views/HomeView.vue`

**要实现**:

- JSON 世界书导入入口。
- 世界书列表。
- 当前选中世界书。
- entry 总数、enabled/constant/injection-ready 摘要。
- 轻量注入预览,重点展示"哪些内容可能参与 prompt",不要扩写引擎规则。
- 导入失败和 warnings 的可读提示。

**不要做**:

- 不新增 worldbook 引擎匹配规则。
- 不做完整世界书编辑器。
- 不改 `worldbookLoreContextService` 除非只是暴露 UI 需要的已有结果。

**验收**:

- 用户能在 `/worldbooks` 导入并选择世界书。
- `/chat` 后续可读取当前选中世界书。
- 移动端长 entry 内容不会撑爆布局。
- `npm run type-check` / `npm run test` 通过。

### Agent Settings · `/settings` 第一版

**目标**:先建立简单/高级设置框架,不要阻塞聊天闭环。

**建议分支**:`reforge/settings-polish`

**可写范围**:

- `app/src/views/SettingsView.vue`
- 如确实需要,新增 `app/src/contracts/settings.ts` 并标 `// DRAFT: 待主干评审`

**只读依赖**:

- `app/src/ui-kit/`
- `app/src/contracts/ui.ts`

**要实现**:

- 简单设置区。
- 高级设置区,默认折叠。
- 移动端间距、安全区、输入控件宽度 polish。
- 暂无 store 的设置项可以先做静态 UI 或本地组件状态,但必须标清未接入。

**不要做**:

- 不发明大量新设置。
- 不改 chat/worldbook 引擎参数契约。
- 不引入新 UI 框架。

**验收**:

- `/settings` 不再是纯占位。
- 高级项默认折叠。
- 375px 宽度无明显遮挡或溢出。
- `npm run type-check` / `npm run test` 通过。

## 5. Wave 2 · 聊天基础闭环

Wave 2 可以在 Wave 1 进行到后半段时启动,但合入前必须确认 `/connection`、`/characters` 的 store 状态没有改变契约。

### Agent Chat-Basic · `/chat` 基础聊天

**目标**:把 `/chat` 从占位页变成可聊天页面。

**建议分支**:`reforge/chat-basic`

**可写范围**:

- `app/src/views/ChatView.vue`
- `app/src/stores/chatStore.test.ts` 如需补测试
- `app/src/services/chatGenerationService.test.ts` 如需补测试
- `app/src/contracts/chat.ts` 仅在确实缺字段时新增 `// DRAFT: 待主干评审`

**只读依赖**:

- `app/src/stores/chatStore.ts`
- `app/src/stores/characterStore.ts`
- `app/src/stores/connectionStore.ts`
- `app/src/stores/worldbookStore.ts`
- `app/src/services/worldbookLoreContextService.ts`
- `app/src/ui-kit/`
- `app/src/views/HomeView.vue`

**要实现**:

- 消息 timeline。
- composer 输入框。
- 发送按钮。
- 停止生成按钮。
- pending / generating / failed 状态。
- demo adapter 发送路径。
- runtime adapter 发送路径,使用 connection handoff。
- 没有 API 配置时,引导去 `/connection`。
- 没有角色时,引导去 `/characters`。
- 发送时带上当前选中角色和世界书上下文。

**不要做**:

- 第一版不要做 swipe/regenerate/continue 的完整体验。
- 不修改 runtime adapter loader。
- 不绕过 connectionStore 直接读取密钥。

**验收**:

- `/chat` demo 模式可发消息并显示回复。
- runtime ready 时可尝试真实发送。
- streaming snapshot 能渲染到 assistant message。
- 生成中可以 abort。
- 移动端 composer 不被底部导航挡住。
- `npm run type-check` / `npm run test` 通过。

## 6. Wave 3 · 真实 runtime 验证

### Agent Runtime-E2E · 同源真实生成验证

**目标**:确认同源 runtime inspect + direct backend seam 可以跑真实 OpenAI-compatible 流式生成。

**建议分支**:`reforge/runtime-e2e`

**可写范围**:

- `docs/refactor/M0-engine-adapter-spike.md`
- 如发现 adapter bug:
  - `app/src/engine-adapter/*.ts`
  - 对应 `*.test.ts`

**只读依赖**:

- `docs/decisions/ADR-003-accept-direct-backend-chat-completions-seam.md`
- `docs/decisions/ADR-004-use-hidden-same-origin-runtime-host.md`
- `app/vite.config.ts`
- `app/src/engine-adapter/`
- `app/src/stores/connectionStore.ts`
- `app/src/stores/chatStore.ts`

**需要用户提供**:

- OpenAI-compatible base URL
- model
- API key

**要验证**:

1. 启动真实 SillyTavern backend,通常是 `http://127.0.0.1:8000`。
2. 启动 Reforged Vite:

   ```bash
   cd app
   ST_REFORGED_ST_ORIGIN=http://127.0.0.1:8000 npm run dev
   ```

3. 确认 runtime inspect passed。
4. 在 `/connection` 应用 API 配置。
5. 在 `/chat` 发送真实消息。
6. 确认流式回复、停止生成、失败提示。
7. 确认 API key 没有进入 Pinia 可序列化状态或日志。
8. 把结果写入 `docs/refactor/M0-engine-adapter-spike.md`。

**不要做**:

- 不把真实 key 写进任何文件。
- 不截图或记录完整密钥。
- 不改 SillyTavern `public/` 原码。

**验收**:

- 文档记录真实验证结果或明确卡点。
- 如果有修复,测试覆盖新增 bug。
- `npm run type-check` / `npm run test` 通过。

## 7. Wave 4 · 聊天高级操作

### Agent Chat-Actions · swipe / regenerate / continue

**目标**:补齐聊天体验高级操作。

**建议分支**:`reforge/chat-actions`

**依赖**:

- Wave 2 `Chat-Basic` 已合入。

**可写范围**:

- `app/src/views/ChatView.vue`
- `app/src/stores/chatStore.ts` 仅当现有 action 不足时
- `app/src/stores/chatStore.test.ts`
- `app/src/contracts/chat.ts` 仅在确实缺字段时新增 `// DRAFT: 待主干评审`

**要实现**:

- regenerate 上一条 assistant 回复。
- continue 当前 assistant 回复。
- swipe 左右切 alternatives。
- retry 失败请求。
- 编辑用户消息。
- 删除消息。
- 移动端触控优化。

**不要做**:

- 不在本任务里重构整个 chat store。
- 不改 connection/worldbook/character 页面。
- 不把高级操作和 worldbook 引擎规则耦合。

**验收**:

- demo adapter 下全部高级操作可用。
- runtime 模式至少不破坏基础发送。
- alternatives/swipes 状态正确。
- `npm run type-check` / `npm run test` 通过。

## 8. Wave 5 · 产品收尾与移动端验收

### Agent Product-QA · 端到端产品验收

**目标**:从用户视角跑通 M1 Demo 一条龙。

**建议分支**:`reforge/product-qa`

**可写范围**:

- 小范围页面 polish:
  - `app/src/views/*.vue`
  - `app/src/components/AppShell.vue`
- 验收文档:
  - `docs/refactor/M1-product-plan.md`
  - `docs/refactor/M1-parallel-agent-plan.md`

**要验证**:

- 375px 手机宽度。
- 桌面宽度。
- 深色主题。
- `/connection -> /characters -> /chat -> /worldbooks -> /chat` 完整流程。
- 没有 `/dev` 才能完成的关键用户流程。
- `/dev` 只作为调试入口保留。

**不要做**:

- 不在 QA 分支里引入大功能。
- 不新增 npm 依赖。
- 不改 engine-adapter 架构。

**验收**:

- M1 Demo 可以按顺序跑通。
- 主要页面无明显遮挡、溢出、不可点击状态。
- `npm run type-check` / `npm run test` 通过。

## 9. 合并检查清单

每个 agent 汇报时必须包含:

```text
任务:
分支:
实现了什么:
新增/修改文件:
契约变更:
验证结果:
移动端/深色主题检查:
遗留问题:
需要主干协调:
关键假设:
```

主干协调 agent 合并前检查:

- 是否改了未授权文件。
- 是否改了 `public/`。
- 是否新增 npm 依赖。
- 是否绕过 `contracts/` 直接耦合别的模块。
- 是否把 API key 写进 store state、日志、文档或测试 fixture。
- 是否运行 `npm run type-check` 和 `npm run test`。
- 是否有新增 `// DRAFT: 待主干评审` 契约需要统一。

## 10. 推荐合流节奏

推荐节奏:

```text
Wave 0:
  M1-Coord 常驻

Wave 1 并发:
  Connection
  Characters
  Worldbooks
  Settings

Wave 2:
  Chat-Basic
  可在 Wave 1 后半段启动,但合入放在 Connection/Characters 之后

Wave 3:
  Runtime-E2E
  需要用户 API 配置,可与 Chat-Basic 并行准备

Wave 4:
  Chat-Actions
  依赖 Chat-Basic 合入

Wave 5:
  Product-QA
  所有主要功能合入后进行
```

如果只能开 2 个 agent,优先:

1. `Connection`
2. `Characters`
3. `Chat-Basic`
4. `Worldbooks`
5. `Runtime-E2E`

如果能开 4 个 agent,第一波直接开:

1. `Connection`
2. `Characters`
3. `Worldbooks`
4. `Settings`

## 11. 成功标准

M1 完成时,用户不需要理解 `/dev` 也能完成:

1. 配 API。
2. 导入角色。
3. 聊天。
4. 看到流式回复。
5. 导入并激活世界书。
6. 回聊天后看到世界书注入生效。
7. 在手机宽度下完成以上流程。

`/dev` 可以保留,但只能作为调试入口,不能再是核心产品路径。
