import { useEffect, useRef, useState } from 'react'
import { t } from '@/shared/i18n'
import { downloadReport, type ReportExport } from '@/shared/api/reports'
import { cx } from '@/shared/lib/cx'
import { rangeWindow, type DayRange } from '@/shared/lib/dateRange'
import { Button } from '@/shared/ui/Button'
import { Icon } from '@/shared/ui/Icon'

const FILES: { kind: ReportExport; label: string; hint: string }[] = [
  { kind: 'summary', label: t('Summary'), hint: t('Every number on this page, CSV') },
  { kind: 'jobs', label: t('Jobs'), hint: t('One row per job, CSV') },
  { kind: 'requests', label: t('Transport requests'), hint: t('One row per request, CSV') },
  { kind: 'robots', label: t('Robots'), hint: t('Work and availability per robot, CSV') },
  { kind: 'all', label: t('Everything'), hint: t('All four files and a guide, ZIP') },
]

/**
 * FE-20: download the period on screen as files, or open it as a page to print or save as PDF. The files are built by
 * the server from the same statistics, for the same days, so they match what is shown.
 */
export function ExportMenu({ range, reportHref }: { range: DayRange; reportHref: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<ReportExport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

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

  const download = async (kind: ReportExport) => {
    setBusy(kind)
    setError(null)
    try {
      // Built now, like the page's own queries, so a range that reaches today counts up to this moment.
      await downloadReport(kind, rangeWindow(range))
      setOpen(false)
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={root} className="relative">
      <Button
        ref={trigger}
        variant="tonal"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setError(null)
          setOpen((value) => !value)
        }}
      >
        <Icon name="download" size={16} className="text-ink-2" />
        {t('Export')}
        <Icon name="chevronDown" size={14} className="text-muted" />
      </Button>

      {open ? (
        <div role="menu" aria-label={t('Export')} className="absolute top-[calc(100%+8px)] right-0 z-50 w-72 rounded-md bg-surface p-2 shadow-float">
          <ul className="flex flex-col">
            {FILES.map((file) => (
              <li key={file.kind}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy !== null}
                  className={cx(
                    'flex w-full items-center justify-between gap-3 rounded-sm px-3 py-1.5 text-left transition-colors duration-200',
                    'text-ink-2 hover:bg-container-high hover:text-ink disabled:cursor-wait',
                  )}
                  onClick={() => void download(file.kind)}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm text-ink">{file.label}</span>
                    <span className="text-xs text-muted">{file.hint}</span>
                  </span>
                  {busy === file.kind ? <Icon name="refresh" size={14} className="shrink-0 animate-spin" /> : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-outline-soft pt-2">
            <a
              role="menuitem"
              href={reportHref}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm text-ink transition-colors duration-200 hover:bg-container-high"
              onClick={() => setOpen(false)}
            >
              <Icon name="copy" size={14} className="text-ink-2" />
              {t('Print or save as PDF')}
            </a>
          </div>
          {error ? (
            <p role="alert" className="mt-2 px-3 pb-1 text-xs text-red-ink">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
