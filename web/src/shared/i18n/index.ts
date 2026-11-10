import { vi } from './vi'

/**
 * Interface language of the web console (English or Vietnamese).
 *
 * The English text itself is the key: `t('Showing {count} of {total}', { count, total })`. English returns it as
 * written; Vietnamese looks it up in `./vi` and falls back to the English text when a sentence has no translation yet,
 * so a missing entry shows English instead of breaking the screen. `i18n.test.ts` checks that every sentence in the
 * source has an entry.
 *
 * Changing the language saves it and reloads the page. That keeps this module trivial: the language is fixed for the
 * life of the page, so `t` can be called anywhere, including in module-level constants.
 */
export type Language = 'en' | 'vi'

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
]

const STORAGE_KEY = 'warotrans.language'

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'vi'
}

/** The saved choice, else the browser's language (Vietnamese browsers get Vietnamese), else English. */
function detectLanguage(): Language {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    // Blocked storage: fall through to the browser's language.
  }
  const browser = typeof navigator === 'undefined' ? '' : navigator.language
  return browser.toLowerCase().startsWith('vi') ? 'vi' : 'en'
}

let current: Language = detectLanguage()
if (typeof document !== 'undefined') document.documentElement.lang = current

export function getLanguage(): Language {
  return current
}

/** The Intl locale of the interface language, for number and date formatting. */
export function getLocale(): string {
  return current === 'vi' ? 'vi-VN' : 'en-US'
}

/** Saves the language and reloads, so every screen (and every module-level constant) starts over in it. */
export function setLanguage(language: Language): void {
  if (language === current) return
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, language)
  } catch {
    // The choice then only lasts until the next visit, which is still better than refusing it.
  }
  current = language
  if (typeof window !== 'undefined') window.location.reload()
}

/** For tests: switches the language without touching storage or the page. */
export function setLanguageForTests(language: Language): void {
  current = language
}

export type TranslationValues = Record<string, string | number | null | undefined>

/** Replaces `{name}` in a sentence with the matching value; a name without a value stays as written. */
export function fill(template: string, values?: TranslationValues): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in values ? String(values[name] ?? '') : placeholder))
}

/** Translates a sentence (English is the key) and fills its `{placeholders}`. */
export function t(text: string, values?: TranslationValues): string {
  const template = current === 'vi' ? (vi[text] ?? text) : text
  return fill(template, values)
}

/**
 * Marks a sentence for translation without translating it yet, for text that is stored first and shown later
 * (a table of labels, an error code's message): `const LABEL = { A: msg('Alpha') }` then `t(LABEL[key])`.
 * The coverage test looks for it just like it looks for `t`.
 */
export function msg(text: string): string {
  return text
}
