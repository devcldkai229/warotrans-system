import { describe, expect, it } from 'vitest'
import { fileNameFromDisposition } from './client'

describe('fileNameFromDisposition', () => {
  it('prefers the UTF-8 name ASP.NET Core sends next to the plain one', () => {
    expect(
      fileNameFromDisposition(
        "attachment; filename=warotrans-summary_2026-10-01_2026-10-31.csv; filename*=UTF-8''warotrans-summary_2026-10-01_2026-10-31.csv",
      ),
    ).toBe('warotrans-summary_2026-10-01_2026-10-31.csv')
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''b%C3%A1o-c%C3%A1o.csv")).toBe('báo-cáo.csv')
  })

  it('reads a quoted or bare plain name', () => {
    expect(fileNameFromDisposition('attachment; filename="report.zip"')).toBe('report.zip')
    expect(fileNameFromDisposition('attachment; filename=report.zip')).toBe('report.zip')
  })

  it('is null when there is no name', () => {
    expect(fileNameFromDisposition(null)).toBeNull()
    expect(fileNameFromDisposition('attachment')).toBeNull()
  })
})
