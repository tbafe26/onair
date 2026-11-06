import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { LiveProvider } from '../live/LiveProvider'
import { routes } from '../routes'
import { createFakeLive } from './fakeLive'

/** 라우터와 TanStack Query를 포함한 실제 앱을 지정한 주소에서 그린다. 송출·시청 모듈은 가짜(fake)를 끼우며, 테스트가 그 상태를 바꾼다. */
export function renderApp(initialPath = '/') {
  const fake = createFakeLive()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <LiveProvider live={fake.live}>
        <RouterProvider router={router} />
      </LiveProvider>
    </QueryClientProvider>,
  )
  return { ...result, router, fake }
}
