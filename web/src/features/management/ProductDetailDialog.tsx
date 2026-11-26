import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ContainerStatus, Product, ProductCategory } from '@/shared/api/contracts'
import { CONTAINER_STATUS_TONE } from '@/shared/ui/statusTones'
import { formatIsoDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { getProductInventoryContext, updateProduct } from './api'
import { ContainerList, DetailFooter, DetailHeading, EditFooter, Facts, failureText, useMayEditWarehouse } from './CatalogDetail'
import { t } from '@/shared/i18n'

const BARCODE_MAX_DIGITS = 13

interface ProductForm {
  name: string
  categoryId: string
  supplierBarcode: string
  description: string
}

/**
 * A product: what describes it, where its stock is and its Containers. Admins can edit everything but the SKU, which is
 * printed on labels and written on vouchers.
 */
export function ProductDetailDialog({
  product,
  products,
  categories,
  onSaved,
  onClose,
}: {
  product: Product
  products: Product[]
  categories: ProductCategory[]
  onSaved: (product: Product) => void
  onClose: () => void
}) {
  const mayEdit = useMayEditWarehouse()
  const [form, setForm] = useState<ProductForm | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const context = useQuery({
    queryKey: ['management-product-context', product.id],
    queryFn: () => getProductInventoryContext(product),
  })
  const categoryName = categories.find((category) => category.id === product.categoryId)?.name ?? '—'

  function startEdit() {
    setForm({
      name: product.name,
      categoryId: product.categoryId,
      supplierBarcode: product.supplierBarcode ?? '',
      description: product.description ?? '',
    })
    setError(null)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    const barcode = form.supplierBarcode.trim()
    if (!form.name.trim() || !form.categoryId) {
      setError(t('Name and category are required.'))
      return
    }
    if (barcode && products.some((other) => other.id !== product.id && other.supplierBarcode === barcode)) {
      setError(t('This supplier barcode already belongs to another product.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await updateProduct(product, {
        categoryId: form.categoryId,
        name: form.name.trim(),
        supplierBarcode: barcode || undefined,
        description: form.description.trim() || undefined,
      })
      onSaved(saved)
      setForm(null)
    } catch (failure) {
      setError(failureText(failure, t('The product could not be saved.')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={product.name} subtitle={product.sku} onClose={onClose} width="w-[860px]">
      {form ? (
        <form onSubmit={save}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <FieldRow>
              <Field label={t('SKU')} hint={t('The SKU cannot be changed: it is printed on labels and written on vouchers.')}>
                <input className={controlClass()} value={product.sku} disabled readOnly />
              </Field>
              <Field label={t('Category')}>
                <select className={controlClass()} value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            </FieldRow>
            <Field label={t('Name')}>
              <input
                className={controlClass()}
                value={form.name}
                maxLength={200}
                autoFocus
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label={t('Supplier barcode')} hint={t('Up to 13 digits. Must be unique.')}>
              <input
                className={controlClass()}
                value={form.supplierBarcode}
                inputMode="numeric"
                maxLength={BARCODE_MAX_DIGITS}
                onChange={(event) =>
                  setForm({ ...form, supplierBarcode: event.target.value.replace(/\D/g, '').slice(0, BARCODE_MAX_DIGITS) })
                }
              />
            </Field>
            <Field label={t('Description')}>
              <textarea
                className={controlClass('area')}
                value={form.description}
                maxLength={500}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
            {error ? <FormError>{error}</FormError> : null}
          </div>
          <EditFooter busy={busy} onCancel={() => setForm(null)} />
        </form>
      ) : (
        <>
          <div className="px-6 py-5">
            <Facts
              items={[
                { label: t('SKU'), value: <span className="font-mono text-xs">{product.sku}</span> },
                { label: t('Category'), value: categoryName },
                { label: t('Supplier barcode'), value: <span className="font-mono text-xs">{product.supplierBarcode ?? '—'}</span> },
                {
                  label: t('Status'),
                  value: (
                    <StatusBadge tone={product.isActive ? 'green' : 'grey'} withDot>
                      {product.isActive ? t('Active') : t('Inactive')}
                    </StatusBadge>
                  ),
                },
                { label: t('Description'), value: product.description ?? '—' },
                { label: t('Updated'), value: formatIsoDateTime(product.updatedAt) },
              ]}
            />

            <DetailHeading>{t('Containers by status')}</DetailHeading>
            {context.data ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(context.data.containersByStatus).length === 0 ? (
                  <span className="text-sm text-muted">{t('No containers yet.')}</span>
                ) : (
                  Object.entries(context.data.containersByStatus).map(([status, count]) => (
                    <StatusBadge key={status} tone={CONTAINER_STATUS_TONE[status as ContainerStatus] ?? 'grey'}>
                      {`${status} · ${count}`}
                    </StatusBadge>
                  ))
                )}
              </div>
            ) : (
              <span className="text-sm text-muted">{context.isError ? t('Could not load the stock.') : t('Loading…')}</span>
            )}

            <DetailHeading>{t('Stock by location')}</DetailHeading>
            <div className="rounded-md border border-outline-soft">
              <Table>
                <thead>
                  <tr>
                    <Th>{t('Location')}</Th>
                    <Th>{t('Level')}</Th>
                    <Th align="right">{t('Containers')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {(context.data?.storageLocations ?? []).map((row) => (
                    <Tr key={`${row.storageLocationId}-${row.levelNo}`}>
                      <Td>
                        {row.storageLocationName} <span className="font-mono text-xs text-muted">{row.storageLocationCode}</span>
                      </Td>
                      <Td tone="faint">{row.levelNo}</Td>
                      <Td align="right" tone="strong">
                        {row.containerCount}
                      </Td>
                    </Tr>
                  ))}
                  {context.data && context.data.storageLocations.length === 0 ? (
                    <EmptyRow colSpan={3}>{t('Not on any shelf yet.')}</EmptyRow>
                  ) : null}
                </tbody>
              </Table>
            </div>

            <ContainerList productId={product.id} showProduct={false} />
          </div>
          <DetailFooter>
            <Button variant="ghost" onClick={onClose}>
              {t('Close')}
            </Button>
            {mayEdit ? (
              <Button variant="primary" onClick={startEdit}>
                {t('Edit')}
              </Button>
            ) : null}
          </DetailFooter>
        </>
      )}
    </Modal>
  )
}
