import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from '@/app/AppShell'
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { RequirePermission as Guard } from '@/features/auth/RequirePermission'
import { PERMISSIONS } from '@/shared/auth/permissions'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { JobDetailPage } from '@/features/jobs/JobDetailPage'
import { JobsPage } from '@/features/jobs/JobsPage'
import { ManagementPage } from '@/features/management/ManagementPage'
import { AuditLogPage } from '@/features/operations/AuditLogPage'
import { IssuesPage } from '@/features/operations/IssuesPage'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { FacilityPage } from '@/features/maps/FacilityPage'
import { MapEditorPage } from '@/features/maps/MapEditorPage'
import { FleetPage } from '@/features/robots/FleetPage'
import { RobotManualPage } from '@/features/robots/manual/RobotManualPage'
import { RobotTechnicalPage } from '@/features/robots/technical/RobotTechnicalPage'
import { TransportRequestsPage } from '@/features/transport-requests/TransportRequestsPage'
import { SchedulesPage } from '@/features/transport-requests/SchedulesPage'
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
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/monitor/fleet" element={<Guard permission={PERMISSIONS.robotRead}><FleetPage /></Guard>} />
            <Route path="/monitor/fleet/:robotCode" element={<Guard permission={PERMISSIONS.robotRead}><FleetPage /></Guard>} />
            <Route path="/monitor/fleet/:robotCode/technical" element={<Guard permission={PERMISSIONS.robotRead}><RobotTechnicalPage /></Guard>} />
            <Route path="/monitor/requests" element={<Guard permission={PERMISSIONS.transportRead}><TransportRequestsPage /></Guard>} />
            <Route path="/monitor/schedules" element={<Guard permission={PERMISSIONS.transportRead}><SchedulesPage /></Guard>} />
            <Route path="/monitor/jobs" element={<Guard permission={PERMISSIONS.jobRead}><JobsPage /></Guard>} />
            <Route path="/monitor/jobs/:jobId" element={<Guard permission={PERMISSIONS.jobRead}><JobDetailPage /></Guard>} />
            <Route path="/monitor/live" element={<Navigate to="/monitor/requests" replace />} />
            <Route path="/dashboard" element={<Guard permission={PERMISSIONS.statisticsRead}><DashboardPage /></Guard>} />
            <Route path="/configure/facility" element={<Guard permission={PERMISSIONS.mapRead}><FacilityPage /></Guard>} />
            <Route path="/configure/workflows" element={<Guard permission={PERMISSIONS.workflowRead}><WorkflowsListPage /></Guard>} />
            <Route path="/configure/workflows/new" element={<Guard permission={PERMISSIONS.workflowWrite}><WorkflowEditorPage /></Guard>} />
            <Route path="/configure/workflows/:id" element={<Guard permission={PERMISSIONS.workflowRead}><WorkflowEditorPage /></Guard>} />
            <Route path="/management" element={<Guard permission={[PERMISSIONS.userManage, PERMISSIONS.warehouseRead]}><ManagementPage /></Guard>} />
            <Route path="/operations/issues" element={<Guard permission={PERMISSIONS.issueRead}><IssuesPage /></Guard>} />
            <Route path="/operations/issues/:issueId" element={<Guard permission={PERMISSIONS.issueRead}><IssuesPage /></Guard>} />
            <Route path="/operations/audit" element={<Guard permission={PERMISSIONS.auditRead}><AuditLogPage /></Guard>} />
            <Route path="/operations/notifications" element={<Guard permission={PERMISSIONS.notificationRead}><NotificationsPage /></Guard>} />
          </Route>

          {/* Full-screen editor: has its own header instead of the app shell. */}
          <Route path="/configure/facility/maps/:mapId/edit" element={<Guard permission={PERMISSIONS.mapRead}><MapEditorPage /></Guard>} />
          {/* Full-screen manual control of one robot (map + joystick console). */}
          <Route path="/monitor/fleet/:robotCode/manual" element={<Guard permission={PERMISSIONS.robotManualDrive}><RobotManualPage /></Guard>} />
        </Route>

        <Route path="/notifications" element={<Navigate to="/operations/notifications" replace />} />
        <Route path="/admin" element={<Navigate to="/management?tab=accounts" replace />} />
        <Route path="/admin/accounts" element={<Navigate to="/management?tab=accounts" replace />} />
        <Route path="/admin/roles" element={<Navigate to="/management?tab=roles" replace />} />
        <Route path="/data" element={<Navigate to="/management?tab=warehouses" replace />} />
        <Route path="/data/warehouses" element={<Navigate to="/management?tab=warehouses" replace />} />
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
