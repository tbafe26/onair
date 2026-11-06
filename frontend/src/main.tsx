import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { shouldRetryQuery } from './api/query-retry'
import { AuthProvider } from './auth/AuthProvider'
import './index.css'
import { LiveProvider } from './live/LiveProvider'
import { routes } from './routes'

// 기본값은 404에도 3번 다시 시도해 "방송을 찾을 수 없습니다"가 몇 초 늦게 나온다.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } })
const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LiveProvider>
          <RouterProvider router={router} />
        </LiveProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
