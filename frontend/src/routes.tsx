import type { RouteObject } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { BroadcastCreatePage } from './pages/BroadcastCreatePage'
import { BroadcastDetailPage } from './pages/BroadcastDetailPage'
import { BroadcastListPage } from './pages/BroadcastListPage'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <BroadcastListPage /> },
      { path: '/broadcasts/new', element: <BroadcastCreatePage /> },
      { path: '/broadcasts/:id', element: <BroadcastDetailPage /> },
    ],
  },
]
