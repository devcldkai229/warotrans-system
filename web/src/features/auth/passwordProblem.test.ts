import { describe, expect, it } from 'vitest'
import { passwordProblem } from './passwordPolicy'

describe('passwordProblem', () => {
  it('accepts a password that meets the backend policy', () => {
    expect(passwordProblem('Brand-New-Pass-42', 'Brand-New-Pass-42', 'alice')).toBeNull()
  })

  it.each([
    ['short1', 'at least 10'],
    ['onlyletterslong', 'letter and one digit'],
    ['1234567890123', 'letter and one digit'],
    [' leading-space-1', 'start or end'],
    ['alice-is-great-1', 'username'],
  ])('rejects %s', (password, message) => {
    expect(passwordProblem(password, password, 'alice')).toContain(message)
  })

  it('rejects two different new passwords', () => {
    expect(passwordProblem('Brand-New-Pass-42', 'Brand-New-Pass-43', 'alice')).toContain('do not match')
  })
})
