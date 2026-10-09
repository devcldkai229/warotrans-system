import type { Account, Facility } from '@/shared/api/contracts'

export const MOCK_ACCOUNT: Account = {
  id: '6f1c2f0a-0000-4000-8000-000000000001',
  username: 'thang.ho',
  email: 'thang.ho@warotrans.com',
  fullName: 'Ho Sy Thang',
  role: 'ADMIN',
  status: 'ACTIVE',
  lastLoginAt: '2026-09-20T09:12:00+07:00',
}

export const FACILITIES: Facility[] = [
  { code: 'WH-HN-01', name: 'Me Linh Logistics Hub', city: 'Hà Nội' },
  { code: 'WH-HCM-01', name: 'Thu Duc Distribution Center', city: 'TP. Hồ Chí Minh' },
]

// TODO(backend): gateway health/latency and the connected-fleet count have no endpoint yet (SignalR or /health).
export const GATEWAY_STATUS = { label: 'Core Gateway: ONLINE (14ms)', clusterTime: '16:30:00 UTC+7' }
export const FLEET_CONNECTED_LABEL = 'Fleet Connected (12 AMRs)'
