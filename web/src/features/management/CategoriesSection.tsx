import { useState } from 'react'
import { Can } from '@/features/auth/RequirePermission'
import { PERMISSIONS } from '@/shared/auth/permissions'
import type { Product, ProductCategory } from '@/shared/api/contracts'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { EmptyRow, Table, Td, Th, Tr } from '@/shared/ui/Table'
import { createCategory } from './api'
import { AddButton, SectionHead } from './SectionHead'
import { t } from '@/shared/i18n'
interface CategoryDraft {

  code: string
  name: string
  description: string
}

interface CategoriesSectionProps {
  categories: ProductCategory[]
  setCategories: (update: (current: ProductCategory[]) => ProductCategory[]) => void
  products: Product[]
  loadState: 'loading' | 'ready' | 'error'
}

/** warehouse.product_categories: the code is unique. */
export function CategoriesSection({ categories, setCategories, products, loadState }: CategoriesSectionProps) {
  const [draft, setDraft] = useState<CategoryDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const productCount = (categoryId: string) => products.filter((product) => product.categoryId === categoryId).length

  function open() {
    setDraft({ code: '', name: '', description: '' })
    setError(null)
  }

  async function save() {
    if (!draft) return
    const code = draft.code.trim().toUpperCase()
    if (!code || !draft.name.trim()) {
      setError(t('Code and name are required.'))
      return
    }
    if (categories.some((category) => category.code === code)) {
      setError(t('This category code already exists.'))
      return
    }

    setBusy(true)
    setError(null)
    try {
      const created = await createCategory({
        code,
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
      })
      setCategories((current) => [...current, created].sort((a, b) => a.code.localeCompare(b.code)))
      setDraft(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('The category could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionHead title={t('Categories')}>
        <Can permission={PERMISSIONS.warehouseWrite}>
          <AddButton onClick={open}>{t('Add category')}</AddButton>
        </Can>
      </SectionHead>

      <Table>
        <thead>
          <tr>
            <Th>{t('Code')}</Th>
            <Th>{t('Name')}</Th>
            <Th>{t('Description')}</Th>
            <Th align="right">{t('Products')}</Th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <Tr key={category.id}>
              <Td className="font-mono text-xs">{category.code}</Td>
              <Td tone="strong">{category.name}</Td>
              <Td tone="faint">{category.description ?? '—'}</Td>
              <Td align="right">{productCount(category.id)}</Td>
            </Tr>
          ))}
          {categories.length === 0 ? (
            <EmptyRow colSpan={4}>
              {loadState === 'loading'
                ? t('Loading categories…')
                : loadState === 'error'
                  ? t('Could not load categories. Check that the API is running, then reload.')
                  : t('No categories yet. Add the first one.')}
            </EmptyRow>
          ) : null}
        </tbody>
      </Table>

      {draft ? (
        <Dialog title={t('Add category')} submitLabel={t('Create category')} busy={busy} onClose={() => setDraft(null)} onSubmit={save}>
          <FieldRow>
            <Field label={t('Code')}>
              <input
                className={controlClass()}
                value={draft.code}
                maxLength={100}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                autoFocus
              />
            </Field>
            <Field label={t('Name')}>
              <input
                className={controlClass()}
                value={draft.name}
                maxLength={100}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
          </FieldRow>
          <Field label={t('Description')}>
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
