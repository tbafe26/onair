import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthProvider'
import { LiveProvider } from '../live/LiveProvider'
import { PaymentProvider } from '../payments/PaymentProvider'
import { routes } from '../routes'
import { createFakeLive } from './fakeLive'
import { createFakePaymentWidget } from './fakePaymentWidget'

/** 라우터와 TanStack Query를 포함한 실제 앱을 지정한 주소에서 그린다. 송출·시청 모듈과 결제창은 가짜(fake)를 끼우며, 테스트가 그 상태를 바꾼다. */
export function renderApp(initialPath = '/') {
  const fake = createFakeLive()
  const payment = createFakePaymentWidget()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LiveProvider live={fake.live}>
          <PaymentProvider paymentWidget={payment}>
            <RouterProvider router={router} />
          </PaymentProvider>
        </LiveProvider>
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { ...result, router, fake, payment }
}
