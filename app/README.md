# ST-Reforged · app/

SillyTavern 重构版前端(全新 SPA)。详见根目录 `docs/REFACTOR-PRD.md`。

## 技术栈
Vue 3 + TypeScript + Vite + Pinia + Vue Router + Tailwind CSS v4。

## 命令
```bash
npm install
npm run dev          # 开发服务器 (http://localhost:5173)
npm run build        # 类型检查 + 构建
npm run type-check   # 仅类型检查
npm run test         # vitest
```

## 与 SillyTavern 引擎的关系
- 后端:复用 ST 后端(Express,AGPL),不在此工程内。
- 引擎:通过 `@sillytavern/*` 别名以 **external** 方式复用 ST 前端引擎模块
  (见 `vite.config.ts` 的 `sillytavernResolver`)。运行时由浏览器从 ST 同源页面加载。
  ⚠️ 该机制的可行性是 M0-A 验证点,DOM 耦合风险见 PRD §4.2 / §8。

## 目录约定
```
src/
├── contracts/      模块间 TS 接口契约(唯一来源,先行冻结)
├── engine-adapter/ 桥接 ST 引擎为干净接口(隔离 DOM 耦合风险)
├── stores/         Pinia 状态
├── services/       业务逻辑
├── parsers/        数据解析(角色卡 V2/V3、世界书…)
├── ui-kit/         通用组件库(移动优先、响应式)
├── views/          页面
└── router/         路由
```

## License
AGPL-3.0(随上游 SillyTavern)。
