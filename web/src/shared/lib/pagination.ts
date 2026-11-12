export type PageItem = number | 'gap'

/** How many pages `total` rows fill at `pageSize` per page; at least 1, so an empty list still has page 1. */
export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/**
 * The page buttons to draw: always the first and last page, the current one and one on each side, and a gap where
 * pages are left out. Up to seven pages are all shown. A gap never hides a single page (that page is shown instead),
 * so the number of buttons stays the same while paging through the middle.
 */
export function pageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)

  const current = Math.min(Math.max(page, 1), pageCount)
  let start = Math.max(2, current - 1)
  let end = Math.min(pageCount - 1, current + 1)
  // Near either end, show five pages in a row so the row does not shrink.
  if (current <= 4) {
    start = 2
    end = 5
  } else if (current >= pageCount - 3) {
    start = pageCount - 4
    end = pageCount - 1
  }

  const items: PageItem[] = [1]
  if (start > 2) items.push('gap')
  for (let value = start; value <= end; value += 1) items.push(value)
  if (end < pageCount - 1) items.push('gap')
  items.push(pageCount)
  return items
}
