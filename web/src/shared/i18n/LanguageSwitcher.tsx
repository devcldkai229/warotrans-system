import { cx } from '@/shared/lib/cx'
import { getLanguage, LANGUAGES, setLanguage, t } from './index'

/**
 * English / Tiếng Việt toggle. Each language is named in itself, so someone who cannot read the current one can still
 * find theirs. Choosing one saves it and reloads the page (see `setLanguage`).
 *
 * `compact` is the top-bar size: two-letter codes (EN, VI) with the full name as the tooltip.
 */
export function LanguageSwitcher({ className, compact = false }: { className?: string; compact?: boolean }) {
  const current = getLanguage()

  return (
    <div role="group" aria-label={t('Language')} className={cx('inline-flex rounded-full bg-container-high p-0.5 text-xs', className)}>
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          lang={code}
          title={label}
          aria-label={label}
          aria-pressed={code === current}
          className={cx(
            'rounded-full whitespace-nowrap transition-colors duration-200',
            compact ? 'h-7 min-w-9 px-2 font-medium' : 'h-7 px-3',
            code === current ? 'bg-primary text-white' : 'text-ink-2 hover:text-ink',
          )}
          onClick={() => setLanguage(code)}
        >
          {compact ? code.toUpperCase() : label}
        </button>
      ))}
    </div>
  )
}
