import { describe, expect, it } from 'vitest'
import { pageCountOf, pageItems } from './pagination'

describe('pageCountOf', () => {
  it('rounds up and never goes below one page', () => {
    expect(pageCountOf(0, 50)).toBe(1)
    expect(pageCountOf(50, 50)).toBe(1)
    expect(pageCountOf(51, 50)).toBe(2)
    expect(pageCountOf(250, 50)).toBe(5)
  })
})

describe('pageItems', () => {
  it('shows every page up to seven', () => {
    expect(pageItems(1, 1)).toEqual([1])
    expect(pageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('keeps five pages in a row near the start', () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20])
    expect(pageItems(4, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20])
  })

  it('shows the current page with one on each side in the middle', () => {
    expect(pageItems(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20])
  })

  it('keeps five pages in a row near the end', () => {
    expect(pageItems(17, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20])
    expect(pageItems(20, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20])
  })

  it('never hides a single page behind a gap', () => {
    for (let count = 8; count <= 12; count += 1) {
      for (let page = 1; page <= count; page += 1) {
        const items = pageItems(page, count)
        items.forEach((item, index) => {
          if (item !== 'gap') return
          const before = items[index - 1] as number
          const after = items[index + 1] as number
          expect(after - before).toBeGreaterThan(2)
        })
      }
    }
  })

  it('clamps a page outside the range', () => {
    expect(pageItems(0, 20)).toEqual(pageItems(1, 20))
    expect(pageItems(99, 20)).toEqual(pageItems(20, 20))
  })
})
