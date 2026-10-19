import { colors } from '../../shared/theme/colors';

export interface WorkflowItem {
  id: string;
  code: string;
  name: string;
  category: 'INBOUND' | 'OUTBOUND' | 'INTERNAL' | 'DIRECT' | 'SAFETY';
  note: string;
  icon: 'package-check' | 'truck' | 'rotate-cw' | 'navigation' | 'layers' | 'octagon' | 'life-buoy';
  tone: string;
  badgeTone: string;
}

export const WORKFLOWS: WorkflowItem[] = [
  {
    id: 'reallocation',
    code: 'INTERNAL_RELOCATION',
    name: 'Internal Relocation',
    category: 'INTERNAL',
    note: 'Endpoint-to-Endpoint / Rack Relocation · Live Runtime',
    icon: 'rotate-cw',
    tone: colors.successBg,
    badgeTone: colors.success,
  },
  {
    id: 'inbound',
    code: 'INBOUND_PUTAWAY',
    name: 'Inbound Putaway',
    category: 'INBOUND',
    note: 'Inbound Dock 01 ➔ Storage Endpoints',
    icon: 'package-check',
    tone: colors.primaryLight,
    badgeTone: colors.primary,
  },
  {
    id: 'outbound',
    code: 'OUTBOUND_RETRIEVAL',
    name: 'Outbound Retrieval',
    category: 'OUTBOUND',
    note: 'Storage Racks ➔ Outbound Shipping Bay',
    icon: 'truck',
    tone: colors.warningBg,
    badgeTone: colors.warning,
  },
  {
    id: 'point-to-point',
    code: 'POINT_TO_POINT_TRANSPORT',
    name: 'Point-to-Point',
    category: 'DIRECT',
    note: 'Direct Station Transport · Relocation Runtime',
    icon: 'navigation',
    tone: colors.surfaceSubtle,
    badgeTone: colors.textSecondary,
  },
  {
    id: 'replenishment',
    code: 'REPLENISHMENT',
    name: 'Replenishment',
    category: 'INTERNAL',
    note: 'Buffer Reserve ➔ Pick-Face · Relocation Runtime',
    icon: 'layers',
    tone: colors.primaryLight,
    badgeTone: colors.primary,
  },
];

export const WORKFLOW_TEMPLATES = WORKFLOWS;
