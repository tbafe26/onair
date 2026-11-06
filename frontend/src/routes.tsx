import type { RouteObject } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { BroadcastCreatePage } from './pages/BroadcastCreatePage'
import { BroadcastDetailPage } from './pages/BroadcastDetailPage'
import { BroadcastListPage } from './pages/BroadcastListPage'
import { LiveBroadcastPage } from './pages/LiveBroadcastPage'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <BroadcastListPage /> },
      { path: '/broadcasts/new', element: <BroadcastCreatePage /> },
      { path: '/broadcasts/live/new', element: <LiveBroadcastPage /> },
      { path: '/broadcasts/:id', element: <BroadcastDetailPage /> },
    ],
  },
]
