/** A clickable evidence reference: selects the item (highlights it in the list and moves the chart cursor). */
export function EvidenceChip({ id, onSelect }: { id: string; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className="rounded bg-container px-1.5 py-0.5 font-mono text-[10px] text-ink-2 hover:bg-container-high focus-visible:outline-2 focus-visible:outline-primary"
      title={id}
    >
      {id.replace(/^ev-[^-]+-/, '#')}
    </button>
  )
}
