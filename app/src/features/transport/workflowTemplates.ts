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
    id: 'inbound',
    code: 'INBOUND_PUTAWAY',
    name: 'Inbound Putaway',
    category: 'INBOUND',
    note: 'Dock ➔ Storage Racks (Multi-Tote)',
    icon: 'package-check',
    tone: '#eff6ff',
    badgeTone: '#2563eb',
  },
  {
    id: 'outbound',
    code: 'OUTBOUND_RETRIEVAL',
    name: 'Outbound Retrieval',
    category: 'OUTBOUND',
    note: 'Storage Racks ➔ Outbound Shipping Bay',
    icon: 'truck',
    tone: '#fffbeb',
    badgeTone: '#d97706',
  },
  {
    id: 'reallocation',
    code: 'INTERNAL_RELOCATION',
    name: 'Reallocation',
    category: 'INTERNAL',
    note: 'Internal Slot Reallocation / Consolidation',
    icon: 'rotate-cw',
    tone: '#f0fdf4',
    badgeTone: '#16a34a',
  },
  {
    id: 'point-to-point',
    code: 'POINT_TO_POINT_TRANSPORT',
    name: 'Point-to-Point',
    category: 'DIRECT',
    note: 'Direct Station Transport / Empty Tote Return',
    icon: 'navigation',
    tone: '#f1f5f9',
    badgeTone: '#475569',
  },
  {
    id: 'replenishment',
    code: 'REPLENISHMENT',
    name: 'Replenishment',
    category: 'INTERNAL',
    note: 'Buffer Storage (Zone D) ➔ Active Pick-Face',
    icon: 'layers',
    tone: '#eff6ff',
    badgeTone: '#2563eb',
  },
  {
    id: 'block-path',
    code: 'BLOCK_PATH_HAZARD',
    name: 'Block Path Hazard',
    category: 'SAFETY',
    note: 'Report Blocked Aisle / Temporary Obstacle',
    icon: 'octagon',
    tone: '#fef2f2',
    badgeTone: '#dc2626',
  },
];

export const WORKFLOW_TEMPLATES = WORKFLOWS;
