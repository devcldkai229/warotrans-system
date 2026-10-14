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
import { listTransportRequests, TransportRequestListItem } from '../../shared/api';

export interface TransportOrder {
  id: string;
  workflowName: string;
  category: 'INBOUND' | 'OUTBOUND' | 'INTERNAL' | 'EXCEPTION';
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  statusText: string;
  source: string;
  destination: string;
  container: string;
  product: string;
  qty: number;
  robot: string;
  timeLabel: string;
  duration?: string;
  cancelReason?: string;
  operator: string;
}

export const TRANSPORT_ORDERS: TransportOrder[] = [
  {
    id: 'TR-2048',
    workflowName: 'Inbound Putaway',
    category: 'INBOUND',
    status: 'IN_PROGRESS',
    statusText: 'Allocating AMR',
    source: 'Dock 01',
    destination: 'Rack A · Level 2 · Bin 03',
    container: 'BOX-101',
    product: 'Control Module',
    qty: 25,
    robot: 'AMR-01',
    timeLabel: 'Requested 2m ago',
    operator: 'Alex Tran',
  },
  {
    id: 'TR-2047',
    workflowName: 'Line Replenishment',
    category: 'INTERNAL',
    status: 'IN_PROGRESS',
    statusText: 'En Route',
    source: 'Rack B-02',
    destination: 'Assembly Line 03',
    container: 'BOX-109',
    product: 'Fastener Set',
    qty: 40,
    robot: 'AMR-02',
    timeLabel: 'Dispatched 5m ago',
    operator: 'Alex Tran',
  },
  {
    id: 'TR-2046',
    workflowName: 'Outbound Retrieval',
    category: 'OUTBOUND',
    status: 'COMPLETED',
    statusText: 'Delivered & Verified',
    source: 'Rack B-04',
    destination: 'Dock Out 01',
    container: 'BOX-204',
    product: 'Bearing Kit',
    qty: 12,
    robot: 'AMR-01',
    timeLabel: 'Completed at 10:24 AM',
    duration: '8m 15s',
    operator: 'Alex Tran',
  },
  {
    id: 'TR-2045',
    workflowName: 'Storage Reallocation',
    category: 'INTERNAL',
    status: 'COMPLETED',
    statusText: 'Transfer Complete',
    source: 'Rack A-01',
    destination: 'Rack B-05',
    container: 'BOX-310',
    product: 'Shipping Carton',
    qty: 50,
    robot: 'AMR-02',
    timeLabel: 'Completed at 09:50 AM',
    duration: '6m 40s',
    operator: 'David Nguyen',
  },
  {
    id: 'TR-2044',
    workflowName: 'Direct Point-to-Point',
    category: 'INTERNAL',
    status: 'COMPLETED',
    statusText: 'Handover Complete',
    source: 'Inbound Staging',
    destination: 'QA Inspection Bay',
    container: 'BOX-112',
    product: 'Sensor Array',
    qty: 10,
    robot: 'AMR-01',
    timeLabel: 'Completed at 09:12 AM',
    duration: '4m 10s',
    operator: 'Alex Tran',
  },
  {
    id: 'TR-2043',
    workflowName: 'Payload Recovery (Rescue)',
    category: 'EXCEPTION',
    status: 'COMPLETED',
    statusText: 'Rescue Resolved',
    source: 'Aisle 2 (Stalled Point)',
    destination: 'Buffer Staging Bay',
    container: 'BOX-99',
    product: 'Electronic Components',
    qty: 15,
    robot: 'AMR-02',
    timeLabel: 'Resolved at 08:35 AM',
    duration: '11m 20s',
    operator: 'Sarah Jenkins',
  },
  {
    id: 'TR-2042',
    workflowName: 'Outbound Retrieval',
    category: 'OUTBOUND',
    status: 'CANCELLED',
    statusText: 'Cancelled',
    source: 'Rack A-08',
    destination: 'Dock Out 02',
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
    workflowName: 'Inbound Putaway',
    category: 'INBOUND',
    status: 'CANCELLED',
    statusText: 'Cancelled',
    source: 'Dock 02',
    destination: 'Rack B-01',
    container: 'BOX-104',
    product: 'Protective Insert',
    qty: 30,
    robot: 'AMR-02',
    timeLabel: 'Cancelled at 07:45 AM',
    cancelReason: 'Operator reported barcode label damaged and unreadable.',
    operator: 'David Nguyen',
  },
];

