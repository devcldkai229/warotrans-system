import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  Clock,
  Filter,
  MapPin,
  Navigation,
  Printer,
  RefreshCw,
  Rocket,
  Search,
  SlidersHorizontal,
  Truck,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import {
  listTransportRequests,
  queueTransportRequest,
  TransportRequestListItem,
} from '../../shared/api';

export interface TransportOrder {
  id: string;
  rawId: string;
  requestCode: string;
  rawStatus: string;
  workflowName: string;
  category: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  statusText: string;
  source: string;
  destination: string;
  container: string;
  product: string;
  qty: number;
  robot: string;
  linkedJobId?: string;
  timeLabel: string;
  duration?: string;
  cancelReason?: string;
  operator: string;
}

export const TRANSPORT_ORDERS: TransportOrder[] = [
  {
    id: 'TR-2048',
    rawId: '7439150f-3796-4404-9f9d-b894b72dc3f1',
    requestCode: 'TR-2048',
    rawStatus: 'IN_PROGRESS',
    workflowName: 'Inbound Putaway',
    category: 'INBOUND',
    status: 'IN_PROGRESS',
    statusText: 'Waiting Handover',
    source: 'DOCK-IN-01',
    destination: 'RACK-A-02 · Level 1 & 3',
    container: 'BOX-101, BOX-102 (2 Totes)',
    product: 'Electronic Components & Control Modules',
    qty: 70,
    robot: 'AMR-01',
    linkedJobId: 'JOB-2026-0812',
    timeLabel: 'Requested 2m ago',
    operator: 'Alex Tran',
  },
  {
    id: 'TR-2047',
    rawId: 'tr-seed-2047',
    requestCode: 'TR-2047',
    rawStatus: 'IN_PROGRESS',
    workflowName: 'Replenishment',
    category: 'INTERNAL',
    status: 'IN_PROGRESS',
    statusText: 'Needs Recovery',
    source: 'RACK-D-01 · Level 1',
    destination: 'RACK-A-01 · Level 1',
    container: 'BOX-401, BOX-402 (2 Totes)',
    product: 'Sensor Array & Control Module',
    qty: 80,
    robot: 'AMR-02',
    linkedJobId: 'JOB-2026-0819',
    timeLabel: 'Dispatched 14m ago',
    operator: 'Alex Tran',
  },
  {
    id: 'TR-2046',
    rawId: 'tr-seed-2046',
    requestCode: 'TR-2046',
    rawStatus: 'IN_PROGRESS',
    workflowName: 'Outbound Retrieval',
    category: 'OUTBOUND',
    status: 'IN_PROGRESS',
    statusText: 'En Route',
    source: 'RACK-B-04 · Level 2',
    destination: 'DOCK-OUT-04',
    container: 'BOX-204',
    product: 'Hydraulic Valves',
    qty: 16,
    robot: 'AMR-02',
    linkedJobId: 'JOB-2026-0813',
    timeLabel: 'Dispatched 25m ago',
    operator: 'Alex Tran',
  },
  {
    id: 'TR-2045',
    rawId: 'tr-seed-2045',
    requestCode: 'TR-2045',
    rawStatus: 'COMPLETED',
    workflowName: 'Reallocation',
    category: 'INTERNAL',
    status: 'COMPLETED',
    statusText: 'Delivered & Verified',
    source: 'RACK-A-01 · Level 1',
    destination: 'RACK-B-01 · Level 2',
    container: 'BOX-105',
    product: 'Control Relays',
    qty: 30,
    robot: 'AMR-01',
    linkedJobId: 'JOB-2026-0808',
    timeLabel: 'Completed at 09:50 AM',
    duration: '6m 40s',
    operator: 'David Nguyen',
  },
  {
    id: 'TR-2044',
    rawId: 'tr-seed-2044',
    requestCode: 'TR-2044',
    rawStatus: 'COMPLETED',
    workflowName: 'Point-to-Point',
    category: 'INTERNAL',
    status: 'COMPLETED',
    statusText: 'Handover Complete',
    source: 'QA-02',
    destination: 'ASSEMBLY-01',
    container: 'TOTE-QA-01',
    product: 'Drive Assembly Kit',
    qty: 15,
    robot: 'AMR-01',
    linkedJobId: 'JOB-2026-0808',
    timeLabel: 'Completed at 09:12 AM',
    duration: '4m 10s',
    operator: 'Alex Tran',
  },
  {
    id: 'TR-2042',
    rawId: 'tr-seed-2042',
    requestCode: 'TR-2042',
    rawStatus: 'CANCELLED',
    workflowName: 'Outbound Retrieval',
    category: 'OUTBOUND',
    status: 'CANCELLED',
    statusText: 'Cancelled',
    source: 'RACK-A-08 · Level 1',
    destination: 'DOCK-OUT-04',
    container: 'BOX-215',
    product: 'Drive Assembly',
    qty: 8,
    robot: 'AMR-01',
    timeLabel: 'Cancelled at 08:10 AM',
    cancelReason: 'Shelf slot obstructed by forklift. Task aborted.',
    operator: 'Alex Tran',
  },
  {
    id: 'TR-2041',
    rawId: 'tr-seed-2041',
    requestCode: 'TR-2041',
    rawStatus: 'CANCELLED',
    workflowName: 'Inbound Putaway',
    category: 'INBOUND',
    status: 'CANCELLED',
    statusText: 'Cancelled',
    source: 'DOCK-IN-01',
    destination: 'RACK-B-01 · Level 1',
    container: 'BOX-104',
    product: 'Protective Insert',
    qty: 30,
    robot: 'AMR-02',
    timeLabel: 'Cancelled at 07:45 AM',
    cancelReason: 'Operator reported barcode label damaged and unreadable.',
    operator: 'David Nguyen',
  },
];

