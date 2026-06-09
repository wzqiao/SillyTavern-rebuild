# AGENTS.md · ST-Reforged 开发约定(Goal & Working Agreement)

> 重构工作区在 **`app/`**(全新 Vue3 前端)。分派给你的具体任务见 `docs/refactor/M1-product-plan.md` 或任务卡。

## 🎯 目标(Goal)
你正在参与 **ST-Reforged** —— SillyTavern 的重构版(hard fork,AGPL-3.0)。
终极目标:把"优秀的引擎"从"过时的外壳"里解放出来,做一个
**好用、现代、移动友好、可联机** 的角色扮演前端。
核心策略:**复用 SillyTavern 的生成引擎,用全新的 Vue3 前端重做整个 UI/UX。**

## 📚 动手前必读(以文档为准,本文件只提炼要点)
1. `docs/REFACTOR-PRD.md` —— 总蓝图(背景/架构/里程碑/模块划分)。
2. `docs/refactor/M1-product-plan.md` —— 当前阶段任务与并行波次。
3. `app/README.md` —— 前端工程说明与目录约定。
4. `app/src/contracts/` —— 模块间接口契约(唯一来源)。
> 文档与本文件冲突时,以文档最新版为准,并在汇报中指出冲突。

## 🏛 架构铁律(不可违背)
1. **复用引擎走 headless 路径**:生成能力通过 `app/src/engine-adapter/` 封装 ST 的
   `generateRaw` / `generateRawData` / `sendOpenAIRequest` 与 direct backend seam 等**纯数据**函数。
   **严禁**调用 DOM-heavy 的 `Generate()`,**严禁**操作 SillyTavern 的 jQuery DOM。
2. **引擎复用方式**:通过 `@sillytavern/*` 别名 external import ST 模块(见 `app/vite.config.ts`),
   不把 ST 引擎代码复制进 app。
3. **不改 ST 原码**:`public/` 下的 SillyTavern 原始代码**只读**;适配逻辑一律写进 `engine-adapter/`。
4. **技术栈固定**:Vue 3 `<script setup lang="ts">` + TypeScript(strict)+ Pinia +
   Vue Router + Tailwind CSS v4。不引入其它 UI 框架。
5. **体验原则**:全端响应式、移动优先、渐进式披露(默认极简,高级选项可折叠)。
6. **密钥纪律**(ADR-003):API key 不进 Pinia 可序列化状态/action payload,只在内存瞬态 vault。

## 🤝 多 Agent / Worktree 协作规则
0. **准备环境**:你在一个独立 git worktree 中。首次需 `cd app && npm install`(worktree 不共享 node_modules)。
1. **模块边界**:只在被分配的模块目录内写代码(如 `app/src/<module>/`),不碰其它模块文件。
2. **不动公共基座**:不擅自改 `app/package.json`、`tsconfig*`、`vite.config.ts`、`router`、`main.ts`。
   确需改动 → 在汇报中提出交主干协调,不在自己 worktree 改。
3. **接口先行**:模块间只通过 `app/src/contracts/` 的 TS 契约交互。
   - 契约已存在 → 只读依赖;不存在 → 新增接口定义并标 `// DRAFT: 待主干评审`,在汇报中说明。
     **不要**绕过契约直接耦合别的模块的内部实现。
4. **不新增 npm 依赖**:除非任务明确需要;需要则先在汇报中申请,不擅自改 `package.json`。
5. **license**:可参考/复用本项目与 SillyTavern(均 AGPL)的代码;
   **严禁**复制其它协议(如 Aladdin)的第三方插件代码——功能用自己实现。

## 🔧 工作流程(每个任务)
1. **读**:相关 PRD 章节 + M1 计划任务卡 + 相关契约。
2. **对齐契约**:确认/定义依赖与提供的接口(写进 `contracts/`)。
3. **实现**:遵循架构铁律与体验原则。
4. **自验证(必须)**:在你的 worktree 内通过 `npm run type-check`(零 error)与 `npm run test`(补 vitest 单测);组件类确认移动端 + 深色主题正常。
5. **提交**:分支 `reforge/<module>`,小步提交,约定式信息(`feat:`/`fix:`/`refactor:`)。
6. **汇报(完成时)**:实现了什么 + 新增/修改文件清单 + 契约变更 + 验证结果 + 遗留问题/需主干协调的点/关键假设。

## 🚫 红线
- 不操作 SillyTavern DOM、不调用 `Generate()`;不改 `public/` 原码;不动公共基座配置(改 → 申请)。
- 不绕过 `contracts/` 偷偷耦合其它模块;不给 worldbook 引擎加新细节(已足够,除非为 UI 编辑器服务)。
- 不确定时:**记录假设并在汇报中提问,不要猜测性乱改**。
