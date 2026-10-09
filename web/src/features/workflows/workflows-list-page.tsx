import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listWorkflows } from '@/shared/api/workflows'
import './workflows.css'

export function WorkflowsListPage() {
  const { data, isLoading, error } = useQuery({
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
        <Link className="btn primary" to="/workflows/new">
          New workflow
        </Link>
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
                <td>
                  <Link to={`/workflows/${w.id}`}>Open</Link>
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={5}>No workflows yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  )
}
