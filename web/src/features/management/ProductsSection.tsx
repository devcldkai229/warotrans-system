import { useMemo, useState } from 'react'
import type { Product, ProductCategory } from '@/shared/api/contracts'
import { Dialog } from '@/shared/ui/Dialog'
import { SectionHead } from './SectionHead'

interface ProductDraft {
  sku: string
  name: string
  description: string
  categoryId: string
  supplierBarcode: string
}

interface ProductsSectionProps {
  products: Product[]
  setProducts: (update: (current: Product[]) => Product[]) => void
  categories: ProductCategory[]
}

/** warehouse.products: SKU and supplier barcode are unique; the supplier barcode identifies the product on receiving. */
export function ProductsSection({ products, setProducts, categories }: ProductsSectionProps) {
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [draft, setDraft] = useState<ProductDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const categoryName = (id: string) => categories.find((category) => category.id === id)?.name ?? '—'

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return products.filter(
      (product) =>
        (categoryFilter === '' || product.categoryId === categoryFilter) &&
        (needle === '' ||
          product.sku.toLowerCase().includes(needle) ||
          product.name.toLowerCase().includes(needle) ||
          (product.supplierBarcode ?? '').includes(needle)),
    )
  }, [products, query, categoryFilter])

  function open() {
    setDraft({ sku: '', name: '', description: '', categoryId: categories[0]?.id ?? '', supplierBarcode: '' })
    setError(null)
  }

  function save() {
    if (!draft) return
    const sku = draft.sku.trim().toUpperCase()
    const barcode = draft.supplierBarcode.trim()
    if (!sku || !draft.name.trim() || !draft.categoryId) {
      setError('SKU, name and category are required.')
      return
    }
    if (products.some((product) => product.sku === sku)) {
      setError('This SKU already exists.')
      return
    }
    if (barcode && products.some((product) => product.supplierBarcode === barcode)) {
      setError('This supplier barcode already belongs to another product.')
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
        supplierBarcode: barcode || undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ])
    setDraft(null)
  }

  function toggle(id: string) {
    setProducts((current) =>
      current.map((product) =>
        product.id === id ? { ...product, isActive: !product.isActive, updatedAt: new Date().toISOString() } : product,
      ),
    )
  }

  return (
    <>
      <SectionHead title="Products" hint="The product master catalog. A Container always holds one product type.">
        <input placeholder="Search SKU, name or barcode…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn--blue" onClick={open}>
          + Add product
        </button>
      </SectionHead>

      <table className="mtable">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Name</th>
            <th>Description</th>
            <th>Category</th>
            <th>Supplier barcode</th>
            <th>Status</th>
            <th className="is-right">Actions</th>
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
              <td>
                <span className={`mpill mpill--${product.isActive ? 'green' : 'grey'}`}>
                  {product.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <div className="mrow-actions">
                  <button
                    type="button"
                    className={`mbtn ${product.isActive ? 'mbtn--danger' : 'mbtn--ok'}`}
                    onClick={() => toggle(product.id)}
                  >
                    {product.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {visible.length === 0 ? (
            <tr>
              <td colSpan={7} className="mtable__empty">
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
              <input value={draft.sku} maxLength={100} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} autoFocus />
            </label>
            <label className="field">
              Category
              <select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            Name
            <input value={draft.name} maxLength={200} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="field">
            Supplier barcode
            <input
              value={draft.supplierBarcode}
              maxLength={128}
              onChange={(event) => setDraft({ ...draft, supplierBarcode: event.target.value })}
            />
            <small>Scanned on the supplier package to identify the product when receiving. Must be unique.</small>
          </label>
          <label className="field">
            Description
            <textarea
              value={draft.description}
              maxLength={500}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </label>
          {error ? <small className="field" style={{ color: 'var(--red-ink)' }}>{error}</small> : null}
        </Dialog>
      ) : null}
    </>
  )
}
