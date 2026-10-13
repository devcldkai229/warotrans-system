import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Account, Product, ProductCategory, StorageLocationView } from '@/shared/api/contracts'
import { listAccounts } from '@/features/accounts/api'
import { ACCOUNT_ROLES } from '@/features/accounts/constants'
import { AccountsSection } from './AccountsSection'
import { CategoriesSection } from './CategoriesSection'
import { ContainersSection } from './ContainersSection'
import { InventorySection } from './InventorySection'
import { LocationsSection } from './LocationsSection'
import { ProductsSection } from './ProductsSection'
import { RolesSection } from './RolesSection'
import { CATEGORIES, CONTAINERS, INVENTORY, PRODUCTS, STORAGE_LOCATIONS } from './mock'
import './management.css'

type TabId = 'accounts' | 'roles' | 'products' | 'categories' | 'containers' | 'inventory' | 'locations'

const MENU: { label: string; items: { id: TabId; label: string }[] }[] = [
  {
    label: 'Access',
    items: [
      { id: 'accounts', label: 'Accounts' },
      { id: 'roles', label: 'Roles' },
    ],
  },
  {
    label: 'Warehouse data',
    items: [
      { id: 'products', label: 'Products' },
      { id: 'categories', label: 'Categories' },
      { id: 'containers', label: 'Containers' },
      { id: 'inventory', label: 'Inventory' },
      { id: 'locations', label: 'Storage locations' },
    ],
  },
]

const TAB_IDS: TabId[] = ['accounts', 'roles', 'products', 'categories', 'containers', 'inventory', 'locations']

/**
 * Accounts, roles and the Warehouse module's master data in one screen: the left menu switches sections without leaving
 * the page. Every list follows its database table (see mock.ts and each section).
 */
export function ManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab') as TabId | null
  const tab: TabId = requested && TAB_IDS.includes(requested) ? requested : 'accounts'

  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [products, setProducts] = useState<Product[]>(PRODUCTS)
  const [categories, setCategories] = useState<ProductCategory[]>(CATEGORIES)
  const [locations, setLocations] = useState<StorageLocationView[]>(STORAGE_LOCATIONS)

  useEffect(() => {
    let cancelled = false
    listAccounts()
      .then((items) => {
        if (cancelled) return
        setAccounts(items)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // What the left menu shows next to each entry.
  const counts = useMemo<Record<TabId, number>>(
    () => ({
      accounts: accounts.length,
      roles: ACCOUNT_ROLES.length,
      products: products.length,
      categories: categories.length,
      containers: CONTAINERS.length,
      inventory: INVENTORY.reduce((sum, row) => sum + row.containerCount, 0),
      locations: locations.length,
    }),
    [accounts, products, categories, locations],
  )

  return (
    <div className="mgmt">
      <header className="mgmt__head">
        <h1>Management</h1>
        <p>Accounts, roles and warehouse master data in one place.</p>
      </header>

      <div className="mgmt__layout">
        <nav className="mnav" aria-label="Management sections">
          {MENU.map((group) => (
            <div key={group.label} className="mnav__group">
              <p>{group.label}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`mnav__item${tab === item.id ? ' is-active' : ''}`}
                  aria-current={tab === item.id ? 'page' : undefined}
                  onClick={() => setSearchParams({ tab: item.id }, { replace: true })}
                >
                  <span>{item.label}</span>
                  <em>{counts[item.id]}</em>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <section className="msec">
          {tab === 'accounts' ? <AccountsSection accounts={accounts} setAccounts={setAccounts} loadState={loadState} /> : null}
          {tab === 'roles' ? <RolesSection accounts={accounts} /> : null}
          {tab === 'products' ? <ProductsSection products={products} setProducts={setProducts} categories={categories} /> : null}
          {tab === 'categories' ? (
            <CategoriesSection categories={categories} setCategories={setCategories} products={products} />
          ) : null}
          {tab === 'containers' ? <ContainersSection containers={CONTAINERS} /> : null}
          {tab === 'inventory' ? <InventorySection inventory={INVENTORY} /> : null}
          {tab === 'locations' ? <LocationsSection locations={locations} setLocations={setLocations} /> : null}
        </section>
      </div>
    </div>
  )
}
