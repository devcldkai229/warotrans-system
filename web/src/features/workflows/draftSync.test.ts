import { describe, expect, it } from 'vitest'
import { shouldLoadDraft } from './draftSync'

describe('shouldLoadDraft', () => {
  it('loads the draft the first time, even when the workflow is already cached (the page opened a second time)', () => {
    // Before: the draft key started as the workflow's own key, so a cached workflow was never loaded into the editor.
    expect(shouldLoadDraft(null, 'wf-1', true)).toBe(true)
  })

  it('waits while the workflow is still loading', () => {
    expect(shouldLoadDraft(null, 'loading', false)).toBe(false)
    expect(shouldLoadDraft(null, 'wf-1', false)).toBe(false)
  })

  it('does not load again, so what the person typed is not thrown away on every render', () => {
    expect(shouldLoadDraft('wf-1', 'wf-1', true)).toBe(false)
  })

  it('loads again when the page moves to another workflow', () => {
    expect(shouldLoadDraft('wf-1', 'wf-2', true)).toBe(true)
  })

  it('starts a new workflow from an empty draft', () => {
    expect(shouldLoadDraft(null, 'new', true)).toBe(true)
    expect(shouldLoadDraft('new', 'new', true)).toBe(false)
  })
})
