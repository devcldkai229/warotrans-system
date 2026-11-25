import { useState, type FormEvent } from 'react'
import type { Product, ProductCategory } from '@/shared/api/contracts'
import { Button } from '@/shared/ui/Button'
import { Modal } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { StatusBadge } from '@/shared/ui/StatusBadge'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { deleteCategory, updateCategory } from './api'
import { DetailFooter, DetailHeading, EditFooter, Facts, failureText, useMayEditWarehouse } from './CatalogDetail'
import { t } from '@/shared/i18n'

interface CategoryForm {
  name: string
  description: string
}

/**
 * A category and its products. Admins can edit the name and description (not the code) and delete a category that no
 * product belongs to.
 */
export function CategoryDetailDialog({
  category,
  products,
  onSaved,
  onDeleted,
  onOpenProduct,
  onClose,
}: {
  category: ProductCategory
  products: Product[]
  onSaved: (category: ProductCategory) => void
  onDeleted: (category: ProductCategory) => void
  onOpenProduct: (product: Product) => void
  onClose: () => void
}) {
  const mayEdit = useMayEditWarehouse()
  const [form, setForm] = useState<CategoryForm | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const members = products.filter((product) => product.categoryId === category.id)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    if (!form.name.trim()) {
      setError(t('Name is required.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(await updateCategory(category, { name: form.name.trim(), description: form.description.trim() || undefined }))
      setForm(null)
    } catch (failure) {
      setError(failureText(failure, t('The category could not be saved.')))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(t('Delete category {code}?', { code: category.code }))) return
    setBusy(true)
    setError(null)
    try {
      await deleteCategory(category)
      onDeleted(category)
    } catch (failure) {
      setError(failureText(failure, t('The category could not be deleted.')))
      setBusy(false)
    }
  }

  return (
    <Modal title={category.name} subtitle={category.code} onClose={onClose} width="w-[720px]">
      {form ? (
        <form onSubmit={save}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <FieldRow>
              <Field label={t('Code')} hint={t('The code cannot be changed.')}>
                <input className={controlClass()} value={category.code} disabled readOnly />
              </Field>
              <Field label={t('Name')}>
                <input
                  className={controlClass()}
                  value={form.name}
                  maxLength={100}
                  autoFocus
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
            </FieldRow>
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
                { label: t('Code'), value: <span className="font-mono text-xs">{category.code}</span> },
                { label: t('Products'), value: members.length },
                { label: t('Description'), value: category.description ?? '—' },
              ]}
            />
            <DetailHeading hint={t('Open a product to see its stock.')}>{t('Products')}</DetailHeading>
            <div className="max-h-72 overflow-auto rounded-md border border-outline-soft">
              <Table>
                <thead>
                  <tr>
                    <Th>{t('SKU')}</Th>
                    <Th>{t('Name')}</Th>
                    <Th>{t('Status')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((product) => (
                    <Tr key={product.id} onClick={() => onOpenProduct(product)}>
                      <Td className="font-mono text-xs">{product.sku}</Td>
                      <Td tone="strong">{product.name}</Td>
                      <Td>
                        <StatusBadge tone={product.isActive ? 'green' : 'grey'} withDot>
                          {product.isActive ? t('Active') : t('Inactive')}
                        </StatusBadge>
                      </Td>
                    </Tr>
                  ))}
                  {members.length === 0 ? <EmptyRow colSpan={3}>{t('No products in this category.')}</EmptyRow> : null}
                </tbody>
              </Table>
            </div>
            {error ? (
              <div className="mt-4">
                <FormError>{error}</FormError>
              </div>
            ) : null}
          </div>
          <DetailFooter>
            {mayEdit ? (
              <Button
                variant="dangerGhost"
                className="mr-auto"
                disabled={busy || members.length > 0}
                title={members.length > 0 ? t('Move its products to another category first.') : undefined}
                onClick={remove}
              >
                {t('Delete')}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              {t('Close')}
            </Button>
            {mayEdit ? (
              <Button
                variant="primary"
                onClick={() => {
                  setForm({ name: category.name, description: category.description ?? '' })
                  setError(null)
                }}
              >
                {t('Edit')}
              </Button>
            ) : null}
          </DetailFooter>
        </>
      )}
    </Modal>
  )
}
