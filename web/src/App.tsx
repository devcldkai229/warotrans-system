import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/app/layout'
import { HomePage } from '@/app/home-page'
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="workflows" element={<WorkflowsListPage />} />
            <Route path="workflows/new" element={<WorkflowEditorPage />} />
            <Route path="workflows/:id" element={<WorkflowEditorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
