import { useMemo, useState } from 'react'
import type { Product, ProductCategory } from '@/shared/api/contracts'
import { Button } from '@/shared/ui/Button'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError, SearchInput } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { createProduct, setProductStatus } from './api'
import { AddButton, SectionHead } from './SectionHead'

/** Web-only limit: the API accepts up to 128 characters, the console keeps barcodes to 13 digits (EAN-13 length). */
const BARCODE_MAX_DIGITS = 13

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
  loadState: 'loading' | 'ready' | 'error'
}

/** warehouse.products: SKU and supplier barcode are unique; the supplier barcode identifies the product on receiving. */
export function ProductsSection({ products, setProducts, categories, loadState }: ProductsSectionProps) {
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [draft, setDraft] = useState<ProductDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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

  async function save() {
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

    setBusy(true)
    setError(null)
    try {
      const created = await createProduct({
        categoryId: draft.categoryId,
        sku,
        name: draft.name.trim(),
        supplierBarcode: barcode || undefined,
        description: draft.description.trim() || undefined,
      })
      setProducts((current) => [...current, created].sort((a, b) => a.sku.localeCompare(b.sku)))
      setNotice(null)
      setDraft(null)
    } catch (failure) {
      // e.g. the same SKU was just added by someone else: the server's message says which value clashes.
      setError(failure instanceof Error ? failure.message : 'The product could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(product: Product) {
    setBusyId(product.id)
    setNotice(null)
    try {
      const updated = await setProductStatus(product, !product.isActive)
      setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : 'The status could not be changed.')
    } finally {
      setBusyId(null)
    }
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

      {notice ? (
        <div className="mb-3">
          <FormError>{notice}</FormError>
        </div>
      ) : null}

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
                  <Button size="sm" variant={product.isActive ? 'ghost' : 'tonal'} disabled={busyId === product.id} onClick={() => toggle(product)}>
                    {product.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
          {visible.length === 0 ? (
            <EmptyRow colSpan={7}>
              {loadState === 'loading'
                ? 'Loading products…'
                : loadState === 'error'
                  ? 'Could not load products. Check that the API is running, then reload.'
                  : products.length === 0
                    ? 'No products yet. Add the first one.'
                    : 'No products match this filter.'}
            </EmptyRow>
          ) : null}
        </tbody>
      </Table>

      {draft ? (
        <Dialog title="Add product" submitLabel="Create product" busy={busy} onClose={() => setDraft(null)} onSubmit={save}>
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
            hint="Up to 13 digits, scanned on the supplier package to identify the product when receiving. Must be unique."
          >
            <input
              className={controlClass()}
              value={draft.supplierBarcode}
              inputMode="numeric"
              maxLength={BARCODE_MAX_DIGITS}
              onChange={(event) =>
                setDraft({ ...draft, supplierBarcode: event.target.value.replace(/\D/g, '').slice(0, BARCODE_MAX_DIGITS) })
              }
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
