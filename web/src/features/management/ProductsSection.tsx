import { useMemo, useState } from 'react'
import type { Product, ProductCategory } from '@/shared/api/contracts'
import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError, SearchInput } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { AddButton, SectionHead } from './SectionHead'

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
        <SearchInput className="w-72" placeholder="Search SKU, name or barcode" value={query} onChange={setQuery} />
        <select
          className={controlClass('pill')}
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <AddButton onClick={open}>Add product</AddButton>
      </SectionHead>

      <Table>
        <thead>
          <tr>
            <Th>SKU</Th>
            <Th>Name</Th>
            <Th>Description</Th>
            <Th>Category</Th>
            <Th>Supplier barcode</Th>
            <Th>Status</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((product) => (
            <Tr key={product.id}>
              <Td className="font-mono text-xs">{product.sku}</Td>
              <Td tone="strong">{product.name}</Td>
              <Td tone="faint">{product.description ?? '—'}</Td>
              <Td>{categoryName(product.categoryId)}</Td>
              <Td tone="faint" className="font-mono text-xs">
                {product.supplierBarcode ?? '—'}
              </Td>
              <Td>
                <StatusBadge tone={product.isActive ? 'green' : 'grey'} withDot>
                  {product.isActive ? 'Active' : 'Inactive'}
                </StatusBadge>
              </Td>
              <Td>
                <div className="flex justify-end">
                  <Button size="sm" variant={product.isActive ? 'ghost' : 'tonal'} onClick={() => toggle(product.id)}>
                    {product.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
          {visible.length === 0 ? <EmptyRow colSpan={7}>No products match this filter.</EmptyRow> : null}
        </tbody>
      </Table>

      {draft ? (
        <Dialog title="Add product" submitLabel="Create product" onClose={() => setDraft(null)} onSubmit={save}>
          <FieldRow>
            <Field label="SKU">
              <input
                className={controlClass()}
                value={draft.sku}
                maxLength={100}
                onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Category">
              <select
                className={controlClass()}
                value={draft.categoryId}
                onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
          </FieldRow>
          <Field label="Name">
            <input
              className={controlClass()}
              value={draft.name}
              maxLength={200}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field
            label="Supplier barcode"
            hint="Scanned on the supplier package to identify the product when receiving. Must be unique."
          >
            <input
              className={controlClass()}
              value={draft.supplierBarcode}
              maxLength={128}
              onChange={(event) => setDraft({ ...draft, supplierBarcode: event.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className={controlClass('area')}
              value={draft.description}
              maxLength={500}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </Field>
          {error ? <FormError>{error}</FormError> : null}
        </Dialog>
      ) : null}
    </>
  )
}
