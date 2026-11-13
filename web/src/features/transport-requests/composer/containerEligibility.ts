import type { ComposerContainer, WorkflowKind } from './types'

/**
 * Whether the chosen workflow can move this container, with the same rules the backend applies when the request is
 * created (CreateTransportRequest): INBOUND takes a container not on a shelf yet that is on a confirmed phiếu nhập;
 * OUTBOUND a container on a shelf that is on a confirmed phiếu xuất; INTERNAL_RELOCATION a container on a shelf.
 * Returns null when it can, else the reason (an i18n key).
 */
export function ineligibleReason(container: ComposerContainer, kind: WorkflowKind): string | null {
  const onShelf = container.status === 'STORED' && Boolean(container.currentStorageLocationId)
  const voucher = container.voucher
  switch (kind) {
    case 'INBOUND':
      if (onShelf) return 'Already on a shelf'
      if (!(voucher?.type === 'INBOUND' && voucher.status === 'CONFIRMED')) return 'Not on a confirmed receiving voucher'
      return null
    case 'OUTBOUND':
      if (!onShelf) return 'Not on a shelf'
      if (!(voucher?.type === 'OUTBOUND' && voucher.status === 'CONFIRMED')) return 'Not on a confirmed issue voucher'
      return null
    case 'INTERNAL':
      return onShelf ? null : 'Not on a shelf'
    default:
      return null
  }
}

export interface ContainerGroup {
  key: string
  /** Voucher code, shelf code or the "other" heading (an i18n key). */
  title: string
  /** A confirmed voucher of the workflow's type: "select the whole voucher" applies. */
  voucher: boolean
  items: ComposerContainer[]
}

/**
 * INBOUND / OUTBOUND: one group per confirmed voucher of that type, newest first, then the rest.
 * INTERNAL: one group per shelf. Other workflows: one group.
 */
export function groupContainers(containers: ComposerContainer[], kind: WorkflowKind): ContainerGroup[] {
  if (kind === 'INBOUND' || kind === 'OUTBOUND') {
    const byVoucher = new Map<string, { at: string; group: ContainerGroup }>()
    const rest: ComposerContainer[] = []
    for (const item of containers) {
      const voucher = item.voucher
      if (voucher && voucher.type === kind && voucher.status === 'CONFIRMED') {
        const entry = byVoucher.get(voucher.id) ?? {
          at: voucher.confirmedAt ?? voucher.createdAt,
          group: { key: voucher.id, title: voucher.code, voucher: true, items: [] },
        }
        entry.group.items.push(item)
        byVoucher.set(voucher.id, entry)
      } else {
        rest.push(item)
      }
    }
    const groups = [...byVoucher.values()].sort((a, b) => b.at.localeCompare(a.at)).map((entry) => entry.group)
    return rest.length > 0 ? [...groups, { key: 'other', title: 'Other containers', voucher: false, items: rest }] : groups
  }
  if (kind === 'INTERNAL') {
    const byShelf = new Map<string, ContainerGroup>()
    for (const item of containers) {
      const key = item.currentLocationCode ?? ''
      const group = byShelf.get(key) ?? { key: key || 'none', title: key || 'Not on a shelf', voucher: false, items: [] }
      group.items.push(item)
      byShelf.set(key, group)
    }
    return [...byShelf.values()].sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : a.title.localeCompare(b.title)))
  }
  return containers.length > 0 ? [{ key: 'all', title: 'Containers', voucher: false, items: containers }] : []
}
