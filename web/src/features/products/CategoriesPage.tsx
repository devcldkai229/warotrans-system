import { useState } from 'react'
import { AdminPage } from '@/app/AdminPage'
import type { ProductCategory } from '@/shared/api/contracts'
import { Dialog } from '@/shared/ui/Dialog'
import { CATEGORIES, PRODUCTS } from './mock'

interface CategoryDraft {
  code: string
  name: string
  description: string
}

export function CategoriesPage() {
  const [categories, setCategories] = useState<ProductCategory[]>(CATEGORIES)
  const [draft, setDraft] = useState<CategoryDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const productCount = (categoryId: string) => PRODUCTS.filter((product) => product.categoryId === categoryId).length

  function save() {
    if (!draft) return
    const code = draft.code.trim().toUpperCase()
    if (!code || !draft.name.trim()) {
      setError('Code and name are required.')
      return
    }
    if (categories.some((category) => category.code === code)) {
      setError('This category code already exists.')
      return
    }
    setCategories((current) => [
      ...current,
      { id: `draft-category-${current.length + 1}`, code, name: draft.name.trim(), description: draft.description.trim() || undefined },
    ])
    setDraft(null)
    setError(null)
  }

  return (
    <AdminPage
      title="Product Categories"
      subtitle="Manage product groupings (ProductCategory)"
      stats={[
        { label: 'Total categories', value: categories.length },
        { label: 'Products linked', value: PRODUCTS.length },
      ]}
    >
      <div className="atoolbar">
        <h2>Categories</h2>
        <button
          type="button"
          className="btn btn--blue"
          onClick={() => {
            setDraft({ code: '', name: '', description: '' })
            setError(null)
          }}
        >
          + Add Category
        </button>
      </div>

      <table className="atable">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Description</th>
            <th className="is-right">Products</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id}>
              <td>{category.code}</td>
              <td className="is-strong">{category.name}</td>
              <td className="is-faint">{category.description ?? '—'}</td>
              <td className="is-right">{productCount(category.id)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {draft ? (
        <Dialog title="Add category" submitLabel="Create category" onClose={() => setDraft(null)} onSubmit={save}>
          <div className="field-row">
            <label className="field">
              Code
              <input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} autoFocus />
            </label>
            <label className="field">
              Name
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
          </div>
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
