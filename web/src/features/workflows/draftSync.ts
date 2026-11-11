/**
 * The editor keeps its own copy of the workflow (the draft) and loads it from the server's copy once per workflow.
 * `draftKey` says which workflow the draft was loaded from; `null` means nothing has been loaded yet.
 *
 * It must start as `null`, not as the key of the workflow being opened: when the server's copy is already cached (the page
 * is opened a second time, or the code reloads under it), a draft that starts out "already loaded" is never filled in and
 * the editor shows an empty workflow in place of the real one.
 */
export function shouldLoadDraft(draftKey: string | null, loadedKey: string, ready: boolean): boolean {
  return loadedKey !== 'loading' && draftKey !== loadedKey && ready
}
