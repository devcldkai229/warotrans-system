import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/app/layout'
import { HomePage } from '@/app/home-page'
import { WorkflowEditorPage } from '@/features/workflows/workflow-editor-page'
import { WorkflowsListPage } from '@/features/workflows/workflows-list-page'
import { AppShell } from '@/app/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { FleetPage } from '@/features/robots/FleetPage'
import { JobDetailPage } from '@/features/jobs/JobDetailPage'
import { FacilityPage } from '@/features/maps/FacilityPage'
import { MapEditorPage } from '@/features/maps/MapEditorPage'

// Các component mới cập nhật từ nhánh develop
import { TransportRequestsPage } from '@/features/jobs/TransportRequestsPage'
import { ManagementPage } from '@/features/management/ManagementPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Các Tuyến đường thuộc AppLayout của nhánh feature */}
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="workflows" element={<WorkflowsListPage />} />
            <Route path="workflows/new" element={<WorkflowEditorPage />} />
            <Route path="workflows/:id" element={<WorkflowEditorPage />} />
          </Route>

          {/* Toàn bộ hệ thống Tuyến đường mới được cấu trúc lại của nhánh develop */}
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/monitor/fleet" element={<FleetPage />} />
              <Route path="/monitor/fleet/:robotCode" element={<FleetPage />} />
              <Route path="/monitor/requests" element={<TransportRequestsPage />} />
              <Route path="/monitor/jobs" element={<Navigate to="/monitor/requests" replace />} />
              <Route path="/monitor/jobs/:jobNo" element={<JobDetailPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/configure/facility" element={<FacilityPage />} />
              <Route path="/management" element={<ManagementPage />} />
            </Route>

            {/* Full-screen editor: has its own header instead of the app shell. */}
            <Route path="/configure/facility/maps/:mapId/edit" element={<MapEditorPage />} />
          </Route>

          {/* Các lối tắt điều hướng (Redirects) theo cấu trúc mới của develop */}
          <Route path="/admin" element={<Navigate to="/management?tab=accounts" replace />} />
          <Route path="/admin/accounts" element={<Navigate to="/management?tab=accounts" replace />} />
          <Route path="/admin/roles" element={<Navigate to="/management?tab=roles" replace />} />
          <Route path="/data" element={<Navigate to="/management?tab=products" replace />} />
          <Route path="/data/products" element={<Navigate to="/management?tab=products" replace />} />
          <Route path="/data/categories" element={<Navigate to="/management?tab=categories" replace />} />
          <Route path="/data/inventory" element={<Navigate to="/management?tab=inventory" replace />} />
          <Route path="/data/storage-locations" element={<Navigate to="/management?tab=locations" replace />} />
          <Route path="/monitor" element={<Navigate to="/monitor/fleet" replace />} />
          <Route path="/configure" element={<Navigate to="/configure/facility" replace />} />
          
          {/* Điều hướng mặc định khi nhập sai URL */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
