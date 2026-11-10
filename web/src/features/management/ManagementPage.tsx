import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Account, Product, ProductCategory } from '@/shared/api/contracts'
import { listWarehouses } from '@/shared/api/warehouses'
import { cx } from '@/shared/lib/cx'
import { useNotificationsHub } from '@/shared/realtime/useNotificationsHub'
import { listAccounts } from '@/features/accounts/api'
import { ACCOUNT_ROLES } from '@/features/accounts/constants'
import { AccountsSection } from './AccountsSection'
import { CategoriesSection } from './CategoriesSection'
import { ContainersSection } from './ContainersSection'
import { InventorySection } from './InventorySection'
import { LocationsSection } from './LocationsSection'
import { ProductsSection } from './ProductsSection'
import { RolesSection } from './RolesSection'
import { VOUCHERS_KEY, useStockVouchers } from './stockVouchers'
import { VouchersSection } from './VouchersSection'
import { WarehousesSection } from './WarehousesSection'
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
import { t } from '@/shared/i18n'
type TabId =

  | 'accounts'
  | 'roles'
  | 'warehouses'
  | 'products'
  | 'categories'
  | 'containers'
  | 'inventory'
  | 'vouchers'
  | 'locations'

const MENU: { label: string; items: { id: TabId; label: string }[] }[] = [
  {
    label: t('Access'),
    items: [
      { id: 'accounts', label: t('Accounts') },
      { id: 'roles', label: t('Roles') },
    ],
  },
  {
    label: t('Warehouse data'),
    items: [
      { id: 'warehouses', label: t('Warehouses') },
      { id: 'products', label: t('Products') },
      { id: 'categories', label: t('Categories') },
      { id: 'containers', label: t('Containers') },
      { id: 'inventory', label: t('Inventory') },
      { id: 'vouchers', label: t('Stock vouchers') },
      { id: 'locations', label: t('Storage locations') },
    ],
  },
]

const TAB_IDS: TabId[] = [
  'accounts',
  'roles',
  'warehouses',
  'products',
  'categories',
  'containers',
  'inventory',
  'vouchers',
  'locations',
]

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

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => listWarehouses({ take: 100 }),
  })
  const vouchersQuery = useStockVouchers(locationListing.warehouse?.id ?? null)

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

  // Containers and stock change when a robot delivers, so both lists reload in place (no "Loading" flash): on mount, when
  // their tab is opened, and shortly after any Job update (the stock write lands just after the dropoff is confirmed).
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const reloadContainers = useCallback(() => {
    listManagedContainers()
      .then((listing) => {
        if (!mounted.current) return
        setContainers(listing)
        setContainerState('ready')
      })
      .catch(() => {
        if (mounted.current) setContainerState((current) => (current === 'ready' ? current : 'error'))
      })
  }, [])

  const reloadInventory = useCallback(() => {
    listManagedInventory()
      .then((listing) => {
        if (!mounted.current) return
        setInventory(listing)
        setInventoryState('ready')
      })
      .catch(() => {
        if (mounted.current) setInventoryState((current) => (current === 'ready' ? current : 'error'))
      })
  }, [])

  useEffect(() => {
    reloadContainers()
    reloadInventory()
  }, [reloadContainers, reloadInventory])

  useEffect(() => {
    if (tab === 'containers') reloadContainers()
    if (tab === 'inventory') reloadInventory()
  }, [tab, reloadContainers, reloadInventory])

  const queryClient = useQueryClient()
  const reloadTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current)
    },
    [],
  )
  const onJobUpdated = useCallback(() => {
    if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current)
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null
      reloadContainers()
      reloadInventory()
      void queryClient.invalidateQueries({ queryKey: VOUCHERS_KEY })
    }, 1500)
  }, [reloadContainers, reloadInventory, queryClient])
  useNotificationsHub({ jobUpdated: onJobUpdated })

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
      warehouses: warehousesQuery.data?.total ?? warehousesQuery.data?.items.length ?? 0,
      products: products.length,
      categories: categories.length,
      containers: containers.total,
      inventory: inventory.items.reduce((sum, row) => sum + row.containerCount, 0),
      vouchers: vouchersQuery.data?.total ?? 0,
      locations: locationListing.items.length,
    }),
    [accounts, products, categories, locationListing, containers, inventory, warehousesQuery.data, vouchersQuery.data],
  )

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1500px] px-10 pt-8 pb-16">
        <header>
          <h1 className="text-4xl font-book">{t('Management')}</h1>
          <p className="mt-3 text-base text-ink-2">{t('Accounts, roles and warehouse master data in one place.')}</p>
        </header>

        <div className="mt-10 grid grid-cols-[220px_minmax(0,1fr)] items-start gap-10">
          <nav className="sticky top-4 flex flex-col gap-6" aria-label={t('Management sections')}>
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
            {tab === 'warehouses' ? <WarehousesSection /> : null}
            {tab === 'products' ? (
              <ProductsSection products={products} setProducts={setProducts} categories={categories} loadState={catalogState} />
            ) : null}
            {tab === 'categories' ? (
              <CategoriesSection categories={categories} setCategories={setCategories} products={products} loadState={catalogState} />
            ) : null}
            {tab === 'containers' ? <ContainersSection listing={containers} loadState={containerState} /> : null}
            {tab === 'inventory' ? <InventorySection listing={inventory} loadState={inventoryState} /> : null}
            {tab === 'vouchers' ? <VouchersSection warehouse={locationListing.warehouse} products={products} /> : null}
            {tab === 'locations' ? (
              <LocationsSection
                listing={locationListing}
                setItems={(update) => setLocationListing((current) => ({ ...current, items: update(current.items) }))}
                loadState={locationState}
              />
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
