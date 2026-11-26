/**
 * The one list of container problem codes, as the backend has it (ContainerProblemCodes.cs) and the web shows it
 * (web/src/features/operations/containerProblems.ts). From outside at a pickup or drop-off (HANDOVER) a person only sees
 * the box; what is inside is checked at the quality inspection (INSPECTION), where every code may be given.
 */
export type ContainerProblemScope = 'HANDOVER' | 'INSPECTION';

export interface ContainerProblem {
  code: string;
  scope: ContainerProblemScope;
  /** An open issue with this code refuses the confirmation of that container's handover. */
  blocksHandover: boolean;
  label: string;
  hint: string;
}

export const CONTAINER_PROBLEMS: ContainerProblem[] = [
  { code: 'WRONG_CONTAINER', scope: 'HANDOVER', blocksHandover: true, label: 'Wrong container', hint: 'The container here or scanned is not the one expected.' },
  { code: 'MISSING_CONTAINER', scope: 'HANDOVER', blocksHandover: true, label: 'Missing container', hint: 'The expected container cannot be found.' },
  { code: 'CONTAINER_DAMAGED', scope: 'HANDOVER', blocksHandover: false, label: 'Container damaged', hint: 'Cracked, punctured or broken shell or handle.' },
  { code: 'BARCODE_UNREADABLE', scope: 'HANDOVER', blocksHandover: false, label: 'Label unreadable', hint: 'Label missing, torn or smeared: reprint it.' },
  { code: 'UNSAFE_LOAD', scope: 'HANDOVER', blocksHandover: false, label: 'Unsafe to carry', hint: 'Too heavy, too large or stacked unsafely for the robot.' },
  { code: 'OTHER', scope: 'HANDOVER', blocksHandover: false, label: 'Other', hint: 'Anything else: say what in the note.' },
  { code: 'PRODUCT_MISMATCH', scope: 'INSPECTION', blocksHandover: false, label: 'Wrong product inside', hint: 'What is inside is not the declared product.' },
  { code: 'QUANTITY_MISMATCH', scope: 'INSPECTION', blocksHandover: false, label: 'Quantity mismatch', hint: 'The count differs from the recorded quantity.' },
  { code: 'CONTENTS_DAMAGED', scope: 'INSPECTION', blocksHandover: false, label: 'Contents damaged', hint: 'Goods broken, wet, spoiled or leaking.' },
  { code: 'PACKAGING_DEFECT', scope: 'INSPECTION', blocksHandover: false, label: 'Packaging or seal broken', hint: 'Seal cut, wrap torn: not as packed.' },
];

/** What a person can report here: from outside at a pickup or drop-off, everything at the inspection. */
export function problemsFor(scope: ContainerProblemScope): ContainerProblem[] {
  const outside = CONTAINER_PROBLEMS.filter(problem => problem.scope === 'HANDOVER');
  return scope === 'INSPECTION' ? [...CONTAINER_PROBLEMS.filter(problem => problem.scope === 'INSPECTION'), ...outside] : outside;
}
