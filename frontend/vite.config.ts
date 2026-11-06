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
  // localHttp(pnpm dev:local)는 이 PC의 브라우저 전용 HTTP 개발 서버다. localhost는 HTTP에서도 카메라를 쓸 수 있어
  // 자체 서명 인증서를 받아들이지 않는 브라우저(에이전트의 내장 브라우저 등)로도 화면을 확인할 수 있다.
  const localHttp = mode === 'http'
  // 자체 서명 인증서는 개발 서버를 띄울 때만 실행 중에 만든다. build와 vitest(mode가 test)에는 넣지 않는다.
  const useDevHttps = command === 'serve' && mode !== 'test' && !localHttp
  return {
    plugins: [react(), tailwindcss(), injectThemeKey(), ...(useDevHttps ? [basicSsl()] : [])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // localHttp는 HTTPS 개발 서버와 함께 띄울 수 있게 포트를 달리한다.
      port: localHttp ? 5174 : 5173,
      // 같은 Wi-Fi의 휴대폰이 https://<PC의 LAN 주소>:5173으로 접속하도록 모든 네트워크 인터페이스에 연다.
      // localHttp는 인증서 없이 열리므로 이 PC에서만 받는다.
      host: localHttp ? 'localhost' : true,
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
      globals: false,
      css: false,
      // Gradle 데몬 등으로 부하가 걸리면 기본 5초 제한에 걸려 간헐적으로 실패해 늘린다.
      testTimeout: 20_000,
      // 화면이 없는 모듈 테스트는 jsdom을 띄우지 않는다. jsdom 생성이 전체 시간의 절반 가까이를 차지한다.
      projects: [
        {
          extends: true,
          test: {
            name: 'dom',
            // client.test.ts는 쿠키(document.cookie)와 상대 주소를 쓰므로 브라우저 환경에서 돈다.
            include: ['src/**/*.test.tsx', 'src/api/client.test.ts'],
            environment: 'jsdom',
            pool: 'vmThreads',
            setupFiles: ['./src/test/setup.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'node',
            include: ['src/**/*.test.ts'],
            exclude: ['src/api/client.test.ts'],
            environment: 'node',
            setupFiles: ['./src/test/setup-node.ts'],
          },
        },
      ],
    },
  }
})
