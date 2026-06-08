import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
/**
 * 复用 SillyTavern 引擎模块。
 *
 * 把 `@sillytavern/xxx` 解析为 ST 运行时同源 URL,并标记为 external——
 * 构建时不打包,运行时由浏览器从 ST 页面同源加载真实模块。
 *   @sillytavern/script          -> /script.js
 *   @sillytavern/scripts/openai  -> /scripts/openai.js
 *
 * 注:URL 映射是 M0-A 的核心验证点,可能随集成方式调整。
 * 思路为自行实现(社区有类似实践),不复制任何 GPL/Aladdin 代码。
 */
function sillytavernResolver() {
    return {
        name: 'sillytavern-resolver',
        enforce: 'pre',
        resolveId: function (id) {
            if (id.startsWith('@sillytavern/')) {
                var sub = id.slice('@sillytavern/'.length);
                return { id: '/' + sub + '.js', external: true };
            }
            return null;
        },
    };
}
export default defineConfig({
    plugins: [vue(), tailwindcss(), sillytavernResolver()],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: { port: 5173 },
    build: { target: 'esnext', outDir: 'dist' },
});
