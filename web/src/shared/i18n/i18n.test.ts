/// <reference types="node" />
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { humanize } from '@/shared/lib/format'
import * as tones from '@/shared/ui/statusTones'
import { fill, getLanguage, getLocale, setLanguageForTests, t } from './index'
import { localizeServerMessage } from './serverErrors'
import { vi } from './vi'
import { viServerErrors } from './vi/serverErrors'

afterEach(() => setLanguageForTests('en'))

describe('t', () => {
  it('returns English as written and fills the placeholders', () => {
    expect(t('Cancel')).toBe('Cancel')
    expect(t('Showing {shown} of {total}', { shown: 3, total: 10 })).toBe('Showing 3 of 10')
  })

  it('leaves a placeholder without a value as written and prints a missing value as nothing', () => {
    expect(fill('Hello {name}, {other}', { name: 'Linh' })).toBe('Hello Linh, {other}')
    expect(fill('Job {no}{suffix}', { no: 'J-1', suffix: undefined })).toBe('Job J-1')
    expect(fill('Plain')).toBe('Plain')
  })

  it('translates to Vietnamese, filling placeholders and falling back to English for an unknown sentence', () => {
    setLanguageForTests('vi')

    expect(getLanguage()).toBe('vi')
    expect(t('Cancel')).toBe('Hủy')
    expect(t('Showing {shown} of {total}', { shown: 3, total: 10 })).toBe('Hiển thị 3 trên 10')
    expect(t('A sentence nobody translated')).toBe('A sentence nobody translated')
  })

  it('picks the locale of the language for numbers and dates', () => {
    expect(getLocale()).toBe('en-US')
    setLanguageForTests('vi')
    expect(getLocale()).toBe('vi-VN')
  })
})

describe('humanize', () => {
  it('words an enum value in the interface language', () => {
    expect(humanize('IN_PROGRESS')).toBe('In progress')
    setLanguageForTests('vi')
    expect(humanize('IN_PROGRESS')).toBe('Đang thực hiện')
    expect(humanize('RECOVERY_REQUIRED')).toBe('Cần khôi phục')
  })
})

describe('localizeServerMessage', () => {
  const english = "Job '804e638a' was not found."

  it('keeps the server wording in English', () => {
    expect(localizeServerMessage('job_not_found', english)).toBe(english)
  })

  it('re-says a known error code in Vietnamese with the values the server quoted', () => {
    setLanguageForTests('vi')

    expect(localizeServerMessage('job_not_found', english)).toBe("Không tìm thấy công việc '804e638a'.")
    expect(localizeServerMessage('storage_location_code_taken', "Storage location code 'A-1' already exists in warehouse 'WH-1'.")).toBe(
      "Mã vị trí lưu trữ 'A-1' đã tồn tại trong kho 'WH-1'.",
    )
  })

  it('falls back to the server wording for an unknown code, or a sentence the dictionary knows', () => {
    setLanguageForTests('vi')

    expect(localizeServerMessage('brand_new_code', 'Something new happened.')).toBe('Something new happened.')
    expect(localizeServerMessage(null, 'Cancel')).toBe('Hủy')
  })
})

describe('the Vietnamese dictionary', () => {
  const SRC = path.resolve(process.cwd(), 'src')

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === 'i18n' ? [] : sourceFiles(full)
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : []
    })
  }

  /** Every sentence written as t('…') or msg('…') in the source, with where it is. */
  function sentencesInSource() {
    const found = new Map<string, string>()
    for (const file of sourceFiles(SRC)) {
      const text = fs.readFileSync(file, 'utf8')
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === 't' || node.expression.text === 'msg')) {
          const [first] = node.arguments
          if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
            found.set(first.text, `${path.relative(SRC, file)}:${sf.getLineAndCharacterOfPosition(first.getStart(sf)).line + 1}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
    }
    return found
  }

  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1])

  it('has a translation for every sentence in the source', () => {
    const missing = [...sentencesInSource()].filter(([sentence]) => !(sentence in vi)).map(([sentence, where]) => `${where}  ${sentence}`)

    expect(missing).toEqual([])
  })

  it('never invents a placeholder the English sentence does not have', () => {
    const invented = Object.entries(vi)
      .filter(([english, vietnamese]) => placeholders(vietnamese).some((name) => !placeholders(english).includes(name)))
      .map(([english]) => english)

    expect(invented).toEqual([])
  })

  it('has no empty translation', () => {
    expect(Object.entries(vi).filter(([, vietnamese]) => vietnamese.trim() === '').map(([english]) => english)).toEqual([])
  })

  it('words every status the tone tables know', () => {
    const missing: string[] = []
    for (const [name, table] of Object.entries(tones)) {
      if (!name.endsWith('_TONE') || typeof table !== 'object' || table === null) continue
      for (const value of Object.keys(table)) {
        const english = humanize(value)
        if (!(english in vi)) missing.push(`${name}.${value} -> ${english}`)
      }
    }

    expect(missing).toEqual([])
  })

  it('words every backend error code with only the quoted values it can fill', () => {
    const bad = Object.entries(viServerErrors).filter(([, message]) => placeholders(message).some((name) => !/^q\d+$/.test(name)))

    expect(bad.map(([code]) => code)).toEqual([])
    expect(Object.keys(viServerErrors).length).toBeGreaterThan(100)
  })
})
