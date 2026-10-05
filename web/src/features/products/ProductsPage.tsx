import { useMemo, useState } from 'react'
import { AdminPage } from '@/app/AdminPage'
import type { Product } from '@/shared/api/contracts'
import { Dialog } from '@/shared/ui/Dialog'
import { CATEGORIES, PRODUCTS } from './mock'

interface ProductDraft {
  sku: string
  name: string
  description: string
  categoryId: string
  supplierBarcode: string
}

const EMPTY_DRAFT: ProductDraft = {
  sku: '',
  name: '',
  description: '',
  categoryId: CATEGORIES[0]?.id ?? '',
  supplierBarcode: '',
}

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>(PRODUCTS)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [draft, setDraft] = useState<ProductDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const categoryName = (id: string) => CATEGORIES.find((category) => category.id === id)?.name ?? '—'

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return products.filter(
      (product) =>
        (categoryFilter === '' || product.categoryId === categoryFilter) &&
        (needle === '' || product.sku.toLowerCase().includes(needle) || product.name.toLowerCase().includes(needle)),
    )
  }, [products, query, categoryFilter])

  const activeCount = products.filter((product) => product.isActive).length

  function save() {
    if (!draft) return
    const sku = draft.sku.trim().toUpperCase()
    if (!sku || !draft.name.trim()) {
      setError('SKU and name are required.')
      return
    }
    if (products.some((product) => product.sku === sku)) {
      setError('This SKU already exists.')
      return
    }
    const now = new Date().toISOString()
    setProducts((current) => [
      ...current,
      {
        id: `draft-product-${current.length + 1}`,
        categoryId: draft.categoryId,
        sku,
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        supplierBarcode: draft.supplierBarcode.trim() || undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
    setDraft(null)
    setError(null)
  }

  function open() {
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  return (
    <AdminPage
      title="Product Management"
      subtitle="Manage the product master catalog (Product)"
      stats={[
        { label: 'Total products', value: products.length },
        { label: 'Active', value: activeCount, tone: 'green' },
        { label: 'Inactive', value: products.length - activeCount, tone: 'muted' },
        { label: 'Categories', value: CATEGORIES.length },
      ]}
    >
      <div className="atoolbar">
        <div className="atoolbar__filters">
          <input placeholder="Search SKU or name..." value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn--blue" onClick={open}>
          + Add Product
        </button>
      </div>

      <table className="atable">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Name</th>
            <th>Description</th>
            <th>Category</th>
            <th>Supplier barcode</th>
            <th className="is-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((product) => (
            <tr key={product.id}>
              <td>{product.sku}</td>
              <td className="is-strong">{product.name}</td>
              <td className="is-faint">{product.description ?? '—'}</td>
              <td>{categoryName(product.categoryId)}</td>
              <td className="is-faint">{product.supplierBarcode ?? '—'}</td>
              <td className="is-right">
                <span className={`apill apill--${product.isActive ? 'green' : 'grey'}`}>
                  {product.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
            </tr>
          ))}
          {visible.length === 0 ? (
            <tr>
              <td colSpan={6} className="atable__empty">
                No products match the filter
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {draft ? (
        <Dialog title="Add product" submitLabel="Create product" onClose={() => setDraft(null)} onSubmit={save}>
          <div className="field-row">
            <label className="field">
              SKU
              <input value={draft.sku} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} autoFocus />
            </label>
            <label className="field">
              Category
              <select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
                {CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            Name
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="field">
            Supplier barcode
            <input
              value={draft.supplierBarcode}
              onChange={(event) => setDraft({ ...draft, supplierBarcode: event.target.value })}
            />
            <small>Scanned on the supplier package to identify the product when receiving.</small>
          </label>
          <label className="field">
            Description
            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </label>
          {error ? <small className="field" style={{ color: 'var(--red-ink)' }}>{error}</small> : null}
        </Dialog>
      ) : null}
    </AdminPage>
  )
}
