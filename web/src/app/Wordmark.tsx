import { cx } from '@/shared/lib/cx'

/** WaroTrans brand mark (logo includes the wordmark). */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg'
  return (
    <img
      src="/logo_wrt.png"
      alt="WaroTrans"
      className={cx('block object-contain object-left', large ? 'h-20 w-auto' : 'h-9 w-auto')}
    />
  )
}
