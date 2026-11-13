import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import { pageItems } from '@/shared/lib/pagination'
import { Icon } from './Icon'

interface PaginationProps {
  /** 1-based. */
  page: number
  pageCount: number
  onChange: (page: number) => void
  className?: string
}

const CELL = 'grid h-8 min-w-8 place-items-center rounded-sm px-2 text-xs tabular-nums transition-colors duration-200'

/** Previous / page numbers / next. Draws nothing while everything fits on one page. */
export function Pagination({ page, pageCount, onChange, className }: PaginationProps) {
  if (pageCount <= 1) return null

  const go = (target: number) => {
    if (target >= 1 && target <= pageCount && target !== page) onChange(target)
  }

  return (
    <nav aria-label={t('Pagination')} className={cx('flex items-center gap-1', className)}>
      <button
        type="button"
        className={cx(CELL, 'text-ink-2 hover:bg-container-high hover:text-ink disabled:pointer-events-none disabled:opacity-40')}
        aria-label={t('Previous page')}
        disabled={page <= 1}
        onClick={() => go(page - 1)}
      >
        <Icon name="chevronLeft" size={14} />
      </button>
      {pageItems(page, pageCount).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className={cx(CELL, 'text-muted')} aria-hidden>
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={cx(
              CELL,
              item === page ? 'bg-primary font-semibold text-white' : 'text-ink-2 hover:bg-container-high hover:text-ink',
            )}
            aria-label={t('Page {page}', { page: item })}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => go(item)}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className={cx(CELL, 'text-ink-2 hover:bg-container-high hover:text-ink disabled:pointer-events-none disabled:opacity-40')}
        aria-label={t('Next page')}
        disabled={page >= pageCount}
        onClick={() => go(page + 1)}
      >
        <Icon name="chevronRight" size={14} />
      </button>
    </nav>
  )
}
