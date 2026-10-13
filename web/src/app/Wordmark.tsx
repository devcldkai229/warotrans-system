import { cx } from '@/shared/lib/cx'

/** The WaroTrans mark: a route between two Endpoints, next to the name. */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg'
  return (
    <span className={cx('inline-flex items-center font-medium text-ink', large ? 'gap-3 text-xl' : 'gap-2.5 text-base')}>
      <svg width={large ? 34 : 26} height={large ? 34 : 26} viewBox="0 0 26 26" aria-hidden="true">
        <rect width="26" height="26" rx="13" fill="currentColor" />
        <path d="M8 17.5h6.2a2.9 2.9 0 0 0 0-5.8h-2.4a2.9 2.9 0 0 1 0-5.8H18" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="8" cy="17.5" r="2" fill="#3279f9" stroke="#fff" strokeWidth="1.2" />
        <circle cx="18" cy="5.9" r="1.4" fill="#fff" />
      </svg>
      WaroTrans
    </span>
  )
}
