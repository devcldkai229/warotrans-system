import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebouncedValue } from './useDebouncedValue'

/**
 * A list whose filters and page live in the address, so a reload or a shared link shows the same rows. Changing any
 * filter starts again from page 1; other parameters (a tab, say) are kept.
 */
export function usePagedSearchParams() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1)

  const setParam = useCallback(
    (key: string, value: string) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (value) next.set(key, value)
          else next.delete(key)
          if (key !== 'page') next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  const setPage = useCallback((target: number) => setParam('page', target > 1 ? String(target) : ''), [setParam])

  return { params, page, setParam, setPage }
}

/**
 * A search box backed by `key` in the address: the box keeps every keystroke, the address (and so the query) follows
 * once typing pauses. Returns what is typed and the settled search.
 */
export function useSearchParam(params: URLSearchParams, setParam: (key: string, value: string) => void, key = 'q') {
  const [text, setText] = useState(() => params.get(key) ?? '')
  const typed = useDebouncedValue(text.trim(), 300)
  const settled = params.get(key) ?? ''
  useEffect(() => {
    if (settled !== typed) setParam(key, typed)
  }, [typed, settled, key, setParam])
  return { text, setText, search: settled }
}

/** A page past the end (an old link, or rows gone since) moves to the last page there is. */
export function useClampedPage(page: number, pageCount: number, settled: boolean, setPage: (page: number) => void) {
  useEffect(() => {
    if (settled && page > pageCount) setPage(pageCount)
  }, [settled, page, pageCount, setPage])
}
