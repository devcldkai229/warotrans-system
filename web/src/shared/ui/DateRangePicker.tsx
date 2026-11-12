import { useEffect, useRef, useState } from 'react'
import { t } from '@/shared/i18n'
import { cx } from '@/shared/lib/cx'
import {
  formatRange,
  MAX_RANGE_DAYS,
  presetRange,
  rangeProblem,
  type DayRange,
  type RangeChoice,
  type RangePreset,
  type RangeProblem,
} from '@/shared/lib/dateRange'
import { Button } from './Button'
import { controlClass } from './controlClass'
import { Icon } from './Icon'

const PRESET_LABEL: Record<RangePreset, string> = {
  today: t('Today'),
  yesterday: t('Yesterday'),
  '7d': t('Last 7 days'),
  '30d': t('Last 30 days'),
  'this-month': t('This month'),
  'last-month': t('Last month'),
  '90d': t('Last 90 days'),
}

/** The presets offered in the list. Yesterday and 90 days still open from a link; any other span is a custom range. */
const SHOWN_PRESETS: RangePreset[] = ['today', '7d', '30d', 'this-month', 'last-month']

const PROBLEM_TEXT: Record<RangeProblem, string> = {
  incomplete: t('Choose a start and an end date.'),
  backwards: t('The end date is before the start date.'),
  future: t('The range cannot end after today.'),
  'too-long': t('A range can span at most {days} days.', { days: MAX_RANGE_DAYS }),
}

interface DateRangePickerProps {
  /** The preset in use, or null for two fixed dates. */
  preset: RangePreset | null
  range: DayRange
  /** Today in Vietnam, `YYYY-MM-DD`: the presets count from it and nothing after it can be picked. */
  today: string
  onChange: (choice: RangeChoice) => void
  align?: 'start' | 'end'
}

/**
 * One button that says which days are shown ("Last 30 days · 14/10 – 12/11/2026") and opens the presets plus two
 * date fields for any other span. Escape or a click elsewhere closes it without changing anything.
 */
export function DateRangePicker({ preset, range, today, onChange, align = 'end' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DayRange>(range)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const problem = rangeProblem(draft, today)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const toggle = () => {
    // The fields start from what is shown, so changing one end is one edit.
    if (!open) setDraft(range)
    setOpen((value) => !value)
  }
  const choose = (choice: RangeChoice) => {
    onChange(choice)
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <div ref={root} className="relative">
      <Button ref={trigger} variant="tonal" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        <Icon name="calendar" size={16} className="text-ink-2" />
        {preset ? <span>{PRESET_LABEL[preset]}</span> : null}
        <span className={cx('tabular-nums', preset && 'font-normal text-ink-2')}>{formatRange(range)}</span>
        <Icon name="chevronDown" size={14} className="text-muted" />
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label={t('Date range')}
          className={cx(
            'absolute top-[calc(100%+8px)] z-50 w-72 rounded-md bg-surface p-2 shadow-float',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          <ul className="flex flex-col">
            {SHOWN_PRESETS.map((value) => {
              const selected = value === preset
              return (
                <li key={value}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    // The days are on the button once chosen; before that, hovering shows them.
                    title={formatRange(presetRange(value, today))}
                    className={cx(
                      'flex h-8 w-full items-center rounded-sm px-3 text-left text-sm transition-colors duration-200',
                      selected ? 'bg-container-high font-medium text-primary' : 'text-ink-2 hover:bg-container-high hover:text-ink',
                    )}
                    onClick={() => choose({ preset: value })}
                  >
                    {PRESET_LABEL[value]}
                  </button>
                </li>
              )
            })}
          </ul>

          <form
            className="mt-2 border-t border-outline-soft px-1 pt-3 pb-1"
            onSubmit={(event) => {
              event.preventDefault()
              if (!problem) choose({ range: draft })
            }}
          >
            <p className="mb-2 px-2 text-xs font-medium text-ink-2">{t('Custom range')}</p>
            <div className="flex items-end gap-2 px-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
                {t('From')}
                <input
                  type="date"
                  className={controlClass('sm', 'w-full')}
                  value={draft.from}
                  max={draft.to || today}
                  onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
                {t('To')}
                <input
                  type="date"
                  className={controlClass('sm', 'w-full')}
                  value={draft.to}
                  min={draft.from || undefined}
                  max={today}
                  onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                />
              </label>
            </div>
            {problem && problem !== 'incomplete' ? (
              <p role="alert" className="mt-2 px-2 text-xs text-amber-ink">
                {PROBLEM_TEXT[problem]}
              </p>
            ) : null}
            <div className="mt-3 flex justify-end px-2">
              <Button type="submit" variant="primary" size="sm" disabled={problem !== null}>
                {t('Apply')}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
