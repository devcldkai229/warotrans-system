import { ApiError, getUserErrorMessage, setAccessToken } from '../../shared/api/client';
import { getCurrentAccount } from '../../shared/api/identityApi';
import { clearAllStoredAuth, getStoredAccessToken, getStoredUserSession } from '../../shared/api/secureStore';
import type { UserSession } from '../../shared/types/contracts';

export type SessionRestoreResult =
  | { kind: 'ready'; session: UserSession }
  | { kind: 'signed-out' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'cancelled' };

/** Verify saved credentials before mounting operational screens. An outage keeps them available for Retry. */
export async function restoreSession(isCurrent: () => boolean = () => true): Promise<SessionRestoreResult> {
  try {
    const [token, stored] = await Promise.all([getStoredAccessToken(), getStoredUserSession<UserSession>()]);
    if (!isCurrent()) return { kind: 'cancelled' };
    if (!token || !stored) {
      setAccessToken(null);
      await clearAllStoredAuth();
      return { kind: 'signed-out' };
    }
    setAccessToken(token);
    const account = await getCurrentAccount();
    if (!isCurrent()) return { kind: 'cancelled' };
    if (typeof account?.id !== 'string' || !account.id || typeof account.username !== 'string' || !account.username
      || !['ADMIN', 'STAFF'].includes(account.role) || typeof account.status !== 'string') {
      throw new ApiError(502, 'INVALID_RESPONSE', 'Your account could not be verified. Please try again.');
    }
    if (account.status !== 'ACTIVE') {
      setAccessToken(null);
      await clearAllStoredAuth();
      return { kind: 'signed-out' };
    }
    const fullName = account.fullName || account.username;
    return { kind: 'ready', session: {
      ...stored, id: account.id, username: account.username, fullName,
      role: account.role === 'ADMIN' ? 'ADMIN' : 'STAFF',
      avatarInitials: fullName.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase(),
    } };
  } catch (error) {
    if (!isCurrent()) return { kind: 'cancelled' };
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
      setAccessToken(null);
      await clearAllStoredAuth();
      return { kind: 'signed-out' };
    }
    return { kind: 'unavailable', message: getUserErrorMessage(error, 'Your saved session could not be checked. Please try again.') };
  }
}
