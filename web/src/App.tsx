import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '@/app/AdminLayout'
import { AppShell } from '@/app/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { FleetPage } from '@/features/robots/FleetPage'
import { JobsManagementPage } from '@/features/jobs/JobsManagementPage'
import { JobDetailPage } from '@/features/jobs/JobDetailPage'
import { FacilityPage } from '@/features/maps/FacilityPage'
import { MapEditorPage } from '@/features/maps/MapEditorPage'
import { AccountsPage } from '@/features/accounts/AccountsPage'
import { RolesPage } from '@/features/accounts/RolesPage'
import { CategoriesPage } from '@/features/products/CategoriesPage'
import { ProductsPage } from '@/features/products/ProductsPage'
import { InventoryPage } from '@/features/inventory/InventoryPage'
import { StorageLocationsPage } from '@/features/inventory/StorageLocationsPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/monitor/fleet" element={<FleetPage />} />
          <Route path="/monitor/fleet/:robotCode" element={<FleetPage />} />
          <Route path="/monitor/jobs" element={<JobsManagementPage />} />
          <Route path="/monitor/jobs/:jobNo" element={<JobDetailPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/configure/facility" element={<FacilityPage />} />
        </Route>

        {/* Account and data management use the sidebar console instead of the top navigation. */}
        <Route element={<AdminLayout />}>
          <Route path="/admin/accounts" element={<AccountsPage />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/data/products" element={<ProductsPage />} />
          <Route path="/data/categories" element={<CategoriesPage />} />
          <Route path="/data/inventory" element={<InventoryPage />} />
          <Route path="/data/storage-locations" element={<StorageLocationsPage />} />
        </Route>

        {/* Full-screen editor: has its own header instead of the app shell. */}
        <Route path="/configure/facility/maps/:mapId/edit" element={<MapEditorPage />} />
      </Route>

      <Route path="/monitor" element={<Navigate to="/monitor/fleet" replace />} />
      <Route path="/configure" element={<Navigate to="/configure/facility" replace />} />
      <Route path="/admin" element={<Navigate to="/admin/accounts" replace />} />
      <Route path="/data" element={<Navigate to="/data/products" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
