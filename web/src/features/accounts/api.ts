import { apiRequest } from '@/shared/api/client'
import type { Account, ListAccountsResponse } from '@/shared/api/contracts'
import { ACCOUNTS } from './mock'

/** GET /api/identity/accounts (Admin only). */
export async function listAccounts(): Promise<Account[]> {
  // Mock auto-login has no real session, so the API would answer 401; keep the mock rows for that mode.
  if (import.meta.env.VITE_MOCK_AUTO_LOGIN === 'true') return ACCOUNTS
  const response = await apiRequest<ListAccountsResponse>('/api/identity/accounts')
  return response.items
}
