import type { ButtonHTMLAttributes } from 'react'
import { cx } from '@/shared/lib/cx'
import { buttonClass, type ButtonStyle } from './buttonClass'

type ButtonProps = ButtonStyle & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ variant, size, block, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, block }, className)} {...rest} />
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only button has no visible text. */
  'aria-label': string
  size?: 'sm' | 'md'
  /** `surface` for buttons that sit on a grey container. */
  tone?: 'plain' | 'surface'
}

export function IconButton({ size = 'md', tone = 'plain', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'grid shrink-0 place-items-center rounded-full text-ink-2 transition-colors duration-200 hover:text-ink',
        'disabled:pointer-events-none disabled:opacity-40',
        tone === 'surface' ? 'bg-surface hover:bg-container-high' : 'hover:bg-container-high',
        size === 'sm' ? 'size-7' : 'size-9',
        className,
      )}
      {...rest}
    />
  )
}
