import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { startAppPersistence } from './repositories';
import './style.css';

const pinia = createPinia();
const app = createApp(App).use(pinia).use(router);

// 先水合持久化数据再挂载,避免界面先渲染空态再闪变。
// 持久化初始化失败不阻塞应用——降级为内存模式继续运行。
startAppPersistence(pinia)
    .catch((error) => {
        console.warn('[st-reforged] App persistence failed to start; continuing in-memory.', error);
    })
    .finally(() => {
        app.mount('#app');
    });
