import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Account, Product, ProductCategory } from '@/shared/api/contracts'
import { cx } from '@/shared/lib/cx'
import { listAccounts } from '@/features/accounts/api'
import { ACCOUNT_ROLES } from '@/features/accounts/constants'
import { AccountsSection } from './AccountsSection'
import { CategoriesSection } from './CategoriesSection'
import { ContainersSection } from './ContainersSection'
import { InventorySection } from './InventorySection'
import { LocationsSection } from './LocationsSection'
import { ProductsSection } from './ProductsSection'
import { RolesSection } from './RolesSection'
import {
  listCategories,
  listManagedContainers,
  listManagedInventory,
  listManagedLocations,
  listProducts,
  type ContainerListing,
  type InventoryListing,
  type LocationListing,
} from './api'

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
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [containers, setContainers] = useState<ContainerListing>({ warehouseName: null, items: [], total: 0 })
  const [containerState, setContainerState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [inventory, setInventory] = useState<InventoryListing>({ warehouseName: null, items: [], total: 0 })
  const [inventoryState, setInventoryState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [locationListing, setLocationListing] = useState<LocationListing>({ warehouse: null, items: [] })
  const [locationState, setLocationState] = useState<'loading' | 'ready' | 'error'>('loading')

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

  useEffect(() => {
    let cancelled = false
    Promise.all([listCategories(), listProducts()])
      .then(([loadedCategories, loadedProducts]) => {
        if (cancelled) return
        setCategories(loadedCategories)
        setProducts(loadedProducts)
        setCatalogState('ready')
      })
      .catch(() => {
        if (!cancelled) setCatalogState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listManagedContainers()
      .then((listing) => {
        if (cancelled) return
        setContainers(listing)
        setContainerState('ready')
      })
      .catch(() => {
        if (!cancelled) setContainerState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listManagedInventory()
      .then((listing) => {
        if (cancelled) return
        setInventory(listing)
        setInventoryState('ready')
      })
      .catch(() => {
        if (!cancelled) setInventoryState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listManagedLocations()
      .then((listing) => {
        if (cancelled) return
        setLocationListing(listing)
        setLocationState('ready')
      })
      .catch(() => {
        if (!cancelled) setLocationState('error')
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
      containers: containers.total,
      inventory: inventory.items.reduce((sum, row) => sum + row.containerCount, 0),
      locations: locationListing.items.length,
    }),
    [accounts, products, categories, locationListing, containers, inventory],
  )

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1500px] px-10 pt-8 pb-16">
        <header>
          <h1 className="text-4xl font-book">Management</h1>
          <p className="mt-3 text-base text-ink-2">Accounts, roles and warehouse master data in one place.</p>
        </header>

        <div className="mt-10 grid grid-cols-[220px_minmax(0,1fr)] items-start gap-10">
          <nav className="sticky top-4 flex flex-col gap-6" aria-label="Management sections">
            {MENU.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-3.5 text-xs text-muted">{group.label}</p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cx(
                      'flex h-9 w-full items-center justify-between gap-2 rounded-full px-3.5 text-left text-sm transition-colors duration-200',
                      tab === item.id ? 'bg-container-high font-medium text-ink' : 'text-ink-2 hover:bg-container-high hover:text-ink',
                    )}
                    aria-current={tab === item.id ? 'page' : undefined}
                    onClick={() => setSearchParams({ tab: item.id }, { replace: true })}
                  >
                    {item.label}
                    <span className="text-xs font-normal text-muted tabular-nums">{counts[item.id]}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <section className="min-w-0">
            {tab === 'accounts' ? <AccountsSection accounts={accounts} setAccounts={setAccounts} loadState={loadState} /> : null}
            {tab === 'roles' ? <RolesSection accounts={accounts} /> : null}
            {tab === 'products' ? <ProductsSection products={products} setProducts={setProducts} categories={categories} loadState={catalogState} /> : null}
            {tab === 'categories' ? (
              <CategoriesSection categories={categories} setCategories={setCategories} products={products} loadState={catalogState} />
            ) : null}
            {tab === 'containers' ? <ContainersSection listing={containers} loadState={containerState} /> : null}
            {tab === 'inventory' ? <InventorySection listing={inventory} loadState={inventoryState} /> : null}
            {tab === 'locations' ? <LocationsSection
                listing={locationListing}
                setItems={(update) => setLocationListing((current) => ({ ...current, items: update(current.items) }))}
                loadState={locationState}
              /> : null}
          </section>
        </div>
      </div>
    </div>
  )
}
