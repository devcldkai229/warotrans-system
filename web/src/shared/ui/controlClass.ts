import { cx } from '@/shared/lib/cx'

export type ControlSize = 'sm' | 'md' | 'lg' | 'area' | 'pill'

const CONTROL_SIZE: Record<ControlSize, string> = {
  sm: 'h-9 w-full px-2.5 text-xs',
  md: 'h-10 w-full px-3 text-sm',
  lg: 'h-12 w-full px-4 text-sm',
  area: 'min-h-20 w-full resize-y px-3 py-2 text-sm',
  pill: 'h-9 pr-3 pl-4 text-sm',
}

/**
 * Shared look of text inputs, selects and textareas. `sm` is for dense editors, `area` for textareas and `pill`
 * for the filters of a toolbar. `className` is for layout only: sizes and colours come from `size`.
 */
export function controlClass(size: ControlSize = 'md', className?: string) {
  return cx(
    'min-w-0 border text-ink transition-colors duration-200 placeholder:text-muted',
    'focus:border-blue focus:outline-2 focus:outline-offset-0 focus:outline-blue/25',
    'disabled:bg-container disabled:text-muted',
    size === 'pill'
      ? 'rounded-full border-transparent bg-container-high hover:bg-container-higher focus:bg-container-high'
      : 'rounded-sm border-outline bg-container-high hover:border-ink/30',
    CONTROL_SIZE[size],
    className,
  )
}
