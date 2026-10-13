import { cx } from '@/shared/lib/cx'

export type ButtonVariant = 'primary' | 'tonal' | 'surface' | 'outline' | 'ghost' | 'danger' | 'dangerGhost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-surface hover:bg-ink-soft',
  tonal: 'bg-container-high text-ink hover:bg-container-higher',
  // For buttons that sit on a grey container instead of on the white page.
  surface: 'bg-surface text-ink hover:bg-container-high',
  outline: 'border border-outline text-ink hover:bg-container-high',
  ghost: 'text-ink-2 hover:bg-container-high hover:text-ink',
  danger: 'bg-red-soft text-red-ink hover:bg-red/15',
  dangerGhost: 'text-red-ink hover:bg-red-soft',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3.5 text-xs',
  md: 'h-9 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-sm',
}

export interface ButtonStyle {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
}

/**
 * The button look as a class string, for links that must look like a button.
 * `className` is for layout only (margins, alignment): colours and sizes come from the variant and size.
 */
export function buttonClass({ variant = 'tonal', size = 'md', block = false }: ButtonStyle = {}, className?: string) {
  return cx(
    'inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors duration-200',
    'disabled:pointer-events-none disabled:opacity-40',
    VARIANT[variant],
    SIZE[size],
    block && 'w-full',
    className,
  )
}
