import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from '@/app/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { JobDetailPage } from '@/features/jobs/JobDetailPage'
import { ManagementPage } from '@/features/management/ManagementPage'
import { FacilityPage } from '@/features/maps/FacilityPage'
import { MapEditorPage } from '@/features/maps/MapEditorPage'
import { FleetPage } from '@/features/robots/FleetPage'
import { TransportRequestsPage } from '@/features/transport-requests/TransportRequestsPage'
import { WorkflowEditorPage } from '@/features/workflows/workflow-editor-page'
import { WorkflowsListPage } from '@/features/workflows/workflows-list-page'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
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
            <Route path="/configure/workflows" element={<WorkflowsListPage />} />
            <Route path="/configure/workflows/new" element={<WorkflowEditorPage />} />
            <Route path="/configure/workflows/:id" element={<WorkflowEditorPage />} />
            <Route path="/management" element={<ManagementPage />} />
          </Route>

          {/* Full-screen editor: has its own header instead of the app shell. */}
          <Route path="/configure/facility/maps/:mapId/edit" element={<MapEditorPage />} />
        </Route>

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
        <Route path="/workflows" element={<Navigate to="/configure/workflows" replace />} />
        <Route path="/workflows/new" element={<Navigate to="/configure/workflows/new" replace />} />
        <Route path="/workflows/:id" element={<LegacyWorkflowRedirect />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </QueryClientProvider>
  )
}

function LegacyWorkflowRedirect() {
  const { id } = useParams()
  return <Navigate to={`/configure/workflows/${id}`} replace />
}

export default App
