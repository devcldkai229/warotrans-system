import { useNavigate } from 'react-router-dom'
import { Icon } from '@/shared/ui/Icon'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { MAP_STATUS_TONE } from '@/shared/ui/statusTones'
import { formatDateTime } from '@/shared/lib/format'
import { MAP_VERSIONS, WAREHOUSE_NAME } from './mock'
import './maps.css'

export function FacilityPage() {
  const navigate = useNavigate()
  const draft = MAP_VERSIONS.find((version) => version.status === 'DRAFT')
  const published = MAP_VERSIONS.find((version) => version.status === 'PUBLISHED')

  return (
    <div className="facility">
      <h1>Facility</h1>

      <h2>Maps</h2>
      <div className="facility__cards">
        {draft ? (
          <article className="mapcard">
            <div className="mapcard__thumb mapcard__thumb--draft">
              <StatusBadge tone={MAP_STATUS_TONE[draft.status]}>{draft.status}</StatusBadge>
              <span className="mapcard__icon">
                <Icon name="map" size={22} />
              </span>
            </div>
            <div className="mapcard__body">
              <h3>
                {WAREHOUSE_NAME} — Version {draft.versionNo}
              </h3>
              <p>Last modified {formatDateTime(draft.modifiedAt ?? draft.createdAt)}</p>
              <div className="mapcard__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => navigate(`/configure/facility/maps/${draft.id}/edit`)}
                >
                  Edit
                </button>
                <button type="button" className="btn btn--outline">
                  Publish map
                </button>
              </div>
            </div>
          </article>
        ) : (
          <article className="mapcard">
            <div className="mapcard__body">
              <h3>No draft map</h3>
              <p>Create a draft from the published map to start editing.</p>
            </div>
          </article>
        )}

        {published ? (
          <article className="mapcard">
            <div className="mapcard__thumb mapcard__thumb--live">
              <StatusBadge tone={MAP_STATUS_TONE[published.status]}>{published.status}</StatusBadge>
              <span className="mapcard__icon mapcard__icon--live">
                <Icon name="shield" size={26} />
              </span>
            </div>
            <div className="mapcard__body">
              <h3>
                {WAREHOUSE_NAME} — Version {published.versionNo}
              </h3>
              <p>Published {formatDateTime(published.publishedAt)}</p>
              <div className="mapcard__actions mapcard__actions--single">
                <button type="button" className="btn btn--outline">
                  <Icon name="route" size={14} /> Distribute to robots
                </button>
              </div>
            </div>
          </article>
        ) : (
          <article className="mapcard">
            <div className="mapcard__body">
              <h3>No published map</h3>
              <p>Robots cannot navigate until a map version is published.</p>
            </div>
          </article>
        )}
      </div>

      <header className="facility__catalog-head">
        <h2>Map catalog</h2>
        <div>
          <button type="button" className="btn btn--outline">
            <Icon name="upload" size={14} /> Import
          </button>
          <button type="button" className="btn facility__square" aria-label="Search maps">
            <Icon name="search" size={14} />
          </button>
        </div>
      </header>

      <div className="facility__table">
        <table>
          <thead>
            <tr>
              <th />
              <th>Status</th>
              <th>Name</th>
              <th>Created</th>
              <th>Last modified</th>
              <th>Author</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {MAP_VERSIONS.map((version) => (
              <tr key={version.id}>
                <td className="facility__chev">
                  <Icon name="chevronRight" size={12} />
                </td>
                <td>
                  <StatusBadge tone={MAP_STATUS_TONE[version.status]}>{version.status}</StatusBadge>
                </td>
                <td className={version.status === 'PUBLISHED' ? 'is-strong' : undefined}>
                  Version {version.versionNo}
                </td>
                <td>{formatDateTime(version.createdAt)}</td>
                <td>{formatDateTime(version.modifiedAt ?? version.publishedAt ?? version.createdAt)}</td>
                <td className="is-strong">{version.author ?? '—'}</td>
                <td className="facility__notes">{version.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
