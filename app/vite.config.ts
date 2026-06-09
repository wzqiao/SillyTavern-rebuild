import { defineConfig, type ProxyOptions } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const SILLYTAVERN_DEV_ORIGIN = process.env.ST_REFORGED_ST_ORIGIN ?? 'http://127.0.0.1:8000';

const runtimeProxyOptions = (): ProxyOptions => ({
  target: SILLYTAVERN_DEV_ORIGIN,
  changeOrigin: true,
  secure: false,
});

const sameOriginRuntimeProxy = [
  '/__st_runtime',
  '/script.js',
  '/lib.js',
  '/lib',
  '/style.css',
  '/manifest.json',
  '/favicon.ico',
  '/scripts',
  '/css',
  '/webfonts',
  '/assets',
  '/img',
  '/backgrounds',
  '/characters',
  '/User Avatars',
  '/extensions',
  '/api',
  '/csrf-token',
].reduce<Record<string, ProxyOptions>>(
  (proxy, route) => {
    proxy[route] = runtimeProxyOptions();
    return proxy;
  },
  {},
);

sameOriginRuntimeProxy['/__st_runtime'] = {
  ...runtimeProxyOptions(),
  rewrite: (urlPath) => urlPath.replace(/^\/__st_runtime/, '') || '/',
};

/**
 * 复用 SillyTavern 引擎模块。
 *
 * 把 `@sillytavern/xxx` 解析为 ST 运行时同源 URL,并标记为 external——
 * 构建时不打包,运行时由浏览器从 ST 页面同源加载真实模块。
 *   @sillytavern/script          -> /script.js
 *   @sillytavern/scripts/openai  -> /scripts/openai.js
 *
 * Vite dev server 通过 `server.proxy` 把这些同源 URL 反代到真实 ST 后端。
 * 默认目标为 http://127.0.0.1:8000,可用 ST_REFORGED_ST_ORIGIN 覆盖。
 *
 * 注:URL 映射是 M0-A 的核心验证点,可能随集成方式调整。
 * 思路为自行实现(社区有类似实践),不复制任何 GPL/Aladdin 代码。
 */
function sillytavernResolver() {
  return {
    name: 'sillytavern-resolver',
    enforce: 'pre' as const,
    resolveId(id: string) {
      if (id.startsWith('@sillytavern/')) {
        const sub = id.slice('@sillytavern/'.length);
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
  server: {
    port: 5173,
    proxy: sameOriginRuntimeProxy,
  },
  build: { target: 'esnext', outDir: 'dist' },
});
