import { parseStaffInputs } from './dispatchData';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  ArrowRight,
  Barcode,
  Check,
  ChevronDown,
  Layers,
  MapPin,
  Package,
  Rocket,
  Search,
  Sparkles,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { typography } from '../../shared/theme/typography';
import { Text } from '../../shared/ui/Text';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import {
  AllocatedStorageSlot,
  ContainerListItem,
  EndpointDto,
  QueuedJobResponse,
  StorageLocationListItem,
  WarehouseListItem,
  WarehouseZoneCode,
  WorkflowListItem,
  createTransportRequest,
  getActiveMapVersion,
  getMapVersionDetail,
  getSeedContainersSnapshot,
  getStorageLocationsSnapshot,
  listContainers,
  listPublishedWorkflows,
  listStorageLocations,
  listWarehouses,
  queueTransportRequest,
  startJob,
  listRobots,
  RobotDto,
  FALLBACK_ROBOTS,
  getWorkflowRequestInputSchema, getContainerByBarcode, getTransportRequest,
  type WorkflowRequestInputSchema, type TransportRequestDetailResponse,
} from '../../shared/api';
import { WORKFLOWS, WorkflowItem } from './workflowTemplates';
import { WorkflowTemplateCard } from './WorkflowTemplateCard';
import { TargetSlotPickerModal } from './TargetSlotPickerModal';

export interface StagedContainer {
  id: string;
  barcode: string;
  status?: string;
  productName: string;
  sku: string;
  qty: number;
  sourceStorageLocationId: string | null;
  sourceStorageLocationCode: string | null;
  sourceEndpointId: string;
  sourceEndpointCode: string;
  sourceLevelNo: number | null;
  originDisplayLabel: string;
}

interface EndpointTargetOption {
  endpointId: string;
  endpointCode: string;
  label: string;
}

interface WorkflowRoutePreset {
  originLabel: string;
  originDetail: string;
  destinationLabel: string;
  poolTitle: string;
  requiresRackSlot: boolean;
  defaultTargetZone: WarehouseZoneCode;
  endpointOptions?: EndpointTargetOption[];
}

const TARGET_ZONE_OPTIONS: Array<{
  code: WarehouseZoneCode;
  shortLabel: string;
  detailLabel: string;
}> = [
  {
    code: 'ZONE_A',
    shortLabel: 'Zone A (Pick Racks)',
    detailLabel: 'Storage Zone A · Racks A-01..A-08',
  },
  {
    code: 'ZONE_B',
    shortLabel: 'Zone B (Heavy Reserve)',
    detailLabel: 'Storage Zone B · Racks B-01..B-04',
  },
  {
    code: 'ZONE_D',
    shortLabel: 'Zone D (Bulk Yard)',
    detailLabel: 'Bulk Yard Zone D · Racks D-01..D-02',
  },
];

const WORKFLOW_ROUTE_PRESETS: Record<string, WorkflowRoutePreset> = {
  inbound: {
    originLabel: 'Pickup Origin',
    originDetail: 'Inbound Dock 01 (Receiving Staging Lane)',
    destinationLabel: 'Target Storage Zone (Auto-Slotting + Override)',
    poolTitle: 'Staged at Inbound Dock 01',
    requiresRackSlot: true,
    defaultTargetZone: 'ZONE_A',
  },
  outbound: {
    originLabel: 'Retrieval Origin',
    originDetail: 'Storage Racks (Zone A & Zone B)',
    destinationLabel: 'Target Dispatch Endpoint',
    poolTitle: 'Stored Containers Available for Retrieval',
    requiresRackSlot: false,
    defaultTargetZone: 'DOCK',
    endpointOptions: [
      {
        endpointId: '00000000-0000-0000-0004-000000000004',
        endpointCode: 'DOCK-OUT-04',
        label: 'Outbound Dock 04 (Shipping Bay)',
      },
      {
        endpointId: '00000000-0000-0000-0004-000000000005',
        endpointCode: 'DOCK-OUT-01',
        label: 'Outbound Dock 01 (Express Courier)',
      },
      {
        endpointId: '00000000-0000-0000-0004-000000000033',
        endpointCode: 'PACKING-01',
        label: 'Packing Station 01 (Consolidation)',
      },
    ],
  },
  reallocation: {
    originLabel: 'Source Storage Racks',
    originDetail: 'Storage Zone A (Consolidation Candidates)',
    destinationLabel: 'Target Consolidation Zone (Auto-Slotting + Override)',
    poolTitle: 'Stored Containers for Reallocation',
    requiresRackSlot: true,
    defaultTargetZone: 'ZONE_B',
  },
  'point-to-point': {
    originLabel: 'Direct Station Origin',
    originDetail: 'QA Station 02 (Inspection Bay)',
    destinationLabel: 'Target Work Station Endpoint',
    poolTitle: 'Totes Ready at QA Station 02',
    requiresRackSlot: false,
    defaultTargetZone: 'STATION',
    endpointOptions: [
      {
        endpointId: '00000000-0000-0000-0004-000000000032',
        endpointCode: 'ASSEMBLY-01',
        label: 'Assembly Bench 01 (Production Line)',
      },
      {
        endpointId: '00000000-0000-0000-0004-000000000033',
        endpointCode: 'PACKING-01',
        label: 'Packing Bench 01 (Fulfillment)',
      },
      {
        endpointId: '00000000-0000-0000-0004-000000000004',
        endpointCode: 'DOCK-OUT-04',
        label: 'Outbound Dock 04 (Direct Cross-Dock)',
      },
    ],
  },
  replenishment: {
    originLabel: 'Bulk Reserve Origin',
    originDetail: 'Bulk Yard Zone D (Rack D-01 Reserve)',
    destinationLabel: 'Active Pick-Face Zone (Auto-Slotting + Override)',
    poolTitle: 'Bulk Reserve Totes in Yard D',
    requiresRackSlot: true,
    defaultTargetZone: 'ZONE_A',
  },
};

function mapContainerToStagedItem(c: ContainerListItem): StagedContainer {
  const endpointCode = c.currentEndpointCode || c.currentStorageLocationCode || 'Pickup Not Set';
  const originDisplayLabel = c.currentStorageLocationCode
    ? `${c.currentStorageLocationCode}${c.currentLevelNo ? ` · Level ${c.currentLevelNo}` : ''}`
    : c.currentEndpointCode
    ? `${c.currentEndpointCode}`
    : 'Select Pickup Endpoint';

  return {
    id: c.id,
    barcode: c.barcode,
    status: c.status,
    productName: c.productName || 'Warehouse Item',
    sku: c.productSku || 'SKU-GEN',
    qty: 1,
    sourceStorageLocationId: c.currentStorageLocationId || null,
    sourceStorageLocationCode: c.currentStorageLocationCode || null,
    sourceEndpointId: c.currentEndpointId || '',
    sourceEndpointCode: endpointCode,
    sourceLevelNo: c.currentLevelNo ?? null,
    originDisplayLabel,
  };
}

function buildWorkflowPool(
  workflowId: string,
  allContainers: ContainerListItem[],
  forceIncludeBarcode?: string
): StagedContainer[] {
  const filtered = allContainers.filter(container => ['CREATED', 'PACKED', 'STORED'].includes(container.status)).map(mapContainerToStagedItem);

  return filtered;
}

