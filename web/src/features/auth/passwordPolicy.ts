import { t } from '@/shared/i18n'
export const MIN_PASSWORD_LENGTH = 10

/** Same rules as the backend PasswordPolicy, checked first so the common mistakes do not need a round trip. */
export function passwordProblem(password: string, confirm: string, username: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return t('Use at least {MIN_PASSWORD_LENGTH} characters.', { MIN_PASSWORD_LENGTH })
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return t('Use at least one letter and one digit.')
  if (password.trim() !== password) return t('The password must not start or end with a space.')
  if (username.length >= 3 && password.toLowerCase().includes(username.toLowerCase()))
    return t('The password must not contain your username.')
  if (password !== confirm) return t('The two new passwords do not match.')
  return null
}