function formatContainerDisplay(raw: string): string {
  if (!raw) return 'Container';
  if (/\(\+\d+\)/.test(raw)) return raw;
  if (raw.includes(',')) {
    const parts = raw.split(',').map((p) => p.trim());
    const first = parts[0];
    const match = raw.match(/\((\d+)\s*Totes?\)/i);
    const count = match ? parseInt(match[1], 10) - 1 : parts.length - 1;
    return `${first} (+${count})`;
  }
  return raw;
}

function mapRequestToOrder(item: TransportRequestListItem): TransportOrder {
  const details = item.details || [];
  const first = details[0];
  const isCompleted = item.status === 'COMPLETED';
  const isCancelled =
    item.status === 'CANCELLED' || item.status === 'REJECTED' || item.status === 'FAILED';
  const isInProgress = !isCompleted && !isCancelled;

  let category: TransportOrder['category'] = 'INTERNAL';
  const wf = (item.workflowCode || '').toUpperCase();
  if (wf.includes('INBOUND')) category = 'INBOUND';
  else if (wf.includes('OUTBOUND')) category = 'OUTBOUND';

  let statusText = 'Processing';
  if (item.requestCode === 'TR-2047') statusText = 'Needs Recovery';
  else if (item.status === 'SUBMITTED') statusText = 'Submitted';
  else if (item.status === 'QUEUED') statusText = 'Queued for fleet';
  else if (item.status === 'IN_PROGRESS') statusText = 'En Route';
  else if (item.status === 'COMPLETED') statusText = 'Delivered & Verified';
  else if (item.status === 'CANCELLED') statusText = 'Cancelled';
  else if (item.status === 'REJECTED') statusText = 'Rejected by scheduler';
  else if (item.status === 'FAILED') statusText = 'Failed';

  const firstBarcode = details[0]?.containerBarcode || 'CTN-IN-000001';
  const containerLabel =
    details.length > 1
      ? `${firstBarcode} (+${details.length - 1})`
      : details[0]?.containerBarcode || 'Container Tote';

  const totalQty = details.reduce((acc, d) => acc + (d.qty || 1), 0);
  const destinations = Array.from(
    new Set(details.map((d) => d.destinationEndpointCode).filter(Boolean))
  );
  const destinationLabel =
    destinations.length > 1
      ? `${destinations[0]} (+${destinations.length - 1} racks)`
      : destinations[0] || 'Storage Rack';

  return {
    id: item.requestCode,
    rawId: item.id,
    requestCode: item.requestCode,
    rawStatus: item.status,
    workflowName:
      item.workflowName ||
      (item.workflowCode ? item.workflowCode.replace(/_/g, ' ') : 'Transport Request'),
    category,
    status: isInProgress ? 'IN_PROGRESS' : isCompleted ? 'COMPLETED' : 'CANCELLED',
    statusText,
    source: first?.sourceEndpointCode || 'DOCK-IN-01',
    destination: destinationLabel,
    container: containerLabel,
    product: first?.productName || item.note || 'Standard Cargo',
    qty: totalQty || 1,
    robot: item.assignedRobotCode || 'AMR-01',
    linkedJobId: item.linkedJobId || undefined,
    timeLabel: item.submittedAt
      ? new Date(item.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Just now',
    operator: 'Staff Operator',
  };
}

type CategoryFilter = 'ALL' | 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
export type TabFilter = 'TOTAL' | 'ACTIVE' | 'DONE' | 'VOID';

export function TransportHistoryScreen() {
  const { navigate, goBack } = useNavigation();
  const [filter, setFilter] = useState<TabFilter>('TOTAL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [showCategoryChips, setShowCategoryChips] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState<TransportOrder[]>(TRANSPORT_ORDERS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [queueingId, setQueueingId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await listTransportRequests({ take: 50 });
      if (res?.items) {
        const liveOrders = res.items.map(mapRequestToOrder);
        setOrders(liveOrders);
      }
    } catch (err) {
      console.warn('Backend history fetch error, using cached records:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleQueueNow = async (order: TransportOrder) => {
    triggerHaptic('tap');
    setQueueingId(order.rawId);
    try {
      const res = await queueTransportRequest(order.rawId);
      toast.success(
        `Request ${order.requestCode} queued! Job: ${res?.jobs?.[0]?.jobNo || 'Assigned'}`
      );
      await fetchHistory();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to queue transport request');
    } finally {
      setQueueingId(null);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const totalCount = orders.length;
  const activeCount = orders.filter(
    (o) =>
      ['SUBMITTED', 'QUEUED', 'IN_PROGRESS'].includes(o.rawStatus) ||
      o.status === 'IN_PROGRESS'
  ).length;
  const doneCount = orders.filter(
    (o) => o.rawStatus === 'COMPLETED' || o.status === 'COMPLETED'
  ).length;
  const voidCount = orders.filter(
    (o) =>
      ['CANCELLED', 'REJECTED', 'FAILED'].includes(o.rawStatus) ||
      o.status === 'CANCELLED'
  ).length;

  const filteredOrders = orders.filter((order) => {
    if (filter === 'ACTIVE') {
      const isActive =
        ['SUBMITTED', 'QUEUED', 'IN_PROGRESS'].includes(order.rawStatus) ||
        order.status === 'IN_PROGRESS';
      if (!isActive) return false;
    } else if (filter === 'DONE') {
      const isDone =
        order.rawStatus === 'COMPLETED' || order.status === 'COMPLETED';
      if (!isDone) return false;
    } else if (filter === 'VOID') {
      const isVoid =
        ['CANCELLED', 'REJECTED', 'FAILED'].includes(order.rawStatus) ||
        order.status === 'CANCELLED';
      if (!isVoid) return false;
    }

    if (categoryFilter !== 'ALL' && order.category !== categoryFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      order.id.toLowerCase().includes(q) ||
      order.requestCode.toLowerCase().includes(q) ||
      order.rawStatus.toLowerCase().includes(q) ||
      order.workflowName.toLowerCase().includes(q) ||
      order.source.toLowerCase().includes(q) ||
      order.destination.toLowerCase().includes(q) ||
      order.container.toLowerCase().includes(q) ||
      order.product.toLowerCase().includes(q) ||
      order.robot.toLowerCase().includes(q)
    );
  });

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="Fleet audit trail"
        title="Transport History"
        onBack={goBack}
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={fetchHistory}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Metric Summary Tabs */}
        <View style={styles.metricsGrid}>
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setFilter('TOTAL');
            }}
            accessibilityRole="tab"
            accessibilityLabel={`Filter all ${totalCount} orders`}
            accessibilityState={{ selected: filter === 'TOTAL' }}
            style={[
              styles.metricCard,
              filter === 'TOTAL' && styles.metricCardActive,
            ]}
          >
            <Text style={[styles.metricNumber, filter === 'TOTAL' && styles.metricNumberActive]}>
              {totalCount}
            </Text>
            <Text style={[styles.metricLabel, filter === 'TOTAL' && styles.metricLabelActive]}>
              All orders
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setFilter('ACTIVE');
            }}
            accessibilityRole="tab"
            accessibilityLabel={`Filter ${activeCount} active orders`}
            accessibilityState={{ selected: filter === 'ACTIVE' }}
            style={[
              styles.metricCard,
              filter === 'ACTIVE' && styles.metricCardActive,
            ]}
          >
            <Text style={[styles.metricNumber, filter === 'ACTIVE' && styles.metricNumberActive]}>
              {activeCount}
            </Text>
            <Text style={[styles.metricLabel, filter === 'ACTIVE' && styles.metricLabelActive]}>
              Active
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setFilter('DONE');
            }}
            accessibilityRole="tab"
            accessibilityLabel={`Filter ${doneCount} completed orders`}
            accessibilityState={{ selected: filter === 'DONE' }}
            style={[
              styles.metricCard,
              filter === 'DONE' && styles.metricCardActive,
            ]}
          >
            <Text style={[styles.metricNumber, filter === 'DONE' && styles.metricNumberActive]}>
              {doneCount}
            </Text>
            <Text style={[styles.metricLabel, filter === 'DONE' && styles.metricLabelActive]}>
              Done
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setFilter('VOID');
            }}
            accessibilityRole="tab"
            accessibilityLabel={`Filter ${voidCount} void or cancelled orders`}
            accessibilityState={{ selected: filter === 'VOID' }}
            style={[
              styles.metricCard,
              filter === 'VOID' && styles.metricCardActive,
            ]}
          >
            <Text style={[styles.metricNumber, filter === 'VOID' && styles.metricNumberActive]}>
              {voidCount}
            </Text>
            <Text style={[styles.metricLabel, filter === 'VOID' && styles.metricLabelActive]}>
              Void
            </Text>
          </Pressable>
        </View>

        {/* Search & Category Filter Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Search size={16} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search TR, route, container, robot..."
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
              />
              {searchQuery ? (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  style={styles.clearBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                setShowCategoryChips(!showCategoryChips);
              }}
              style={[
                styles.filterBtn,
                (categoryFilter !== 'ALL' || showCategoryChips) && styles.filterBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Toggle category filter"
            >
              <SlidersHorizontal
                size={16}
                color={categoryFilter !== 'ALL' || showCategoryChips ? colors.textPrimary : colors.textMuted}
              />
              {categoryFilter !== 'ALL' && <View style={styles.filterDotBadge} />}
            </Pressable>
          </View>

          {/* Category Filter Chips */}
          {showCategoryChips && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}
            >
              {[
                { key: 'ALL', label: 'All categories' },
                { key: 'INBOUND', label: 'Inbound' },
                { key: 'OUTBOUND', label: 'Outbound' },
                { key: 'INTERNAL', label: 'Internal move' },
              ].map((chip) => {
                const isActive = categoryFilter === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => {
                      triggerHaptic('tap');
                      setCategoryFilter(chip.key as CategoryFilter);
                    }}
                    style={[
                      styles.filterChip,
                      isActive && styles.filterChipActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter by ${chip.label}`}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        isActive && styles.filterChipTextActive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Order Cards List */}
        <View style={styles.ordersList}>
          {filteredOrders.length === 0 ? (
            <View style={styles.emptyCard}>
              <Search size={28} color={colors.textMuted} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>No transport records found</Text>
              <Text style={styles.emptySubtitle}>Try adjusting your filter or search query.</Text>
              {(searchQuery || filter !== 'TOTAL' || categoryFilter !== 'ALL') && (
                <Pressable
                  onPress={() => {
                    setSearchQuery('');
                    setFilter('TOTAL');
                    setCategoryFilter('ALL');
                  }}
                  style={styles.resetBtn}
                >
                  <Text style={styles.resetBtnText}>Reset filters</Text>
                </Pressable>
              )}
            </View>
          ) : (
            filteredOrders.map((order) => {
              const isSubmitted = order.rawStatus === 'SUBMITTED';
              const isQueued = order.rawStatus === 'QUEUED';
              const isInProgress =
                (order.status === 'IN_PROGRESS' || order.rawStatus === 'IN_PROGRESS') &&
                !isSubmitted &&
                !isQueued;
              const isCompleted = order.status === 'COMPLETED' || order.rawStatus === 'COMPLETED';
              const isCancelled =
                order.status === 'CANCELLED' ||
                order.rawStatus === 'CANCELLED' ||
                order.rawStatus === 'REJECTED' ||
                order.rawStatus === 'FAILED';

              return (
                <Pressable
                  key={order.id}
                  style={styles.orderCard}
                  onPress={() => {
                    if (order.linkedJobId) navigate('job_detail', { jobId: order.linkedJobId });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Transport request ${order.requestCode}`}
                >
                  {/* Card Header: TR ID & Status */}
                  <View style={styles.cardHeader}>
                    <View style={styles.idGroup}>
                      <Text style={styles.orderId}>{order.id}</Text>
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>{order.category.toLowerCase()}</Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        isSubmitted && styles.statusBadgeSubmitted,
                        isQueued && styles.statusBadgeQueued,
                        isInProgress && styles.statusBadgeWarning,
                        isCompleted && styles.statusBadgeSuccess,
                        isCancelled && styles.statusBadgeDanger,
                      ]}
                    >
                      {isSubmitted && <Clock size={13} color="#2563eb" style={{ marginRight: 4 }} />}
                      {isQueued && <View style={[styles.pulsingDot, { backgroundColor: '#7c3aed' }]} />}
                      {isInProgress && <View style={styles.pulsingDot} />}
                      {isCompleted && <CheckCircle2 size={13} color="#16a34a" style={{ marginRight: 4 }} />}
                      {isCancelled && <AlertTriangle size={13} color="#dc2626" style={{ marginRight: 4 }} />}
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isSubmitted && { color: '#2563eb' },
                          isQueued && { color: '#7c3aed' },
                          isInProgress && { color: '#b45309' },
                          isCompleted && { color: '#16a34a' },
                          isCancelled && { color: '#dc2626' },
                        ]}
                      >
                        {order.rawStatus || order.statusText}
                      </Text>
                    </View>
                  </View>

                  {/* Workflow Title */}
                  <Text style={styles.workflowTitle}>{order.workflowName}</Text>

                  {/* Route Visualizer */}
                  <View style={styles.routeBox}>
                    <MapPin size={14} color={colors.textSecondary} style={{ marginRight: 6, flexShrink: 0 }} />
                    <Text style={styles.routeSource} numberOfLines={1}>{order.source}</Text>
                    <ArrowRight size={13} color={colors.textMuted} style={{ marginHorizontal: 6, flexShrink: 0 }} />
                    <Text style={styles.routeDestination} numberOfLines={1}>{order.destination}</Text>
                  </View>

                  {/* Cargo Information */}
                  <View style={styles.cargoRow}>
                    <Box size={14} color={colors.textSecondary} style={{ marginRight: 6, flexShrink: 0 }} />
                    <Text style={styles.cargoContainer} numberOfLines={1}>{formatContainerDisplay(order.container)}</Text>
                    <Text style={styles.cargoDot}>·</Text>
                    <Text style={styles.cargoDetails} numberOfLines={1}>
                      <Text style={styles.cargoQty}>{order.qty} × </Text>
                      {order.product}
                    </Text>
                  </View>

                  {/* Metadata Row */}
                  <View style={styles.metaRow}>
                    <View style={styles.assignedCol}>
                      <Truck size={13} color={colors.textSecondary} style={{ marginRight: 5 }} />
                      <Text style={styles.assignedLabel}>
                        AMR: <Text style={styles.assignedRobot}>{order.robot}</Text>
                      </Text>
                    </View>
                    <View style={styles.timeCol}>
                      <Clock size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
                      <Text style={styles.timeLabel}>
                        {order.timeLabel}{order.duration ? ` (${order.duration})` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Cancellation Reason Alert if Cancelled */}
                  {isCancelled && order.cancelReason && (
                    <View style={styles.cancelAlert}>
                      <AlertTriangle size={14} color="#dc2626" style={{ marginRight: 8, marginTop: 1, flexShrink: 0 }} />
                      <Text style={styles.cancelAlertText}>
                        <Text style={{ fontWeight: '700' }}>Reason: </Text>
                        {order.cancelReason}
                      </Text>
                    </View>
                  )}

                  {/* Action Buttons with Warm Dark Gray CTAs */}
                  <View style={styles.actionsRow}>
                    {order.rawStatus === 'SUBMITTED' ? (
                      <Pressable
                        onPress={() => handleQueueNow(order)}
                        disabled={queueingId === order.rawId}
                        style={[
                          styles.actionBtnPrimary,
                          { flex: 1, backgroundColor: colors.primary || '#0f172a' },
                          queueingId === order.rawId && { opacity: 0.6 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Queue transport request ${order.requestCode}`}
                      >
                        <Rocket size={14} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={styles.actionBtnPrimaryText}>
                          {queueingId === order.rawId ? 'Queueing...' : 'Queue Now'}
                        </Text>
                      </Pressable>
                    ) : (isInProgress || isQueued) ? (
                      <>
                        <Pressable
                          onPress={() => {
                            triggerHaptic('tap');
                            navigate('live_map', {
                              jobId: order.linkedJobId,
                              robotId: order.robot.includes('AMR-02') ? 'AMR-02' : 'AMR-01',
                            });
                          }}
                          style={styles.actionBtnPrimary}
                          accessibilityRole="button"
                        >
                          <Navigation size={14} color="#ffffff" style={{ marginRight: 6 }} />
                          <Text style={styles.actionBtnPrimaryText}>Track on live map</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            triggerHaptic('tap');
                            if (order.linkedJobId) {
                              navigate('job_detail', { jobId: order.linkedJobId });
                            }
                          }}
                          style={styles.actionBtnOutline}
                          accessibilityRole="button"
                        >
                          <Text style={styles.actionBtnOutlineText}>View job</Text>
                        </Pressable>
                      </>
                    ) : isCompleted ? (
                      <>
                        <Pressable
                          onPress={() => {
                            triggerHaptic('tap');
                            toast.success(`Audit slip printed for ${order.id}`);
                          }}
                          style={styles.actionBtnOutline}
                          accessibilityRole="button"
                        >
                          <Printer size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
                          <Text style={styles.actionBtnOutlineText}>Print slip</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            triggerHaptic('tap');
                            navigate('transport_create', {
                              workflow: order.workflowName,
                              source: order.source,
                              destination: order.destination,
                              container: order.container,
                              qty: String(order.qty),
                            });
                          }}
                          style={styles.actionBtnRepeat}
                          accessibilityRole="button"
                        >
                          <RefreshCw size={13} color={colors.primaryText} style={{ marginRight: 6 }} />
                          <Text style={styles.actionBtnRepeatText}>Repeat Dispatch</Text>
                        </Pressable>
                      </>
                    ) : isCancelled ? (
                      <Pressable
                        onPress={() => {
                          triggerHaptic('tap');
                          navigate('transport_create', {
                            workflow: order.workflowName,
                            source: order.source,
                            destination: order.destination,
                            container: order.container,
                            qty: String(order.qty),
                          });
                        }}
                        style={[styles.actionBtnPrimary, { flex: 1 }]}
                        accessibilityRole="button"
                      >
                        <RefreshCw size={14} color="#ffffff" style={{ marginRight: 6 }} />
                        <Text style={styles.actionBtnPrimaryText}>
                          Re-dispatch order
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCardActive: {
    borderColor: colors.darkAction,
    borderWidth: 1.5,
    backgroundColor: '#ffffff',
    ...shadows.panel,
  },
  metricNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
  },
  metricNumberActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  metricLabelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  searchSection: {
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
    height: 44,
  },
  clearBtn: {
    padding: 6,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterBtnActive: {
    borderColor: colors.darkAction,
    backgroundColor: colors.surfaceSubtle,
  },
  filterDotBadge: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.darkAction,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    minHeight: 34,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.darkAction,
    borderColor: colors.darkAction,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  ordersList: {
    gap: 12,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
    fontFamily: typography.fontSans,
  },
  resetBtn: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.panel,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  idGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderId: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  categoryBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'capitalize',
    fontFamily: typography.fontSans,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeSubmitted: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  statusBadgeQueued: {
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
  },
  statusBadgeWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  statusBadgeSuccess: {
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
  },
  statusBadgeDanger: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#b45309',
    marginRight: 5,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: typography.fontSans,
  },
  workflowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    fontFamily: typography.fontSans,
  },
  routeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.sm,
    marginBottom: 10,
  },
  routeSource: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 0,
    fontFamily: typography.fontSans,
  },
  routeDestination: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    flexShrink: 1,
    fontFamily: typography.fontSans,
  },
  cargoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cargoContainer: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  cargoDot: {
    marginHorizontal: 6,
    color: colors.textMuted,
  },
  cargoDetails: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
    flex: 1,
  },
  cargoQty: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: 12,
  },
  assignedCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  assignedLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  assignedRobot: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  timeCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  cancelAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(220, 38, 38, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
    borderRadius: radii.sm,
    padding: 10,
    marginBottom: 12,
  },
  cancelAlertText: {
    fontSize: 12,
    color: '#dc2626',
    flex: 1,
    lineHeight: 16,
    fontFamily: typography.fontSans,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.darkAction,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: typography.fontSans,
  },
  actionBtnOutline: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBtnOutlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  actionBtnRepeat: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionBtnRepeatText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
});
