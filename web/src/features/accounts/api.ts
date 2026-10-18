import { apiRequest } from '@/shared/api/client'
import type {
  Account,
  AccountStatus,
  CreateAccountBody,
  CreateAccountResponse,
  ListAccountsResponse,
  UpdateAccountBody,
} from '@/shared/api/contracts'
import { ACCOUNTS } from './mock'

// Mock auto-login has no real session, so the API would answer 401; this mode keeps working on local rows.
const MOCK_MODE = import.meta.env.VITE_MOCK_AUTO_LOGIN === 'true'

/** GET /api/identity/accounts (Admin only). */
export async function listAccounts(): Promise<Account[]> {
  if (MOCK_MODE) return ACCOUNTS
  const response = await apiRequest<ListAccountsResponse>('/api/identity/accounts')
  return response.items
}

/**
 * POST /api/identity/accounts (Admin only). The server generates the password and returns it once.
 * Rejects with an `ApiError`: `username_taken` and `email_taken` (409), `validation_failed` (400).
 */
export async function createAccount(body: CreateAccountBody): Promise<CreateAccountResponse> {
  if (MOCK_MODE) {
    const account: Account = { id: `mock-${Date.now()}`, ...body, status: 'ACTIVE', lastLoginAt: null }
    return { account, temporaryPassword: 'Mock-Temp-Pass1' }
  }
  return apiRequest<CreateAccountResponse>('/api/identity/accounts', { method: 'POST', body: JSON.stringify(body) })
}

/**
 * PUT /api/identity/accounts/{id}. The username cannot change. Changing the role signs the person out everywhere.
 * Rejects with `email_taken`, `cannot_change_own_access` or `last_active_admin`.
 */
export async function updateAccount(account: Account, body: UpdateAccountBody): Promise<Account> {
  if (MOCK_MODE) return { ...account, ...body }
  return apiRequest<Account>(`/api/identity/accounts/${account.id}`, { method: 'PUT', body: JSON.stringify(body) })
}

/**
 * POST /api/identity/accounts/{id}/status. Only ACTIVE and INACTIVE can be set; LOCKED belongs to the system.
 * Deactivating also ends the person's open sessions. Rejects with `cannot_change_own_access` or `last_active_admin`.
 */
export async function setAccountStatus(account: Account, status: Extract<AccountStatus, 'ACTIVE' | 'INACTIVE'>): Promise<Account> {
  if (MOCK_MODE) return { ...account, status }
  return apiRequest<Account>(`/api/identity/accounts/${account.id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}
