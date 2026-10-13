import { useState } from 'react'
import type { Product, ProductCategory } from '@/shared/api/contracts'
import { Dialog } from '@/shared/ui/Dialog'
import { Field, FieldRow, FormError } from '@/shared/ui/Field'
import { controlClass } from '@/shared/ui/controlClass'
import { Table, Td, Th, Tr } from '@/shared/ui/Table'
import { AddButton, SectionHead } from './SectionHead'

interface CategoryDraft {
  code: string
  name: string
  description: string
}

interface CategoriesSectionProps {
  categories: ProductCategory[]
  setCategories: (update: (current: ProductCategory[]) => ProductCategory[]) => void
  products: Product[]
}

/** warehouse.product_categories: the code is unique. */
export function CategoriesSection({ categories, setCategories, products }: CategoriesSectionProps) {
  const [draft, setDraft] = useState<CategoryDraft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const productCount = (categoryId: string) => products.filter((product) => product.categoryId === categoryId).length

  function open() {
    setDraft({ code: '', name: '', description: '' })
    setError(null)
  }

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
  }

  return (
    <>
      <SectionHead title="Categories" hint="Groups that products belong to.">
        <AddButton onClick={open}>Add category</AddButton>
      </SectionHead>

      <Table>
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Name</Th>
            <Th>Description</Th>
            <Th align="right">Products</Th>
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
        </tbody>
      </Table>

      {draft ? (
        <Dialog title="Add category" submitLabel="Create category" onClose={() => setDraft(null)} onSubmit={save}>
          <FieldRow>
            <Field label="Code">
              <input
                className={controlClass()}
                value={draft.code}
                maxLength={100}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Name">
              <input
                className={controlClass()}
                value={draft.name}
                maxLength={100}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
          </FieldRow>
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