export function TransportCreationScreen() {
  const { goBack, navigate, params } = useNavigation();
  const { session } = useAuth();

  // Resolve initial workflow by id, code, or name
  const resolvedInitialWf = useMemo(() => {
    const raw = (params?.workflow || '').trim().toLowerCase();
    if (!raw) return WORKFLOWS[0];
    return (
      WORKFLOWS.find(
        (w) =>
          w.id.toLowerCase() === raw ||
          w.code.toLowerCase() === raw ||
          w.name.toLowerCase() === raw ||
          (raw.includes('realloc') && w.id === 'reallocation') ||
          (raw.includes('reloc') && w.id === 'reallocation') ||
          (raw.includes('replenish') && w.id === 'replenishment') ||
          (raw.includes('outbound') && w.id === 'outbound') ||
          (raw.includes('point') && w.id === 'point-to-point')
      ) || WORKFLOWS[0]
    );
  }, [params?.workflow]);

  // Step 1: Workflow Pick, Step 2: Configure Route & Payload, Step 3: Receipt
  const [step, setStep] = useState<number>(params?.workflow ? 2 : 1);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowItem>(resolvedInitialWf);

  const currentPreset = useMemo(() => {
    return WORKFLOW_ROUTE_PRESETS[selectedWorkflow.id] || WORKFLOW_ROUTE_PRESETS.inbound;
  }, [selectedWorkflow.id]);

  // Live warehouse containers & storage locations
  const [allContainers, setAllContainers] = useState<ContainerListItem[]>(() =>
    getSeedContainersSnapshot()
  );
  const [storageLocations, setStorageLocations] = useState<StorageLocationListItem[]>(() =>
    getStorageLocationsSnapshot()
  );

  // Tier 1: Target Zone (for Rack workflows) or Target Endpoint (for Station/Dock workflows)
  const [targetZone, setTargetZone] = useState<WarehouseZoneCode>(currentPreset.defaultTargetZone);
  const [selectedEndpointOption, setSelectedEndpointOption] = useState<EndpointTargetOption>(
    { endpointId: '', endpointCode: '', label: 'Select Destination' }
  );

  // Staged containers pool for current workflow
  const [stagedContainers, setStagedContainers] = useState<StagedContainer[]>(() =>
    buildWorkflowPool(resolvedInitialWf.id, getSeedContainersSnapshot(), params?.container)
  );
  const [selectedBarcodes, setSelectedBarcodes] = useState<string[]>(() => {
    const initialPool = buildWorkflowPool(
      resolvedInitialWf.id,
      getSeedContainersSnapshot(),
      params?.container
    );
    if (params?.container) {
      return [params.container];
    }
    return initialPool[0] ? [initialPool[0].barcode] : [];
  });

  // Tier 2: Custom per-container slot overrides (`barcode -> AllocatedStorageSlot`)
  const [customSlotOverrides, setCustomSlotOverrides] = useState<
    Record<string, AllocatedStorageSlot>
  >({});
  const [slotPickerTargetBarcode, setSlotPickerTargetBarcode] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [customBarcode, setCustomBarcode] = useState('');
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  // Backend metadata - default to demo warehouse ID
  const [activeWarehouseId, setActiveWarehouseId] = useState<string>(
    ''
  );
  const [activeMapVersionId, setActiveMapVersionId] = useState<string>(
    ''
  );
  const [endpoints, setEndpoints] = useState<EndpointDto[]>([]);
  const [publishedWorkflows, setPublishedWorkflows] = useState<WorkflowListItem[]>([]);
  const [contextReady, setContextReady] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [inputSchema, setInputSchema] = useState<WorkflowRequestInputSchema | null>(null);
  const [staffInputs, setStaffInputs] = useState<Record<string, string>>({});
  const [sourceOverride, setSourceOverride] = useState('');
  const [repeatDetails, setRepeatDetails] = useState<TransportRequestDetailResponse[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [availableRobots, setAvailableRobots] = useState<RobotDto[]>(FALLBACK_ROBOTS);
  const [selectedRobotId, setSelectedRobotId] = useState('');
  const [isStartingJob, setIsStartingJob] = useState(false);

  useEffect(() => {
    let mounted = true;
    listRobots().then((res) => {
      if (mounted && res.items.length > 0) {
        setAvailableRobots(res.items);
        setSelectedRobotId(res.items[0].id);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Target Destination Mode: 'ENDPOINT' vs 'SLOT'
  const [destinationType, setDestinationType] = useState<'ENDPOINT' | 'SLOT'>(
    'ENDPOINT'
  );
  const [perContainerEndpointOverrides, setPerContainerEndpointOverrides] = useState<
    Record<string, EndpointTargetOption>
  >({});

  const [dispatchedOrder, setDispatchedOrder] = useState<{
    id: string;
    requestCode: string;
    status: 'SUBMITTED' | 'QUEUED';
    jobs: QueuedJobResponse[];
    carrier: string;
    containerCount: number;
    containerAssignments: Array<{ barcode: string; targetLabel: string }>;
    estimatedMissions: number;
  } | null>(null);

  const availableWorkflows = useMemo(() => publishedWorkflows.map(workflow => {
    const preset = WORKFLOWS.find(item => item.code === workflow.code) || WORKFLOWS[0];
    return { ...preset, id: WORKFLOWS.some(item => item.code === workflow.code) ? preset.id : workflow.id,
      backendId: workflow.id, code: workflow.code, name: workflow.name };
  }), [publishedWorkflows]);
  useEffect(() => {
    if (!availableWorkflows.length) return;
    setSelectedWorkflow(current => {
      const wanted = String(params?.workflow || current.backendId || current.code).toLowerCase();
      const match = availableWorkflows.find(item => [item.backendId, item.id, item.code, item.name].some(value => value?.toLowerCase() === wanted));
      if (match) return match;
      if (params?.workflow) { setContextError('The requested workflow is not published. Select an available workflow.'); return { ...current, backendId: undefined }; }
      return availableWorkflows[0];
    });
  }, [availableWorkflows, params?.workflow]);
  useEffect(() => {
    let mounted = true;
    setInputSchema(null); setStaffInputs({});
    if (selectedWorkflow.backendId) getWorkflowRequestInputSchema(selectedWorkflow.backendId).then(schema => {
      if (mounted) setInputSchema(schema);
    }).catch(error => { if (mounted) setContextError(error.message || 'Workflow inputs could not be loaded.'); });
    return () => { mounted = false; };
  }, [selectedWorkflow.backendId]);

  // Dynamically resolve target endpoint choices from backend map endpoints
  const availableEndpointOptions: EndpointTargetOption[] = useMemo(() => {
    if (endpoints && endpoints.length > 0) {
      return endpoints.map((ep) => ({
        endpointId: ep.id,
        endpointCode: ep.code,
        label: ep.name ? `${ep.code} (${ep.name})` : ep.code,
      }));
    }
    return [];
  }, [endpoints]);

  useEffect(() => {
    if (availableEndpointOptions.length > 0) {
      const preferred =
        availableEndpointOptions.find(
          (ep) =>
            ep.endpointCode === 'EP-D' ||
            ep.endpointCode === 'RACK-B-01' ||
            ep.endpointCode === 'DOCK-OUT-04' ||
            ep.endpointCode.startsWith('EP-')
        ) || availableEndpointOptions[0];
      setSelectedEndpointOption(preferred);
    }
  }, [availableEndpointOptions]);

  useEffect(() => {
    let mounted = true;
    setContextReady(false); setContextError(null);
    async function loadBackendContext() {
      try {
        const [workflows, warehouses] = await Promise.all([listPublishedWorkflows(), listWarehouses({ isActive: true })]);
        const warehouse = warehouses.items[0];
        if (!warehouse) throw new Error('No active warehouse is configured.');
        const map = await getActiveMapVersion(warehouse.id);
        if (!map) throw new Error('This warehouse has no published active map.');
        const [containers, locations, detail] = await Promise.all([
          listContainers({ warehouseId: warehouse.id, eligibleOnly: true, take: 100 }),
          listStorageLocations({ warehouseId: warehouse.id, activeOnly: true }), getMapVersionDetail(map.id),
        ]);
        if (!mounted) return;
        setPublishedWorkflows(workflows.items); setActiveWarehouseId(warehouse.id); setActiveMapVersionId(map.id);
        setStorageLocations(locations.items); setAllContainers(containers.items);
        const pool = buildWorkflowPool(selectedWorkflow.id, containers.items, params?.container);
        setStagedContainers(pool); setEndpoints(detail.endpoints.filter(endpoint => endpoint.isEnabled));
        if (Array.isArray(params?.containers)) setSelectedBarcodes(params.containers);
        else if (params?.container) setSelectedBarcodes([params.container]);
        else setSelectedBarcodes(previous => previous.filter(code => pool.some(container => container.barcode === code)));
        if (params?.repeatRequestId) {
          const previous = await getTransportRequest(params.repeatRequestId);
          if (!mounted) return;
          setRepeatDetails(previous.details);
          const repeatOverrides: Record<string, EndpointTargetOption> = {};
          for (const line of previous.details) {
            const container = containers.items.find(item => item.id === line.containerId);
            const endpoint = detail.endpoints.find(item => item.id === line.destinationEndpointId && item.isEnabled);
            if (!container || !endpoint) throw new Error('A container or destination in the previous request is no longer available.');
            repeatOverrides[container.barcode] = { endpointId: endpoint.id, endpointCode: endpoint.code, label: endpoint.name || endpoint.code };
          }
          setPerContainerEndpointOverrides(repeatOverrides);
          setSelectedBarcodes(previous.details.map(line => containers.items.find(container => container.id === line.containerId)?.barcode).filter((code): code is string => Boolean(code)));
          setSelectedEndpointOption(current => {
            const endpoint = detail.endpoints.find(item => item.id === previous.details[0]?.destinationEndpointId);
            return endpoint ? { endpointId: endpoint.id, endpointCode: endpoint.code, label: endpoint.name } : current;
          });
          setStaffInputs(Object.fromEntries(Object.entries(previous.workflowInputs || {}).map(([key, value]) => [key, String(value)])));
        }
        setContextReady(true);
      } catch (error: any) { if (mounted) setContextError(error.message || 'Could not load dispatch context.'); }
    }
    void loadBackendContext();
    return () => { mounted = false; };
  }, [selectedWorkflow.id, params?.container, params?.repeatRequestId]);

  // Available slot count in the currently selected Target Zone
  const availableSlotsInTargetZone = useMemo(() => {
    const slots: AllocatedStorageSlot[] = [];
    storageLocations
      .filter((loc) => loc.isActive && loc.zone === targetZone)
      .forEach((rack) => {
        rack.shelfSlots.forEach((s) => {
          if (s.status === 'AVAILABLE') {
            slots.push({
              storageLocationId: rack.id,
              storageLocationCode: rack.code,
              storageLocationName: rack.name,
              endpointId: rack.endpointId,
              endpointCode: rack.endpointCode,
              levelNo: s.levelNo,
              zone: rack.zone,
              zoneLabel: rack.zoneLabel,
              displayLabel: `${rack.code} · Level ${s.levelNo}`,
            });
          }
        });
      });
    return slots;
  }, [storageLocations, targetZone]);

  // Tier 1 + Tier 2 Resolved Slot Assignments for every currently selected container
  const resolvedBatchAssignments = useMemo(() => {
    const result: Record<string, AllocatedStorageSlot & { isCustom?: boolean }> = {};
    if (!currentPreset.requiresRackSlot) return result;

    const usedKeys = new Set<string>();

    // First, respect any custom Tier-2 overrides for currently selected containers
    selectedBarcodes.forEach((barcode) => {
      const custom = customSlotOverrides[barcode];
      if (custom) {
        const key = `${custom.storageLocationId}:${custom.levelNo}`;
        usedKeys.add(key);
        result[barcode] = { ...custom, isCustom: true };
      }
    });

    // Second, auto-allocate remaining selected containers from `availableSlotsInTargetZone`
    selectedBarcodes.forEach((barcode) => {
      if (result[barcode]) return;
      const nextFree = availableSlotsInTargetZone.find(
        (s) => !usedKeys.has(`${s.storageLocationId}:${s.levelNo}`)
      );
      if (nextFree) {
        usedKeys.add(`${nextFree.storageLocationId}:${nextFree.levelNo}`);
        result[barcode] = { ...nextFree, isCustom: false };
      }
    });

    return result;
  }, [
    currentPreset.requiresRackSlot,
    selectedBarcodes,
    customSlotOverrides,
    availableSlotsInTargetZone,
    storageLocations,
    targetZone,
  ]);

  const handleSelectWorkflow = (wf: WorkflowItem) => {
    triggerHaptic('tap');
    setSelectedWorkflow(wf);
    const preset = WORKFLOW_ROUTE_PRESETS[wf.id] || WORKFLOW_ROUTE_PRESETS.inbound;
    setTargetZone(preset.defaultTargetZone);
    setDestinationType('ENDPOINT');
    if (availableEndpointOptions.length > 0) {
      setSelectedEndpointOption(
        availableEndpointOptions.find((ep) => ep.endpointCode === 'EP-D' || ep.endpointCode === 'DOCK-OUT-04') ||
        availableEndpointOptions[0]
      );
    }
    setCustomSlotOverrides({});
    setPerContainerEndpointOverrides({});
    const pool = buildWorkflowPool(wf.id, allContainers);
    setStagedContainers(pool);
    setSelectedBarcodes(pool[0] ? [pool[0].barcode] : []);
    setStep(2);
  };

  const handleChangeTargetZone = (zone: WarehouseZoneCode) => {
    triggerHaptic('tap');
    setTargetZone(zone);
    // Clear only auto-allocations; keep custom overrides if they belong to the new zone, or reset for clean batch slotting
    setCustomSlotOverrides({});
  };

  const handleOverrideContainerSlot = (barcode: string, newSlot: AllocatedStorageSlot) => {
    setCustomSlotOverrides((prev) => {
      const next = { ...prev };
      // If another selected container currently holds `newSlot`, swap its slot with `barcode`'s previous slot
      const targetKey = `${newSlot.storageLocationId}:${newSlot.levelNo}`;
      const previousOwner = Object.keys(resolvedBatchAssignments).find(
        (b) =>
          b !== barcode &&
          `${resolvedBatchAssignments[b].storageLocationId}:${resolvedBatchAssignments[b].levelNo}` ===
            targetKey
      );
      const currentSlotOfTarget = resolvedBatchAssignments[barcode];
      if (previousOwner && currentSlotOfTarget) {
        next[previousOwner] = {
          storageLocationId: currentSlotOfTarget.storageLocationId,
          storageLocationCode: currentSlotOfTarget.storageLocationCode,
          storageLocationName: currentSlotOfTarget.storageLocationName,
          endpointId: currentSlotOfTarget.endpointId,
          endpointCode: currentSlotOfTarget.endpointCode,
          levelNo: currentSlotOfTarget.levelNo,
          zone: currentSlotOfTarget.zone,
          zoneLabel: currentSlotOfTarget.zoneLabel,
          displayLabel: currentSlotOfTarget.displayLabel,
        };
      }
      next[barcode] = newSlot;
      return next;
    });
    toast.success(`Assigned ${barcode} ➔ ${newSlot.displayLabel}`);
  };

  // Toggle single container selection
  const handleToggleContainer = (barcode: string) => {
    triggerHaptic('tap');
    if (selectedBarcodes.includes(barcode)) {
      setSelectedBarcodes(selectedBarcodes.filter((b) => b !== barcode));
    } else {
      if (selectedBarcodes.length >= 10) {
        toast.warning('Maximum 10 containers allowed per dispatch batch.');
        return;
      }
      setSelectedBarcodes([...selectedBarcodes, barcode]);
    }
  };

  // Select all / Deselect all
  const handleToggleSelectAll = () => {
    triggerHaptic('tap');
    if (selectedBarcodes.length === stagedContainers.length) {
      setSelectedBarcodes([]);
    } else {
      const allBarcodes = stagedContainers.slice(0, 10).map((c) => c.barcode);
      setSelectedBarcodes(allBarcodes);
    }
  };

  // Add custom or scanned barcode
  const handleAddCustomBarcode = async () => {
    const code = customBarcode.trim();
    if (!code) return;
    try {
      const container = await getContainerByBarcode(code);
      if (!['CREATED', 'PACKED', 'STORED'].includes(container.status)) throw new Error('This container is not eligible for transport.');
      if (selectedBarcodes.length >= 10) throw new Error('Maximum 10 containers per request.');
      if (!allContainers.some(item => item.id === container.id)) {
        setAllContainers(previous => [...previous, container]);
        setStagedContainers(previous => [...previous, mapContainerToStagedItem(container)]);
      }
      setSelectedBarcodes(previous => [...new Set([...previous, container.barcode])]);
      setCustomBarcode(''); setIsAddingCustom(false);
      toast.success(`Container ${container.barcode} verified.`);
    } catch (error: any) { toast.error(error.message || 'Container lookup failed.'); }
  };

  const selectedContainers = useMemo(() => {
    return stagedContainers.filter((c) => selectedBarcodes.includes(c.barcode));
  }, [stagedContainers, selectedBarcodes]);

  const filteredStagedContainers = useMemo(() => {
    if (!searchQuery.trim()) return stagedContainers;
    const q = searchQuery.toLowerCase().trim();
    return stagedContainers.filter(
      (c) =>
        c.barcode.toLowerCase().includes(q) ||
        c.productName.toLowerCase().includes(q) ||
        c.sku.toLowerCase().includes(q)
    );
  }, [stagedContainers, searchQuery]);

  const estimatedMissions = Math.max(1, Math.ceil(selectedContainers.length / 2));

  const handleConfirmDispatch = async (autoQueue: boolean = false) => {
    if (selectedContainers.length === 0) {
      toast.warning('Please select at least 1 container to dispatch.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!contextReady || !activeWarehouseId || !activeMapVersionId) throw new Error('Wait for a valid warehouse and active map.');
      if (!selectedWorkflow.backendId || !inputSchema || inputSchema.workflowId !== selectedWorkflow.backendId) throw new Error('Select a published workflow and wait for its inputs to load.');
      const workflowInputs = parseStaffInputs(inputSchema.workflowInputs, staffInputs);
      const containerAssignmentsSummary: Array<{ barcode: string; targetLabel: string }> = [];
      const details = selectedContainers.map((selected, index) => {
        const container = allContainers.find(item => item.id === selected.id);
        if (!container) throw new Error(`Container ${selected.barcode} is no longer available.`);
        const previous = repeatDetails.find(line => line.containerId === container.id);
        const sourceLocation = storageLocations.find(location => location.id === container.currentStorageLocationId);
        const sourceId = container.currentEndpointId || sourceLocation?.endpointId || sourceOverride;
        const source = endpoints.find(endpoint => endpoint.id === sourceId);
        if (!source) throw new Error(`Select the pickup endpoint for ${container.barcode}.`);
        const slot = destinationType === 'SLOT' ? resolvedBatchAssignments[selected.barcode] : undefined;
        if (destinationType === 'SLOT' && !slot) throw new Error('Storage capacity is not available. Select an endpoint destination.');
        const requestedDestinationId = slot?.endpointId || perContainerEndpointOverrides[selected.barcode]?.endpointId || selectedEndpointOption.endpointId;
        const destination = endpoints.find(endpoint => endpoint.id === requestedDestinationId);
        if (!destination) throw new Error('Select an enabled destination on the active map.');
        if (destination.id === source.id) throw new Error(`Pickup and dropoff must differ for ${container.barcode}.`);
        const destinationLocation = slot ? storageLocations.find(location => location.id === slot.storageLocationId && location.endpointId === destination.id) : undefined;
        const repeatLocation = previous && previous.destinationEndpointId === destination.id
          ? storageLocations.find(location => location.id === previous.destinationStorageLocationId && location.endpointId === destination.id) : undefined;
        containerAssignmentsSummary.push({ barcode: container.barcode, targetLabel: destination.code });
        return {
          sequenceNo: index + 1, containerId: container.id,
          sourceStorageLocationId: sourceLocation?.id || null, sourceEndpointId: source.id,
          sourceLevelNo: sourceLocation ? container.currentLevelNo : null,
          destinationEndpointId: destination.id,
          destinationStorageLocationId: destinationLocation?.id || repeatLocation?.id || null,
          destinationLevelNo: destinationLocation ? slot?.levelNo ?? null : repeatLocation ? previous?.destinationLevelNo ?? null : null,
        };
      });
      const createPayload = { warehouseId: activeWarehouseId, mapVersionId: activeMapVersionId,
        workflowId: selectedWorkflow.backendId, workflowInputs, details,
        note: `${selectedWorkflow.name}: ${containerAssignmentsSummary.map(item => `${item.barcode} ➔ ${item.targetLabel}`).join(', ')}` };

      const created = await createTransportRequest(createPayload);

      // Refresh local storage locations snapshot after reservation


      if (autoQueue) {
        // One-tap Submit & Auto-Queue execution
        const queued = await queueTransportRequest(created.id);
        triggerHaptic('success');
        setDispatchedOrder({
          id: created.id,
          requestCode: created.requestCode,
          status: 'QUEUED',
          jobs: queued.jobs || [],
          carrier:
            (queued.jobs?.length || 1) > 1
              ? 'Awaiting Robot Assignment'
              : queued.jobs?.[0]?.assignedRobotCode || 'Awaiting Robot Assignment',
          containerCount: selectedContainers.length,
          containerAssignments: containerAssignmentsSummary,
          estimatedMissions: queued.jobs?.length || estimatedMissions,
        });
        toast.success(`Request ${created.requestCode} created & queued successfully!`);
      } else {
        // 2-Step Execution: Transition to Step 3 with status SUBMITTED
        triggerHaptic('success');
        setDispatchedOrder({
          id: created.id,
          requestCode: created.requestCode,
          status: 'SUBMITTED',
          jobs: [],
          carrier: 'Fleet Scheduler (Pending Queueing)',
          containerCount: selectedContainers.length,
          containerAssignments: containerAssignmentsSummary,
          estimatedMissions,
        });
        toast.success(`Transport Request ${created.requestCode} submitted!`);
      }
      setStep(3);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to dispatch mission');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQueueSubmittedRequest = async () => {
    if (!dispatchedOrder?.id) return;
    setIsQueueing(true);
    try {
      const queued = await queueTransportRequest(dispatchedOrder.id);
      triggerHaptic('success');
      setDispatchedOrder((prev) =>
        prev
          ? {
              ...prev,
              status: 'QUEUED',
              jobs: queued.jobs || [],
              carrier:
                (queued.jobs?.length || 1) > 1
                  ? 'Awaiting Robot Assignment'
                  : queued.jobs?.[0]?.assignedRobotCode || 'Awaiting Robot Assignment',
              estimatedMissions: queued.jobs?.length || prev.estimatedMissions,
            }
          : null
      );
      toast.success(
        `Request ${dispatchedOrder.requestCode} queued! Job: ${
          queued.jobs?.[0]?.jobNo || 'Assigned'
        }`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to queue request');
    } finally {
      setIsQueueing(false);
    }
  };

  const activePickerContainer = useMemo(() => {
    if (!slotPickerTargetBarcode) return null;
    return stagedContainers.find((c) => c.barcode === slotPickerTargetBarcode) || null;
  }, [slotPickerTargetBarcode, stagedContainers]);

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label={step === 1 ? 'New Transport Request' : selectedWorkflow.name}
        title={
          step === 1
            ? 'Select Workflow'
            : step === 2
            ? 'Select Containers & Target Slots'
            : 'Dispatch Confirmed'
        }
        onBack={() => {
          if (step === 2 && !params?.workflow) {
            setStep(1);
          } else {
            goBack();
          }
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {contextError && <Text variant="body" color={colors.danger}>{contextError}</Text>}
        {!contextReady && !contextError && <Text variant="body">Loading Dispatch Context…</Text>}
        {step === 2 && <View style={styles.routeContextCard}>
          {inputSchema?.workflowInputs.map(field => <Input key={field.key}
            label={`${field.label || field.key}${field.required ? ' *' : ''}`}
            value={staffInputs[field.key] || ''} placeholder={field.dataType === 'BOOLEAN' ? 'true / false' : field.dataType}
            hint={field.description || undefined}
            onChangeText={value => setStaffInputs(previous => ({ ...previous, [field.key]: value }))} />)}
          {selectedContainers.some(selected => {
            const container = allContainers.find(item => item.id === selected.id);
            return container && !container.currentEndpointId && !storageLocations.some(location => location.id === container.currentStorageLocationId);
          }) && <View><Text variant="label">Pickup Endpoint For Unlocated Containers</Text>
            {endpoints.map(endpoint => <Pressable key={endpoint.id} onPress={() => setSourceOverride(endpoint.id)}
              accessibilityRole="button" accessibilityLabel={`Pickup at ${endpoint.code}`}>
              <Text variant="body" color={sourceOverride === endpoint.id ? colors.primary : colors.textSecondary}>
                {sourceOverride === endpoint.id ? '● ' : '○ '}{endpoint.code} · {endpoint.name}
              </Text>
            </Pressable>)}
          </View>}
        </View>}
        {/* Step 1: Workflow Template Selection Grid */}
        {step === 1 && (
          <View style={{ gap: 14 }}>
            <View style={styles.workflowIntro}>
              <Text variant="headline" style={styles.workflowIntroTitle}>
                Available Mission Templates
              </Text>
            </View>

            <View style={styles.workflowGrid}>
              {availableWorkflows.map((wf) => (
                <View key={wf.id} style={styles.workflowGridItem}>
                  <WorkflowTemplateCard workflow={wf} onSelect={handleSelectWorkflow} />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Step 2: Origin Container Selection + Two-Tier Hybrid Slotting */}
        {step === 2 && (
          <View style={{ gap: 16 }}>
            {/* Route & Tier-1 Batch Destination Configurator Card */}
            <View style={styles.routeContextCard}>
              <View style={styles.routeRow}>
                {/* Origin Point */}
                <View style={styles.routePoint}>
                  <View style={[styles.routeDot, { backgroundColor: '#121317' }]} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.routeLabelRow}>
                      <Text
                        variant="caption"
                        color={colors.textSecondary}
                        style={{ fontWeight: '600' }}
                      >
                        {currentPreset.originLabel}
                      </Text>
                      {selectedWorkflow.id === 'inbound' && (
                        <View style={styles.stationBadge}>
                          <Text
                            variant="caption"
                            color={colors.textPrimary}
                            style={styles.stationBadgeText}
                          >
                            Your Station
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text
                      variant="bodyMedium"
                      color={colors.textPrimary}
                      style={styles.stationName}
                    >
                      {currentPreset.originDetail}
                    </Text>
                  </View>
                </View>

                <View style={styles.routeDivider} />

                {/* Tier 1: Interactive Destination Zone / Endpoint Selector */}
                <View style={styles.routePoint}>
                  <View style={[styles.routeDot, { backgroundColor: colors.success }]} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <View style={styles.routeLabelRow}>
                      <Text
                        variant="caption"
                        color={colors.textSecondary}
                        style={{ fontWeight: '600' }}
                      >
                        {destinationType === 'SLOT' ? currentPreset.destinationLabel : 'Target Endpoint / Dropoff Bay'}
                      </Text>
                      {destinationType === 'SLOT' ? (
                        <View style={styles.autoSlotBadge}>
                          <Sparkles size={11} color="#059669" />
                          <Text variant="caption" style={styles.autoSlotBadgeText}>
                            {availableSlotsInTargetZone.length} Empty Slots
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.autoSlotBadge}>
                          <MapPin size={11} color="#059669" />
                          <Text variant="caption" style={styles.autoSlotBadgeText}>
                            {availableEndpointOptions.length} Endpoints Available
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Clean Target Mode Switcher: Endpoints vs Storage Slots */}
                    <View style={styles.modeTabsRow}>
                      <Pressable
                        onPress={() => {
                          triggerHaptic('tap');
                          setDestinationType('ENDPOINT');
                        }}
                        style={[
                          styles.modeTabBtn,
                          destinationType === 'ENDPOINT' && styles.modeTabBtnActive,
                        ]}
                      >
                        <Text
                          variant="caption"
                          style={[
                            styles.modeTabText,
                            destinationType === 'ENDPOINT' && styles.modeTabTextActive,
                          ]}
                        >
                          Target Endpoints ({availableEndpointOptions.length})
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          triggerHaptic('tap');
                          setDestinationType('SLOT');
                        }}
                        style={[
                          styles.modeTabBtn,
                          destinationType === 'SLOT' && styles.modeTabBtnActive,
                        ]}
                      >
                        <Text
                          variant="caption"
                          style={[
                            styles.modeTabText,
                            destinationType === 'SLOT' && styles.modeTabTextActive,
                          ]}
                        >
                          Rack Slots ({availableSlotsInTargetZone.length})
                        </Text>
                      </Pressable>
                    </View>

                    {destinationType === 'SLOT' ? (
                      <View style={styles.zoneSelectorRow}>
                        {TARGET_ZONE_OPTIONS.map((zOpt) => {
                          const isSelected = targetZone === zOpt.code;
                          return (
                            <Pressable
                              key={zOpt.code}
                              onPress={() => handleChangeTargetZone(zOpt.code)}
                              style={[
                                styles.zoneChip,
                                isSelected && styles.zoneChipActive,
                              ]}
                              accessibilityRole="button"
                              accessibilityState={{ selected: isSelected }}
                            >
                              <Text
                                variant="caption"
                                style={[
                                  styles.zoneChipText,
                                  isSelected && styles.zoneChipTextActive,
                                ]}
                              >
                                {zOpt.shortLabel}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={styles.zoneSelectorRow}>
                        {availableEndpointOptions.map((epOpt) => {
                          const isSelected =
                            selectedEndpointOption.endpointCode === epOpt.endpointCode;
                          return (
                            <Pressable
                              key={epOpt.endpointCode}
                              onPress={() => {
                                triggerHaptic('tap');
                                setSelectedEndpointOption(epOpt);
                              }}
                              style={[
                                styles.zoneChip,
                                isSelected && styles.zoneChipActive,
                              ]}
                              accessibilityRole="button"
                              accessibilityState={{ selected: isSelected }}
                            >
                              <Text
                                variant="caption"
                                style={[
                                  styles.zoneChipText,
                                  isSelected && styles.zoneChipTextActive,
                                ]}
                              >
                                {epOpt.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* Staged Containers Selector Card */}
            <View style={styles.manifestCard}>
              <View style={styles.manifestHeader}>
                <View style={styles.manifestHeaderTitle}>
                  <Package size={18} color="#121317" />
                  <Text variant="bodyMedium" style={styles.manifestTitle}>
                    {currentPreset.poolTitle}
                  </Text>
                  <View style={styles.countBadge}>
                    <Text
                      variant="caption"
                      color={colors.textSecondary}
                      style={{ fontWeight: '600' }}
                    >
                      {stagedContainers.length} Available
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={handleToggleSelectAll}
                  style={({ pressed }) => [styles.selectAllBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Text variant="caption" color={colors.textPrimary} style={{ fontWeight: '600' }}>
                    {selectedBarcodes.length === stagedContainers.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </Text>
                </Pressable>
              </View>

              {/* Quick Search / Filter Bar */}
              <View style={styles.searchBarRow}>
                <Search size={16} color={colors.textSecondary} />
                <Input
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Filter by barcode or product SKU..."
                  inputStyle={{ fontSize: 13, backgroundColor: 'transparent', borderWidth: 0 }}
                  containerStyle={{ flex: 1, marginBottom: 0 }}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                    <X size={16} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>

              {/* Container Selection List */}
              <View style={styles.containersList}>
                {filteredStagedContainers.map((container) => {
                  const isSelected = selectedBarcodes.includes(container.barcode);
                  const assignedSlot = resolvedBatchAssignments[container.barcode];

                  return (
                    <View
                      key={container.id}
                      style={[
                        styles.containerSelectCard,
                        isSelected && styles.containerSelectCardActive,
                      ]}
                    >
                      <Pressable
                        onPress={() => handleToggleContainer(container.barcode)}
                        style={styles.containerMainTapArea}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected }}
                      >
                        {/* Checkbox */}
                        <View
                          style={[
                            styles.checkbox,
                            isSelected && styles.checkboxChecked,
                          ]}
                        >
                          {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                        </View>

                        {/* Info Body */}
                        <View style={styles.containerInfoBody}>
                          <View style={styles.containerTopLine}>
                            <Text variant="bodyMedium" style={styles.containerBarcode}>
                              {container.barcode}
                            </Text>
                            <View style={styles.originBadge}>
                              <MapPin size={11} color={colors.textSecondary} />
                              <Text
                                variant="caption"
                                color={colors.textSecondary}
                                style={{ fontWeight: '600', fontSize: 11 }}
                              >
                                At: {container.originDisplayLabel}
                              </Text>
                            </View>
                          </View>

                          <Text
                            variant="caption"
                            color={colors.textSecondary}
                            numberOfLines={1}
                          >
                            {container.productName.includes(container.sku)
                              ? container.productName
                              : `${container.productName} (${container.sku})`}{' '}
                            ·{' '}
                            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                              {container.qty} containers
                            </Text>
                          </Text>
                        </View>
                      </Pressable>

                      {/* Tier 2: Target Slot / Endpoint Bar (Only shown when container is selected!) */}
                      {isSelected && (
                        <View style={styles.targetAssignmentBar}>
                          {destinationType === 'SLOT' && assignedSlot ? (
                            <>
                              <View style={styles.targetSlotLeft}>
                                <Layers size={13} color="#059669" />
                                <Text
                                  variant="caption"
                                  style={styles.targetSlotLabel}
                                  numberOfLines={1}
                                >
                                  <Text style={styles.targetSlotValue}>
                                    {assignedSlot.storageLocationCode} · L{assignedSlot.levelNo}
                                  </Text>
                                </Text>
                                <View
                                  style={[
                                    styles.slotModeTag,
                                    assignedSlot.isCustom && styles.slotModeTagCustom,
                                  ]}
                                >
                                  <Text
                                    variant="caption"
                                    style={[
                                      styles.slotModeTagText,
                                      assignedSlot.isCustom && styles.slotModeTagTextCustom,
                                    ]}
                                  >
                                    {assignedSlot.isCustom ? 'Custom' : 'Auto'}
                                  </Text>
                                </View>
                              </View>

                              <Pressable
                                onPress={() => {
                                  triggerHaptic('tap');
                                  setSlotPickerTargetBarcode(container.barcode);
                                }}
                                style={({ pressed }) => [
                                  styles.changeSlotBtn,
                                  pressed && styles.pressed,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={`Change target rack slot for ${container.barcode}`}
                              >
                                <Text variant="caption" style={styles.changeSlotBtnText}>
                                  Change Slot
                                </Text>
                                <ChevronDown size={13} color="#121317" />
                              </Pressable>
                            </>
                          ) : (
                            <View style={{ flex: 1, gap: 6 }}>
                              <View style={styles.targetSlotLeft}>
                                <ArrowRight size={13} color="#059669" />
                                <Text variant="caption" style={styles.targetSlotLabel}>
                                  Destination:{' '}
                                  <Text style={styles.targetSlotValue}>
                                    {(perContainerEndpointOverrides[container.barcode] || selectedEndpointOption).label}
                                  </Text>
                                </Text>
                              </View>
                              {availableEndpointOptions.length > 1 && (
                                <View style={styles.endpointQuickPickRow}>
                                  {availableEndpointOptions.slice(0, 4).map((ep) => {
                                    const isCur =
                                      (perContainerEndpointOverrides[container.barcode] || selectedEndpointOption)
                                        .endpointCode === ep.endpointCode;
                                    return (
                                      <Pressable
                                        key={ep.endpointCode}
                                        onPress={() => {
                                          triggerHaptic('tap');
                                          setPerContainerEndpointOverrides((prev) => ({
                                            ...prev,
                                            [container.barcode]: ep,
                                          }));
                                        }}
                                        style={[styles.smallEpChip, isCur && styles.smallEpChipActive]}
                                      >
                                        <Text
                                          variant="caption"
                                          style={[styles.smallEpChipText, isCur && styles.smallEpChipTextActive]}
                                        >
                                          {ep.endpointCode}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}

                {filteredStagedContainers.length === 0 && (
                  <View style={styles.emptySearch}>
                    <Text variant="caption" color={colors.textSecondary}>
                      No containers matching "{searchQuery}"
                    </Text>
                  </View>
                )}
              </View>

              {/* Add unlisted barcode expandable row */}
              {!isAddingCustom ? (
                <Pressable
                  onPress={() => setIsAddingCustom(true)}
                  style={({ pressed }) => [styles.addUnlistedBtn, pressed && styles.pressed]}
                >
                  <Barcode size={15} color={colors.textPrimary} />
                  <Text variant="caption" color={colors.textPrimary} style={{ fontWeight: '600' }}>
                    + Scan or Add Unlisted Barcode
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.addCustomBox}>
                  <Input
                    label="Container Barcode (Tote ID)"
                    value={customBarcode}
                    onChangeText={setCustomBarcode}
                    placeholder="e.g. BOX-109"
                    autoFocus
                  />
                  <View style={styles.addCustomActions}>
                    <Button
                      label="Add to Manifest"
                      variant="primary"
                      size="sm"
                      onPress={handleAddCustomBarcode}
                    />
                    <Button
                      label="Cancel"
                      variant="outline"
                      size="sm"
                      onPress={() => {
                        setCustomBarcode('');
                        setIsAddingCustom(false);
                      }}
                    />
                  </View>
                </View>
              )}
            </View>

            {/* Mission Capacity & Dispatch Summary Card */}
            <View style={styles.dispatchSummaryCard}>
              <View style={styles.summaryTop}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={styles.summaryTitle}>
                    {selectedContainers.length === 0
                      ? 'No Containers Selected'
                      : `${selectedContainers.length} ${
                          selectedContainers.length === 1 ? 'Tote' : 'Totes'
                        } Selected for Dispatch`}
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    {selectedContainers.length === 0
                      ? 'Tap checkboxes above to select containers and auto-assign slots.'
                      : `Fleet Split: ${estimatedMissions} AMR ${
                          estimatedMissions === 1 ? 'Mission' : 'Missions'
                        } (Estimate · Confirmed After Queue)`}
                  </Text>
                </View>
                {selectedContainers.length > 2 && (
                  <View style={styles.multiMissionBadge}>
                    <Text
                      variant="caption"
                      color={colors.textPrimary}
                      style={{ fontWeight: '700', fontSize: 11 }}
                    >
                      Multiple Missions
                    </Text>
                  </View>
                )}
              </View>

              <View style={{ gap: 8, marginTop: 8 }}>
                <Button
                  label={
                    selectedContainers.length === 0
                      ? 'Select Containers to Submit'
                      : `Submit Transport Request (${selectedContainers.length} ${
                          selectedContainers.length === 1 ? 'Tote' : 'Totes'
                        })`
                  }
                  disabled={selectedContainers.length === 0 || isSubmitting || !contextReady || !inputSchema || !selectedWorkflow.backendId}
                  loading={isSubmitting}
                  rightIcon={<ArrowRight size={18} color="#ffffff" />}
                  variant="primary"
                  size="lg"
                  onPress={() => handleConfirmDispatch(false)}
                  style={{ width: '100%' }}
                />
                <Button
                  label="Submit & Auto-Queue (One-Tap Dispatch)"
                  disabled={selectedContainers.length === 0 || isSubmitting || !contextReady || !inputSchema || !selectedWorkflow.backendId}
                  rightIcon={<Rocket size={16} color={colors.textPrimary} />}
                  variant="outline"
                  size="md"
                  onPress={() => handleConfirmDispatch(true)}
                  style={{ width: '100%' }}
                />
              </View>
            </View>
          </View>
        )}

        {/* Step 3: Success / Receipt Screen with Two-Stage Lifecycle */}
        {step === 3 && (
          <View style={styles.successCard}>
            <View
              style={[
                styles.successIconBadge,
                dispatchedOrder?.status === 'SUBMITTED' && { backgroundColor: '#D97706' },
              ]}
            >
              <Check size={28} color="#ffffff" strokeWidth={2.8} />
            </View>

            <Text variant="title" style={styles.successTitle}>
              {dispatchedOrder?.status === 'SUBMITTED'
                ? 'Transport Request Submitted'
                : 'Transport Mission Queued'}
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.successSub}>
              {dispatchedOrder?.status === 'SUBMITTED'
                ? `${dispatchedOrder?.containerCount || 0} container(s) registered with request ${
                    dispatchedOrder?.requestCode
                  }. Ready to queue for autonomous AMR fleet execution.`
                : `${dispatchedOrder?.containerCount || 0} container(s) queued and split into ${
                    dispatchedOrder?.jobs?.length || dispatchedOrder?.estimatedMissions || 1
                  } autonomous AMR job(s).`}
            </Text>

            {/* If SUBMITTED: Prominent CTA to Queue */}
            {dispatchedOrder?.status === 'SUBMITTED' && (
              <View style={styles.queueCtaSection}>
                <Button
                  label="Queue Request for Execution"
                  icon={<Rocket size={18} color="#ffffff" />}
                  onPress={handleQueueSubmittedRequest}
                  loading={isQueueing}
                  variant="primary"
                  size="lg"
                  style={{ width: '100%' }}
                />
              </View>
            )}

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>
                  Request Code:
                </Text>
                <Text variant="caption" color={colors.textPrimary} style={styles.receiptVal}>
                  {dispatchedOrder?.requestCode || '—'}
                </Text>
              </View>

              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>
                  Lifecycle Status:
                </Text>
                <View
                  style={[
                    styles.statusBadgePill,
                    dispatchedOrder?.status === 'SUBMITTED'
                      ? styles.statusBadgeSubmitted
                      : styles.statusBadgeQueued,
                  ]}
                >
                  <Text
                    variant="caption"
                    style={[
                      styles.statusBadgeText,
                      dispatchedOrder?.status === 'SUBMITTED'
                        ? styles.statusBadgeTextSubmitted
                        : styles.statusBadgeTextQueued,
                    ]}
                  >
                    {dispatchedOrder?.status || 'SUBMITTED'}
                  </Text>
                </View>
              </View>

              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>
                  Workflow:
                </Text>
                <Text variant="caption" color={colors.textPrimary} style={styles.receiptHighlight}>
                  {selectedWorkflow.name} ({selectedWorkflow.code})
                </Text>
              </View>

              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>
                  Assigned Carrier:
                </Text>
                <Text variant="caption" color={colors.success} style={styles.receiptSuccess}>
                  {dispatchedOrder?.carrier || 'Awaiting Robot Assignment'}
                </Text>
              </View>

              <View style={[styles.receiptBorderTop, { gap: 6 }]}>
                <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600' }}>
                  Slotted Movements ({dispatchedOrder?.containerAssignments.length || 0}):
                </Text>
                {(dispatchedOrder?.containerAssignments || []).map((item) => (
                  <View key={item.barcode} style={styles.receiptRow}>
                    <Text
                      variant="caption"
                      color={colors.textPrimary}
                      style={{ fontFamily: typography.fontMono, fontWeight: '700' }}
                    >
                      {item.barcode}
                    </Text>
                    <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600' }}>
                      ➔ {item.targetLabel}
                    </Text>
                  </View>
                ))}
              </View>

              {dispatchedOrder?.status === 'QUEUED' && dispatchedOrder.jobs.length > 0 && (
                <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                  <Text variant="caption" color={colors.textSecondary}>
                    Provisioned Jobs:
                  </Text>
                  <Text variant="caption" color={colors.textPrimary} style={styles.receiptVal}>
                    {dispatchedOrder?.jobs?.map((j) => j.jobNo).join(', ') || '1 AMR Mission'}
                  </Text>
                </View>
              )}
            </View>

            {/* JobBatchPlan Execution Graph Details Card (When QUEUED) */}
            {dispatchedOrder?.status === 'QUEUED' && dispatchedOrder?.jobs && dispatchedOrder.jobs.length > 0 && (
              <View style={styles.planCard}>
                <View style={styles.planTitleRow}>
                  <Sparkles size={16} color="#059669" />
                  <Text variant="bodyMedium" style={{ fontWeight: '700', color: colors.textPrimary }}>
                    JobBatchPlan Execution Graph
                  </Text>
                </View>

                {dispatchedOrder.jobs.map((j) => (
                  <View key={j.jobId} style={styles.jobDetailBlock}>
                    <View style={styles.receiptRow}>
                      <Text variant="caption" color={colors.textSecondary}>Job No:</Text>
                      <Text variant="caption" style={styles.receiptVal}>{j.jobNo}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text variant="caption" color={colors.textSecondary}>Batch Key:</Text>
                      <Text variant="caption" style={styles.receiptVal}>{j.batchKey}</Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text variant="caption" color={colors.textSecondary}>Plan Metrics:</Text>
                      <Text variant="caption" style={styles.receiptVal}>
                        {j.jobContainerCount} container(s) · {j.jobTaskCount} task(s) · {j.jobStepCount} step(s)
                      </Text>
                    </View>
                  </View>
                ))}

                <View style={styles.movementChainSection}>
                  <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600', marginBottom: 6 }}>
                    Movement Plan Chain:
                  </Text>
                  <View style={styles.movementChainRow}>
                    {['MOVE_PICKUP', 'PICKUP_CONFIRM', 'MOVE_DROPOFF', 'DROPOFF_CONFIRM'].map((stepName, sIdx) => (
                      <React.Fragment key={stepName}>
                        {sIdx > 0 && <ArrowRight size={10} color="#9CA3AF" />}
                        <View style={styles.chainPill}>
                          <Text variant="caption" style={styles.chainPillText}>{stepName}</Text>
                        </View>
                      </React.Fragment>
                    ))}
                  </View>
                </View>
              </View>
            )}

            <View style={styles.successActions}>
              {dispatchedOrder?.status === 'QUEUED' && dispatchedOrder.jobs.length > 0 && (
                <>
                  <View style={styles.robotSelectorRow}>
                    {availableRobots.map((robot) => (
                      <Pressable
                        key={robot.id}
                        onPress={() => setSelectedRobotId(robot.id)}
                        disabled={isStartingJob}
                        accessibilityRole="button"
                        accessibilityState={{ selected: selectedRobotId === robot.id }}
                        style={[styles.robotSelectorChip, selectedRobotId === robot.id && styles.robotSelectorChipSelected]}
                      >
                        <Text variant="label" color={selectedRobotId === robot.id ? colors.primaryText : colors.textSecondary}>
                          {robot.code}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Button
                    label="Start Job & Open Mission Detail"
                    variant="primary"
                    size="lg"
                    loading={isStartingJob}
                    style={{ width: '100%' }}
                    onPress={async () => {
                      if (isStartingJob) return;
                      setIsStartingJob(true);
                      try {
                        const jobId = dispatchedOrder.jobs[0].jobId;
                        const updated = await startJob(jobId, selectedRobotId);
                        if (!updated) throw new Error('Job could not be started');
                        navigate('job_detail', { jobId });
                      } catch (err: any) {
                        toast.error(err?.message || 'Failed to start job');
                      } finally {
                        setIsStartingJob(false);
                      }
                    }}
                  />
                </>
              )}
              {dispatchedOrder?.status === 'QUEUED' && (
                <Button
                  label="View Provisioned Job"
                  icon={<MapPin size={16} color={colors.primary} />}
                  onPress={() =>
                    navigate('job_detail', {
                      jobId: dispatchedOrder.jobs[0].jobId,
                    })
                  }
                  variant="outline"
                  size="lg"
                  style={{ width: '100%' }}
                />
              )}
              <Button
                label="View in Transport History"
                onPress={() => navigate('transport_history')}
                variant={dispatchedOrder?.status === 'QUEUED' ? 'outline' : 'primary'}
                size="md"
                style={{ width: '100%' }}
              />
              <Button
                label="Create Another Request"
                onPress={() => {
                  setCustomSlotOverrides({});
                  setPerContainerEndpointOverrides({});
                  setStep(1);
                }}
                variant="secondary"
                size="md"
                style={{ width: '100%' }}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Tier 2 Granular Rack & Shelf Level Matrix Modal */}
      <TargetSlotPickerModal
        visible={Boolean(slotPickerTargetBarcode)}
        containerBarcode={slotPickerTargetBarcode || ''}
        containerProduct={activePickerContainer?.productName || ''}
        activeZone={targetZone}
        storageLocations={storageLocations}
        currentAssignment={
          slotPickerTargetBarcode ? resolvedBatchAssignments[slotPickerTargetBarcode] : null
        }
        batchAssignments={resolvedBatchAssignments}
        onSelectSlot={(slot) => {
          if (slotPickerTargetBarcode) {
            handleOverrideContainerSlot(slotPickerTargetBarcode, slot);
          }
        }}
        onClose={() => setSlotPickerTargetBarcode(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  robotSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  robotSelectorChip: {
    minHeight: 44, paddingHorizontal: 16, borderRadius: radii.pill,
    justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  robotSelectorChipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  workflowIntro: {
    marginBottom: 4,
  },
  workflowIntroTitle: {
    fontWeight: '700',
    marginBottom: 2,
  },
  workflowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  workflowGridItem: {
    width: '48%',
  },
  routeContextCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },
  routeRow: {
    gap: 12,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  routeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stationBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stationBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4B5563',
  },
  autoSlotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  autoSlotBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  stationName: {
    fontWeight: '700',
    marginTop: 2,
  },
  zoneSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  zoneChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  zoneChipActive: {
    backgroundColor: '#121317',
    borderColor: '#121317',
  },
  zoneChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  zoneChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  routeDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 20,
  },
  manifestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    gap: 12,
  },
  manifestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manifestHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  manifestTitle: {
    fontWeight: '700',
  },
  countBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    backgroundColor: '#F3F4F6',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  containersList: {
    gap: 8,
  },
  containerSelectCard: {
    borderRadius: radii.md,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  containerSelectCardActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#121317',
    borderWidth: 1.5,
  },
  containerMainTapArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#121317',
    borderColor: '#121317',
  },
  containerInfoBody: {
    flex: 1,
    gap: 3,
  },
  containerTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  containerBarcode: {
    fontWeight: '700',
    color: '#121317',
    letterSpacing: 0.5,
    fontFamily: typography.fontMono,
  },
  originBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  targetAssignmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderTopWidth: 1,
    borderTopColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  targetSlotLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  targetSlotLabel: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '500',
  },
  targetSlotValue: {
    fontWeight: '800',
    color: '#064E3B',
    fontFamily: typography.fontMono,
  },
  slotModeTag: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  slotModeTagCustom: {
    backgroundColor: '#121317',
  },
  slotModeTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#065F46',
  },
  slotModeTagTextCustom: {
    color: '#FFFFFF',
  },
  changeSlotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  changeSlotBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#121317',
  },
  emptySearch: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  addUnlistedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    backgroundColor: '#FAFAFA',
  },
  addCustomBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 8,
  },
  addCustomActions: {
    flexDirection: 'row',
    gap: 8,
  },
  dispatchSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 8,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryTitle: {
    fontWeight: '700',
    color: '#121317',
  },
  multiMissionBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  successCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  successIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: {
    fontWeight: '800',
    textAlign: 'center',
  },
  successSub: {
    textAlign: 'center',
    lineHeight: 18,
  },
  receiptBox: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    gap: 10,
    marginTop: 8,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  receiptVal: {
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  receiptHighlight: {
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  receiptSuccess: {
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  receiptBorderTop: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
    marginTop: 2,
  },
  successActions: {
    width: '100%',
    gap: 10,
    marginTop: 12,
  },
  modeTabsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
    marginBottom: 4,
  },
  modeTabBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modeTabBtnActive: {
    backgroundColor: '#121317',
    borderColor: '#121317',
  },
  modeTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  modeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  endpointQuickPickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  smallEpChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  smallEpChipActive: {
    backgroundColor: '#121317',
    borderColor: '#121317',
  },
  smallEpChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
  },
  smallEpChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  queueCtaSection: {
    width: '100%',
    marginVertical: 4,
  },
  statusBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  statusBadgeSubmitted: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  statusBadgeQueued: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusBadgeTextSubmitted: {
    color: '#B45309',
  },
  statusBadgeTextQueued: {
    color: '#059669',
  },
  planCard: {
    width: '100%',
    backgroundColor: '#F0FDF4',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 12,
    gap: 8,
    marginTop: 8,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  jobDetailBlock: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  movementChainSection: {
    marginTop: 4,
    gap: 4,
  },
  movementChainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  chainPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  chainPillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#166534',
    fontFamily: typography.fontMono,
  },
  pressed: {
    opacity: 0.7,
  },
});
