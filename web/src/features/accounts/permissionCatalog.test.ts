import { afterEach, describe, expect, it } from 'vitest'
import { holdsPermission as holds, PERMISSIONS } from '@/shared/auth/permissions'
import { setLanguageForTests } from '@/shared/i18n'
import { areasOf, describedPermissionCodes, permissionGroups } from './permissionCatalog'

afterEach(() => setLanguageForTests('en'))

describe('permission catalog', () => {
  it('describes every permission the web knows, and nothing the web does not (a typo in a code would hide a row)', () => {
    expect([...describedPermissionCodes()].sort()).toEqual(Object.values(PERMISSIONS).sort())
  })

  it('lists a permission only the server has under "Other", by its code', () => {
    const groups = permissionGroups([...Object.values(PERMISSIONS), 'billing.export'])

    expect(groups.at(-1)).toEqual({ id: 'other', title: 'Other', items: [{ code: 'billing.export', label: 'billing.export' }] })
    expect(permissionGroups(Object.values(PERMISSIONS)).some((group) => group.id === 'other')).toBe(false)
  })

  it('words the areas where a role may do something, in the interface language', () => {
    const technician = ['console.access', 'map.read', 'robot.read', 'robot.stop', 'issue.read']

    expect(areasOf(technician)).toEqual(['Accounts and console', 'Maps', 'Robots', 'Operations'])
    setLanguageForTests('vi')
    expect(areasOf(technician)).toEqual(['Tài khoản và bảng điều khiển', 'Bản đồ', 'Robot', 'Vận hành'])
    expect(areasOf([])).toEqual([])
  })
})

describe('holds', () => {
  const can = (...granted: string[]) => (permission: string) => granted.includes(permission)

  it('grants one permission, or any one of a list, and nothing to a session with none', () => {
    expect(holds(can('map.read'), PERMISSIONS.mapRead)).toBe(true)
    expect(holds(can('map.read'), PERMISSIONS.mapWrite)).toBe(false)
    expect(holds(can('warehouse.read'), [PERMISSIONS.userManage, PERMISSIONS.warehouseRead])).toBe(true)
    expect(holds(can(), [PERMISSIONS.userManage, PERMISSIONS.warehouseRead])).toBe(false)
  })
})
