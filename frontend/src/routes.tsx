import type { RouteObject } from 'react-router-dom'
import { RequireLogin } from './auth/RequireLogin'
import { AppShell } from './layout/AppShell'
import { BroadcastCreatePage } from './pages/BroadcastCreatePage'
import { BroadcastDetailPage } from './pages/BroadcastDetailPage'
import { BroadcastListPage } from './pages/BroadcastListPage'
import { LiveBroadcastPage } from './pages/LiveBroadcastPage'
import { MyBroadcastsPage } from './pages/MyBroadcastsPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <BroadcastListPage /> },
      {
        path: '/broadcasts/new',
        element: (
          <RequireLogin>
            <BroadcastCreatePage />
          </RequireLogin>
        ),
      },
      {
        path: '/broadcasts/live/new',
        element: (
          <RequireLogin>
            <LiveBroadcastPage />
          </RequireLogin>
        ),
      },
      { path: '/broadcasts/:id', element: <BroadcastDetailPage /> },
      {
        path: '/me/broadcasts',
        element: (
          <RequireLogin>
            <MyBroadcastsPage />
          </RequireLogin>
        ),
      },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
]