function mapRequestToOrder(item: TransportRequestListItem): TransportOrder {
  const detail = item.details?.[0];
  const isCompleted = item.status === 'COMPLETED';
  const isCancelled =
    item.status === 'CANCELLED' || item.status === 'REJECTED' || item.status === 'FAILED';
  const isInProgress = !isCompleted && !isCancelled;

  let category: TransportOrder['category'] = 'INTERNAL';
  const wf = (item.workflowCode || '').toUpperCase();
  if (wf.includes('INBOUND')) category = 'INBOUND';
  else if (wf.includes('OUTBOUND')) category = 'OUTBOUND';
  else if (wf.includes('RESCUE') || wf.includes('BLOCK') || wf.includes('SAFETY'))
    category = 'EXCEPTION';

  let statusText = 'Processing';
  if (item.status === 'SUBMITTED') statusText = 'Submitted';
  else if (item.status === 'QUEUED') statusText = 'Queued for fleet';
  else if (item.status === 'PLANNING') statusText = 'Planning route';
  else if (item.status === 'EXECUTING' || item.status === 'IN_PROGRESS') statusText = 'En Route';
  else if (item.status === 'COMPLETED') statusText = 'Delivered & Verified';
  else if (item.status === 'CANCELLED') statusText = 'Cancelled';
  else if (item.status === 'REJECTED') statusText = 'Rejected by scheduler';

  return {
    id: item.requestCode,
    workflowName: item.workflowCode ? item.workflowCode.replace(/_/g, ' ') : 'Transport Request',
    category,
    status: isInProgress ? 'IN_PROGRESS' : isCompleted ? 'COMPLETED' : 'CANCELLED',
    statusText,
    source: detail?.sourceEndpointCode || 'Pickup Station',
    destination: detail?.destinationEndpointCode || 'Dropoff Location',
    container: detail?.containerBarcode || 'Container Tote',
    product: item.note || 'Standard Cargo',
    qty: 1,
    robot: 'AMR Fleet',
    timeLabel: item.submittedAt
      ? new Date(item.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Just now',
    operator: 'Staff Operator',
  };
}

type CategoryFilter = 'ALL' | 'INBOUND' | 'OUTBOUND' | 'INTERNAL' | 'EXCEPTION';

export function TransportHistoryScreen() {
  const { navigate, goBack } = useNavigation();
  const [filter, setFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [showCategoryChips, setShowCategoryChips] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState<TransportOrder[]>(TRANSPORT_ORDERS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await listTransportRequests({ take: 50 });
      if (res?.items && res.items.length > 0) {
        const liveOrders = res.items.map(mapRequestToOrder);
        setOrders(liveOrders);
      }
    } catch (err) {
      console.warn('Backend history fetch error, using cached records:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const inProgressCount = orders.filter((o) => o.status === 'IN_PROGRESS').length;
  const completedCount = orders.filter((o) => o.status === 'COMPLETED').length;
  const cancelledCount = orders.filter((o) => o.status === 'CANCELLED').length;

  const filteredOrders = orders.filter((order) => {
    if (filter !== 'ALL' && order.status !== filter) return false;
    if (categoryFilter !== 'ALL' && order.category !== categoryFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      order.id.toLowerCase().includes(q) ||
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
              setFilter('ALL');
            }}
            accessibilityRole="tab"
            accessibilityLabel={`Filter all ${orders.length} orders`}
            accessibilityState={{ selected: filter === 'ALL' }}
            style={[
              styles.metricCard,
              filter === 'ALL' && styles.metricCardActive,
            ]}
          >
            <Text style={[styles.metricNumber, filter === 'ALL' && styles.metricNumberActive]}>
              {orders.length}
            </Text>
            <Text style={[styles.metricLabel, filter === 'ALL' && styles.metricLabelActive]}>
              All orders
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setFilter('IN_PROGRESS');
            }}
            accessibilityRole="tab"
            accessibilityLabel={`Filter ${inProgressCount} active orders`}
            accessibilityState={{ selected: filter === 'IN_PROGRESS' }}
            style={[
              styles.metricCard,
              filter === 'IN_PROGRESS' && styles.metricCardActive,
            ]}
          >
            <Text style={[styles.metricNumber, filter === 'IN_PROGRESS' && styles.metricNumberActive]}>
              {inProgressCount}
            </Text>
            <Text style={[styles.metricLabel, filter === 'IN_PROGRESS' && styles.metricLabelActive]}>
              Active
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setFilter('COMPLETED');
            }}
            accessibilityRole="tab"
            accessibilityLabel={`Filter ${completedCount} completed orders`}
            accessibilityState={{ selected: filter === 'COMPLETED' }}
            style={[
              styles.metricCard,
              filter === 'COMPLETED' && styles.metricCardActive,
            ]}
          >
            <Text style={[styles.metricNumber, filter === 'COMPLETED' && styles.metricNumberActive]}>
              {completedCount}
            </Text>
            <Text style={[styles.metricLabel, filter === 'COMPLETED' && styles.metricLabelActive]}>
              Delivered
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setFilter('CANCELLED');
            }}
            accessibilityRole="tab"
            accessibilityLabel={`Filter ${cancelledCount} cancelled orders`}
            accessibilityState={{ selected: filter === 'CANCELLED' }}
            style={[
              styles.metricCard,
              filter === 'CANCELLED' && styles.metricCardActive,
            ]}
          >
            <Text style={[styles.metricNumber, filter === 'CANCELLED' && styles.metricNumberActive]}>
              {cancelledCount}
            </Text>
            <Text style={[styles.metricLabel, filter === 'CANCELLED' && styles.metricLabelActive]}>
              Cancelled
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
                { key: 'EXCEPTION', label: 'Rescue / Safety' },
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
              {(searchQuery || filter !== 'ALL' || categoryFilter !== 'ALL') && (
                <Pressable
                  onPress={() => {
                    setSearchQuery('');
                    setFilter('ALL');
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
              const isInProgress = order.status === 'IN_PROGRESS';
              const isCompleted = order.status === 'COMPLETED';
              const isCancelled = order.status === 'CANCELLED';

              return (
                <View key={order.id} style={styles.orderCard}>
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
                        isInProgress && styles.statusBadgeWarning,
                        isCompleted && styles.statusBadgeSuccess,
                        isCancelled && styles.statusBadgeDanger,
                      ]}
                    >
                      {isInProgress && <View style={styles.pulsingDot} />}
                      {isCompleted && <CheckCircle2 size={13} color="#16a34a" style={{ marginRight: 4 }} />}
                      {isCancelled && <AlertTriangle size={13} color="#dc2626" style={{ marginRight: 4 }} />}
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isInProgress && { color: '#b45309' },
                          isCompleted && { color: '#16a34a' },
                          isCancelled && { color: '#dc2626' },
                        ]}
                      >
                        {order.statusText}
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
                    <Box size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
                    <Text style={styles.cargoContainer}>{order.container}</Text>
                    <Text style={styles.cargoDot}>·</Text>
                    <Text style={styles.cargoDetails}>
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
                    {isInProgress && (
                      <>
                        <Pressable
                          onPress={() => {
                            triggerHaptic('tap');
                            navigate('live_map', { jobId: 'JOB-2026-0812', robotId: order.robot });
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
                            navigate('job_detail', { jobId: 'JOB-2026-0812' });
                          }}
                          style={styles.actionBtnOutline}
                          accessibilityRole="button"
                        >
                          <Text style={styles.actionBtnOutlineText}>View job</Text>
                        </Pressable>
                      </>
                    )}

                    {isCompleted && (
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
                          style={styles.actionBtnOutline}
                          accessibilityRole="button"
                        >
                          <RefreshCw size={13} color={colors.textSecondary} style={{ marginRight: 6 }} />
                          <Text style={styles.actionBtnOutlineText}>Repeat</Text>
                        </Pressable>
                      </>
                    )}

                    {isCancelled && (
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
                    )}
                  </View>
                </View>
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
    flexShrink: 1,
    fontFamily: typography.fontSans,
  },
  routeDestination: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
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
});
