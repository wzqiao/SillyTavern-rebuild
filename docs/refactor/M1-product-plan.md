# M1 产品化计划(下一阶段)· ST-Reforged

> 配合 `AGENTS.md`(架构铁律 + worktree 协作规则)与 `docs/REFACTOR-PRD.md` 使用。
> 主线基线:`reforge/main` @ `3da0fcb2d`(已整合最全引擎/worldbook 链路,质量门绿:type-check + 174 测试)。

## 0. 现状与本阶段目标

**现状(实测)**:M0 地基 ~80%——engine-adapter(headless 复用 + direct backend seam)、角色/世界书导入解析、chat/connection/worldbook stores、runtime streaming、worldbook 注入链路都已具备且有测试。**但 UI 仍是单文件 workbench(`HomeView.vue` 1000+ 行),`ui-kit` 为空,真机实测未做。**

**本阶段目标**:从"功能切片堆叠"转向"**产品化闭环**"——让用户真的能在一个**现代、响应式、移动友好**的界面里完成:
> **打开 → 配 API → 导入角色 → 聊天(流式)→ swipe/regenerate → 选世界书看到注入生效。**

## 1. 纪律(重要)
- ⛔ **停止给 worldbook 引擎加新细节**(recursion/token-budget/group 等已足够);仅当为 UI 编辑器服务时才动。
- ✅ 严格遵循 `AGENTS.md`:headless 复用、不碰 ST DOM、不改 `public/`、接口先行、模块边界、自验证(type-check + test)。
- ✅ 每个任务一个 worktree + `reforge/<module>` 分支;小步提交;完成按 AGENTS 格式汇报。

---

## 2. 任务卡

### 阶段 A · M0 收尾(真机实测,解锁"复用引擎"实证)

**A1 · 同源真机实测闭环**
- 目标:在与 ST **同源**的真实运行环境验证引擎复用,把 M0 从 80%→100%。
- 范围:`vite.config.ts` 的 `@sillytavern/*` URL 映射校验;新增同源加载方式(ST 后端 serve `app/dist`,或 dev 反代);采集真实 `adapter.inspect({probeContext:true})` 输出;跑通一次真实 OpenAI 兼容生成 + 流式。
- 依赖:`engine-adapter/*` 现有实现。
- 产出:把实测结果补进 `docs/refactor/M0-engine-adapter-spike.md` 的 §Remaining;盘点因缺失 legacy DOM 节点导致的 import 失败,决定是否需要"隐藏兼容层"。
- ⚠️ 真实生成那一步需要用户提供 base URL/model/key —— 把"能同源加载 + inspect 通过"做到位,真实 send 留一个可一键验证的入口。
- 验收:同源环境下 `inspect().ok === true`;附上一次真实流式生成的记录(或明确卡点)。

---

### 阶段 B · M1 产品化闭环

**B1 · ui-kit 基础组件库**(地基,优先)
- 目标:移动优先、深色主题的通用组件,支撑所有页面。
- 范围:`app/src/ui-kit/` —— Button、Input、Textarea、Select、Switch、Modal、Drawer、Spinner、Toast、ListItem、Tabs、Collapse(用于渐进披露)。每个组件 TS props 类型 + vitest/示例。
- 依赖:无(纯展示);通用类型放 `contracts/ui.ts`。
- 验收:type-check 绿;组件在窄屏(375px)/宽屏均正常;深色主题统一。

**B2 · 应用外壳 + 路由布局**(地基,优先)
- 目标:响应式 AppShell + 多页面路由,取代单一 workbench。
- 范围:`app/src/components/AppShell.vue` + `router/index.ts` —— 桌面侧栏 / 移动底栏导航;路由:`/chat` `/characters` `/worldbooks` `/connection` `/settings`。
- 依赖:B1(导航用 ui-kit)。
- 验收:窄屏底栏、宽屏侧栏自适应;路由切换正常;type-check 绿。

**B3 · 页面拆分**(依赖 B1+B2,可多 worktree 并行)
- 把 `HomeView.vue` 巨石拆成独立页面,各自只接 store + ui-kit,不互相耦合:
  - `views/ChatView.vue` —— 聊天主界面(消息流、composer、流式渲染)
  - `views/CharactersView.vue` —— 角色导入/选择/管理(接 characterStore)
  - `views/ConnectionView.vue` —— 见 B5
  - `views/WorldbooksView.vue` —— 世界书库 + 激活预览(接 worldbookStore)
  - `views/SettingsView.vue` —— 见 B6
- 验收:各页面独立可用;`HomeView` workbench 退役或降级为 `/dev` 调试页;type-check + test 绿。

**B4 · 发送体验**(在 ChatView 内,依赖 B3)
- 目标:把 chatStore 已有能力做成完整交互。
- 范围:发送、停止、流式增量渲染、**swipe(左右切 alternatives)**、**regenerate**、**continue**、编辑、删除、重试。
- 依赖:`contracts/chat.ts`(alternatives/swipes/pending 形状已就绪)、`ui-kit`。
- 验收:demo 适配器下全部交互可用;移动端触控顺手;type-check + test 绿。

**B5 · 连接配置产品化**(ConnectionView,依赖 B3)
- 目标:从 draft panel → 引导式配置。
- 范围:选 provider(OpenAI 兼容优先)、填 base URL/model/key、**测试连接**、状态提示、应用为 runtime。沿用 ADR-003 内存态密钥纪律(key 不进 Pinia 可序列化态)。
- 依赖:`connectionStore`、`engine-adapter` direct backend seam。
- 验收:配置后 Runtime 模式可达 `ready-to-attempt`;错误态有清晰提示。

**B6 · 移动 polish + 设置渐进披露**(SettingsView,依赖 B1)
- 目标:落实"渐进式披露"原则。
- 范围:设置分"简单 / 高级"两档,默认极简(只露常用项),高级项 Collapse 收起;采样参数等归到高级;全局移动端间距/触控/安全区 polish。
- 验收:新手默认界面无参数过载;高级项可展开;窄屏体验顺畅。

---

## 3. 并行建议(worktree 波次)
- **第一波(地基,2 个并行)**:B1 ui-kit、B2 AppShell+路由。
- **第二波(页面,依赖第一波,可 3-4 个并行)**:B3 各页面 + B4 发送体验 + B5 连接 + B6 设置。
- **A1 真机实测**:与 B 波并行推进,但真实 send 验证需用户给 API 配置。
- 每波结束:合回 `reforge/main`,跑 type-check + test 绿,再开下一波。

## 4. 本阶段验收(M1 Demo 一条龙)
打开 app → 进 `/connection` 配 API → 进 `/characters` 导入一张 V2/V3 角色卡并选中 → 进 `/chat` 发消息看到**流式回复** → swipe/regenerate 可用 → 进 `/worldbooks` 选一本世界书,回聊天发消息能看到**注入生效**。**全程响应式、移动可用、无 workbench 痕迹。**
