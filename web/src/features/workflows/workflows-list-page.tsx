import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listWorkflows } from '@/shared/api/workflows'
import './workflows.css'

function formatWhen(value?: string | null) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export function WorkflowsListPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => listWorkflows(),
  })

  return (
    <section className="wf-page">
      <header className="wf-header">
        <div>
          <h1>Workflow templates</h1>
          <p>Define HOW warehouse operations execute. Runtime values stay on Jobs.</p>
        </div>
        <div className="wf-actions">
          <button type="button" className="btn" disabled={isFetching} onClick={() => refetch()}>
            Refresh
          </button>
          <Link className="btn primary" to="/configure/workflows/new">
            New workflow
          </Link>
        </div>
      </header>

      {isLoading && <p>Loading…</p>}
      {error && <p className="error">{(error as Error).message}</p>}

      {data && (
        <table className="wf-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Version</th>
              <th>Name</th>
              <th>Status</th>
              <th>Created</th>
              <th>Published</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((w) => (
              <tr key={w.id}>
                <td>{w.code}</td>
                <td>v{w.versionNo}</td>
                <td>{w.name}</td>
                <td>
                  <span className={`badge ${w.status.toLowerCase()}`}>{w.status}</span>
                </td>
                <td>{formatWhen(w.createdAt)}</td>
                <td>{formatWhen(w.publishedAt)}</td>
                <td>
                  <Link to={`/configure/workflows/${w.id}`}>
                    {w.status === 'PUBLISHED' ? 'View' : 'Edit'}
                  </Link>
                  {w.status === 'DRAFT' ? (
                    <>
                      {' · '}
                      <Link to={`/configure/workflows/${w.id}`}>Publish</Link>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={7}>No workflows yet. Create one to get started.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  )
}
