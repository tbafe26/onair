/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { THEME_KEY } from './src/layout/theme-key.ts'

// index.html 인라인 스크립트의 테마 키 자리표시를 앱과 같은 THEME_KEY로 바꿔 두 값이 어긋나지 않게 한다.
function injectThemeKey(): Plugin {
  return {
    name: 'inject-theme-key',
    transformIndexHtml: (html) => html.replaceAll('__THEME_KEY__', THEME_KEY),
  }
}

export default defineConfig(({ command, mode }) => {
  // frontend/.env 값과 셸 환경변수를 함께 읽는다(셸 값이 우선).
  const env = loadEnv(mode, process.cwd(), '')
  // 자체 서명 인증서는 개발 서버를 띄울 때만 실행 중에 만든다. build와 vitest(mode가 test)에는 넣지 않는다.
  const useDevHttps = command === 'serve' && mode !== 'test'
  return {
    plugins: [react(), tailwindcss(), injectThemeKey(), ...(useDevHttps ? [basicSsl()] : [])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      // 같은 Wi-Fi의 휴대폰이 https://<PC의 LAN 주소>:5173으로 접속하도록 모든 네트워크 인터페이스에 연다.
      host: true,
      // 개발 중에는 /api를 백엔드로 넘겨 같은 출처로 동작시킨다(CORS 설정 없음).
      proxy: {
        '/api': {
          // 기본은 8080이다. 다른 포트의 백엔드를 쓰려면 API_PROXY_TARGET을 지정한다.
          target: env.API_PROXY_TARGET ?? 'http://localhost:8080',
          // /api 아래 WebSocket 업그레이드도 백엔드로 넘긴다.
          ws: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      globals: false,
      css: false,
      // Gradle 데몬 등으로 부하가 걸리면 기본 5초 제한에 걸려 간헐적으로 실패해 늘린다.
      testTimeout: 20_000,
    },
  }
})
