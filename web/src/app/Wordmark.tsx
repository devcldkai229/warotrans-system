import { cx } from '@/shared/lib/cx'

/** WaroTrans brand mark (logo includes the wordmark). */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg'
  return (
    <img
      src="/logo_wrt.png"
      alt="WaroTrans"
      // The logo is dark on transparent: on the dark console it sits on a light tile, like an app icon.
      className={cx('block rounded-md bg-white object-contain object-left', large ? 'h-20 w-auto p-2' : 'h-9 w-auto p-0.5')}
    />
  )
}
