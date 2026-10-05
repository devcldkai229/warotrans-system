import { AdminPage } from '@/app/AdminPage'
import { formatIsoDateTime } from '@/shared/lib/format'
import { INVENTORY } from './mock'

// Read-only: InventoryStock changes only through the Container lifecycle (putaway, retrieval, relocation),
// so there is no manual "Adjust Stock". Counts are Containers, not product units (rules/00).
export function InventoryPage() {
  const totalContainers = INVENTORY.reduce((sum, row) => sum + row.containerCount, 0)
  const locations = new Set(INVENTORY.map((row) => row.storageLocationId)).size

  return (
    <AdminPage
      title="Inventory Data"
      subtitle="Containers per product per location and level (InventoryStock)"
      stats={[
        { label: 'Stock records', value: INVENTORY.length },
        { label: 'Total containers', value: totalContainers },
        { label: 'Locations covered', value: locations },
      ]}
    >
      <div className="atoolbar">
        <h2>Stock by Location</h2>
      </div>

      <table className="atable">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product name</th>
            <th>Location</th>
            <th>Level</th>
            <th className="is-right">Containers</th>
            <th className="is-right">Updated at</th>
          </tr>
        </thead>
        <tbody>
          {INVENTORY.map((row) => (
            <tr key={row.id}>
              <td>{row.sku}</td>
              <td className="is-strong">{row.productName}</td>
              <td className="is-faint">{row.locationCode}</td>
              <td className="is-faint">{row.levelNo}</td>
              <td className="is-right is-strong">{row.containerCount}</td>
              <td className="is-right is-faint">{formatIsoDateTime(row.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminPage>
  )
}
