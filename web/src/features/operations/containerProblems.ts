import { t } from '@/shared/i18n'
import type { ContainerOutcome } from '@/shared/api/operations'

/** Where a container problem can be seen: from outside at any stop, or inside where the container is opened. */
export type ContainerProblemScope = 'HANDOVER' | 'INSPECTION'

export interface ContainerProblem {
  code: string
  scope: ContainerProblemScope
  /** An open issue with this code refuses the confirmation of that container's handover. */
  blocksHandover: boolean
  label: string
  hint: string
}

/** The one list of container problem codes, as the backend has it (ContainerProblemCodes.cs). */
export const CONTAINER_PROBLEMS: ContainerProblem[] = [
  { code: 'WRONG_CONTAINER', scope: 'HANDOVER', blocksHandover: true, label: t('Wrong container'), hint: t('The container here or scanned is not the one expected.') },
  { code: 'MISSING_CONTAINER', scope: 'HANDOVER', blocksHandover: true, label: t('Missing container'), hint: t('The expected container cannot be found.') },
  { code: 'CONTAINER_DAMAGED', scope: 'HANDOVER', blocksHandover: false, label: t('Container damaged'), hint: t('Cracked, punctured or broken shell or handle.') },
  { code: 'BARCODE_UNREADABLE', scope: 'HANDOVER', blocksHandover: false, label: t('Label unreadable'), hint: t('Label missing, torn or smeared: reprint it.') },
  { code: 'UNSAFE_LOAD', scope: 'HANDOVER', blocksHandover: false, label: t('Unsafe to carry'), hint: t('Too heavy, too large or stacked unsafely for the robot.') },
  { code: 'OTHER', scope: 'HANDOVER', blocksHandover: false, label: t('Other'), hint: t('Anything else: say what in the note.') },
  { code: 'PRODUCT_MISMATCH', scope: 'INSPECTION', blocksHandover: false, label: t('Wrong product inside'), hint: t('What is inside is not the declared product.') },
  { code: 'QUANTITY_MISMATCH', scope: 'INSPECTION', blocksHandover: false, label: t('Quantity mismatch'), hint: t('The count differs from the recorded quantity.') },
  { code: 'CONTENTS_DAMAGED', scope: 'INSPECTION', blocksHandover: false, label: t('Contents damaged'), hint: t('Goods broken, wet, spoiled or leaking.') },
  { code: 'PACKAGING_DEFECT', scope: 'INSPECTION', blocksHandover: false, label: t('Packaging or seal broken'), hint: t('Seal cut, wrap torn: not as packed.') },
]

const BY_CODE = new Map(CONTAINER_PROBLEMS.map((p) => [p.code, p]))

/** The problems a person can report here: from outside at a pickup or drop-off, everything at the inspection. */
export function problemsFor(scope: ContainerProblemScope): ContainerProblem[] {
  return scope === 'INSPECTION' ? CONTAINER_PROBLEMS : CONTAINER_PROBLEMS.filter((p) => p.scope === 'HANDOVER')
}

/** A readable name for a problem code (an unknown or legacy code is shown as it is). */
export function problemLabel(code: string | null | undefined): string {
  if (!code) return '—'
  if (code === 'container_reported_failed') return t('Reported failed')
  if (code === 'OFF_SHELF') return t('Set down off a shelf')
  return BY_CODE.get(code)?.label ?? code
}

export interface OutcomeOption {
  value: ContainerOutcome
  label: string
  hint: string
}

// A container is a packed box of goods, not a reusable tote: each outcome says what was done with the goods.
const OUTCOME: Record<ContainerOutcome, Omit<OutcomeOption, 'value'>> = {
  RELEASE: { label: t('Nothing wrong after all'), hint: t('Checked again: the package is used again as it is.') },
  ADJUST_QUANTITY: { label: t('Record the real quantity'), hint: t('Enter the quantity counted; the package is used again.') },
  REPACK: { label: t('Repacked'), hint: t('The goods were packed into a new box and labelled; the package keeps its code.') },
  RELABEL: { label: t('Relabelled'), hint: t('A new label was printed and stuck on.') },
  RESTACK: { label: t('Restacked'), hint: t('The goods were stacked again so the robot can carry the package.') },
  FOUND: { label: t('Found'), hint: t('The package was found where it is: back in use.') },
  SCRAP: { label: t('Scrap the whole package'), hint: t('Destroyed: the package leaves the stock.') },
  LOST: { label: t('Record as lost'), hint: t('Not found: the package leaves the stock.') },
}

// Damaged goods: the quantity outcome keeps the good part.
const PARTLY_DAMAGED: Omit<OutcomeOption, 'value'> = {
  label: t('Partly damaged: keep the good goods'),
  hint: t('Take the damaged goods out and enter how many are still good; the package is used again.'),
}

/** The choices for resolving an issue with that problem, in the order the backend allows them. */
export function outcomeOptions(problemCode: string | null | undefined, allowed: string[]): OutcomeOption[] {
  return allowed
    .filter((value): value is ContainerOutcome => value in OUTCOME)
    .map((value) => ({
      value,
      ...(problemCode === 'CONTENTS_DAMAGED' && value === 'ADJUST_QUANTITY' ? PARTLY_DAMAGED : OUTCOME[value]),
    }))
}

/** What was done with the package, once resolved (worded for its problem, like the choice was). */
export function outcomeResult(outcome: string | null | undefined, problemCode?: string | null): string | null {
  if (!outcome) return null
  if (outcome === 'SCRAP') return t('Scrapped')
  if (outcome === 'LOST') return t('Lost')
  if (problemCode === 'CONTENTS_DAMAGED' && outcome === 'ADJUST_QUANTITY') return PARTLY_DAMAGED.label
  return OUTCOME[outcome as ContainerOutcome]?.label ?? outcome
}

/** What a Warehouse container status reads as, with its hold reason (a package out of stock: why, when known). */
export function holdText(status: string, reason: string | null | undefined, outcome?: string | null): string {
  if (status === 'OUT_OF_SERVICE' && (outcome === 'SCRAP' || outcome === 'LOST')) return outcomeResult(outcome)!
  if (status !== 'HOLD') return status
  return reason ? `HOLD · ${problemLabel(reason)}` : 'HOLD'
}
