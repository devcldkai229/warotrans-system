import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  CheckCircle2,
  MapPin,
  Navigation,
  Printer,
  RefreshCw,
  Search,
  Truck,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';

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
    statusText: 'ALLOCATING AMR',
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
    statusText: 'EN ROUTE',
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
    statusText: 'DELIVERED & VERIFIED',
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
    statusText: 'TRANSFER COMPLETE',
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
    statusText: 'HANDOVER COMPLETE',
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
    statusText: 'RESCUE RESOLVED',
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
    statusText: 'CANCELLED',
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
    statusText: 'CANCELLED',
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

export function TransportHistoryScreen() {
  const { navigate, goBack } = useNavigation();
  const [filter, setFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const inProgressCount = TRANSPORT_ORDERS.filter((o) => o.status === 'IN_PROGRESS').length;
  const completedCount = TRANSPORT_ORDERS.filter((o) => o.status === 'COMPLETED').length;
  const cancelledCount = TRANSPORT_ORDERS.filter((o) => o.status === 'CANCELLED').length;

  const filteredOrders = TRANSPORT_ORDERS.filter((order) => {
    if (filter !== 'ALL' && order.status !== filter) return false;
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
      {/* Header matching prototype AppHeader */}
      <SubScreenHeader
        label="Fleet Audit Trail"
        title="Transport History"
        onBack={goBack}
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Metric Summary Counters */}
        <View style={styles.metricsGrid}>
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setFilter('ALL');
            }}
            style={[
              styles.metricCard,
              filter === 'ALL' && styles.metricCardAllActive,
            ]}
          >
            <Text style={styles.metricNumber}>{TRANSPORT_ORDERS.length}</Text>
            <Text style={styles.metricLabel}>TOTAL</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setFilter('IN_PROGRESS');
            }}
            style={[
              styles.metricCard,
              filter === 'IN_PROGRESS' && styles.metricCardWarningActive,
            ]}
          >
            <Text style={[styles.metricNumber, { color: '#b45309' }]}>{inProgressCount}</Text>
            <Text style={styles.metricLabel}>ACTIVE</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setFilter('COMPLETED');
            }}
            style={[
              styles.metricCard,
              filter === 'COMPLETED' && styles.metricCardSuccessActive,
            ]}
          >
            <Text style={[styles.metricNumber, { color: '#16a34a' }]}>{completedCount}</Text>
            <Text style={styles.metricLabel}>DONE</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setFilter('CANCELLED');
            }}
            style={[
              styles.metricCard,
              filter === 'CANCELLED' && styles.metricCardDangerActive,
            ]}
          >
            <Text style={[styles.metricNumber, { color: '#dc2626' }]}>{cancelledCount}</Text>
            <Text style={styles.metricLabel}>VOID</Text>
          </Pressable>
        </View>

        {/* Search Input Bar */}
        <View style={styles.searchBox}>
          <Search size={16} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search TR, location, container, robot..."
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
          {searchQuery ? (
            <Pressable
              onPress={() => setSearchQuery('')}
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={15} color="#94a3b8" />
            </Pressable>
          ) : null}
        </View>

        {/* Status Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterTabsScroll}
          contentContainerStyle={styles.filterTabsRow}
        >
          {[
            { id: 'ALL', label: `All (${TRANSPORT_ORDERS.length})` },
            { id: 'IN_PROGRESS', label: `In Progress (${inProgressCount})` },
            { id: 'COMPLETED', label: `Completed (${completedCount})` },
            { id: 'CANCELLED', label: `Cancelled (${cancelledCount})` },
          ].map((tabItem) => {
            const isSelected = filter === tabItem.id;
            return (
              <Pressable
                key={tabItem.id}
                onPress={() => {
                  triggerHaptic('tap');
                  setFilter(tabItem.id as any);
                }}
                style={[
                  styles.filterTab,
                  isSelected ? styles.filterTabActive : styles.filterTabInactive,
                ]}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    isSelected ? styles.filterTabTextActive : styles.filterTabTextInactive,
                  ]}
                >
                  {tabItem.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Order Cards List */}
        <View style={styles.ordersList}>
          {filteredOrders.length === 0 ? (
            <View style={styles.emptyCard}>
              <Search size={28} color="#94a3b8" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>No transport records found</Text>
              <Text style={styles.emptySubtitle}>Try adjusting your filter or search query.</Text>
              {(searchQuery || filter !== 'ALL') && (
                <Pressable
                  onPress={() => {
                    setSearchQuery('');
                    setFilter('ALL');
                  }}
                  style={styles.resetBtn}
                >
                  <Text style={styles.resetBtnText}>Reset Filters</Text>
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
                        <Text style={styles.categoryBadgeText}>{order.category}</Text>
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
                      {isCompleted && <CheckCircle2 size={11} color="#16a34a" style={{ marginRight: 4 }} />}
                      {isCancelled && <AlertTriangle size={11} color="#dc2626" style={{ marginRight: 4 }} />}
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
                    <MapPin size={13} color={colors.primary} style={{ marginRight: 6, flexShrink: 0 }} />
                    <Text style={styles.routeSource} numberOfLines={1}>{order.source}</Text>
                    <ArrowRight size={12} color="#94a3b8" style={{ marginHorizontal: 6, flexShrink: 0 }} />
                    <Text style={styles.routeDestination} numberOfLines={1}>{order.destination}</Text>
                  </View>

                  {/* Cargo Information */}
                  <View style={styles.cargoRow}>
                    <Box size={13} color="#64748b" style={{ marginRight: 6 }} />
                    <Text style={styles.cargoContainer}>{order.container}</Text>
                    <Text style={styles.cargoDot}>·</Text>
                    <Text style={styles.cargoDetails}>
                      {order.qty} × {order.product}
                    </Text>
                  </View>

                  {/* Metadata Row */}
                  <View style={styles.metaRow}>
                    <View style={styles.assignedCol}>
                      <Truck size={12} color={colors.primary} style={{ marginRight: 4 }} />
                      <Text style={styles.assignedLabel}>
                        Assigned: <Text style={styles.assignedRobot}>{order.robot}</Text>
                      </Text>
                    </View>
                    <Text style={styles.timeLabel}>
                      {order.timeLabel}{order.duration ? ` · (${order.duration})` : ''}
                    </Text>
                  </View>

                  {/* Cancellation Reason Alert if Cancelled */}
                  {isCancelled && order.cancelReason && (
                    <View style={styles.cancelAlert}>
                      <AlertTriangle size={13} color="#dc2626" style={{ marginRight: 6, marginTop: 1, flexShrink: 0 }} />
                      <Text style={styles.cancelAlertText}>
                        <Text style={{ fontWeight: 'bold' }}>Cancellation Reason: </Text>
                        {order.cancelReason}
                      </Text>
                    </View>
                  )}

                  {/* Action Buttons */}
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
                          <Navigation size={13} color="#ffffff" style={{ marginRight: 6 }} />
                          <Text style={styles.actionBtnPrimaryText}>Track on Map</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            triggerHaptic('tap');
                            navigate('job_detail', { jobId: 'JOB-2026-0812' });
                          }}
                          style={styles.actionBtnOutline}
                          accessibilityRole="button"
                        >
                          <Text style={styles.actionBtnOutlineText}>View Job Detail</Text>
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
                          <Printer size={13} color="#64748b" style={{ marginRight: 6 }} />
                          <Text style={[styles.actionBtnOutlineText, { color: '#64748b' }]}>Print Slip</Text>
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
                          <RefreshCw size={13} color={colors.primary} style={{ marginRight: 6 }} />
                          <Text style={[styles.actionBtnOutlineText, { color: colors.primary }]}>Retry</Text>
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
                        style={[styles.actionBtnOutline, { flex: 1 }]}
                        accessibilityRole="button"
                      >
                        <RefreshCw size={13} color={colors.primary} style={{ marginRight: 6 }} />
                        <Text style={[styles.actionBtnOutlineText, { color: colors.primary }]}>
                          Re-dispatch Order
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
    paddingBottom: 40,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    height: 60,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCardAllActive: {
    borderColor: colors.primary,
    borderWidth: 1,
    backgroundColor: 'rgba(0, 92, 209, 0.10)',
  },
  metricCardWarningActive: {
    borderColor: '#f59e0b',
    borderWidth: 1,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  metricCardSuccessActive: {
    borderColor: '#10b981',
    borderWidth: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  metricCardDangerActive: {
    borderColor: '#ef4444',
    borderWidth: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  metricNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
  },
  filterTabsScroll: {
    marginBottom: 16,
  },
  filterTabsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 4,
  },
  filterTab: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    height: 30,
    justifyContent: 'center',
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterTabInactive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterTabTextActive: {
    color: '#ffffff',
  },
  filterTabTextInactive: {
    color: colors.textMuted,
  },
  ordersList: {
    gap: 12,
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  resetBtn: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  orderCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 18,
  },
  idGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderId: {
    fontFamily: typography.fontMono,
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  categoryBadge: {
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadgeWarning: {
    backgroundColor: '#fef3c7',
  },
  statusBadgeSuccess: {
    backgroundColor: '#dcfce7',
  },
  statusBadgeDanger: {
    backgroundColor: '#fee2e2',
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
    marginRight: 5,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  workflowTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  routeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.4)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 39,
  },
  routeSource: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    flexShrink: 1,
  },
  routeDestination: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  cargoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 17,
  },
  cargoContainer: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  cargoDot: {
    marginHorizontal: 6,
    color: '#94a3b8',
    fontWeight: 'bold',
  },
  cargoDetails: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 232, 240, 0.6)',
    paddingTop: 8,
    minHeight: 24,
  },
  assignedCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  assignedLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  assignedRobot: {
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  timeLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '500',
  },
  cancelAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 10,
  },
  cancelAlertText: {
    flex: 1,
    fontSize: 10,
    color: '#dc2626',
    lineHeight: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 232, 240, 0.4)',
    paddingTop: 4,
    minHeight: 37,
  },
  actionBtnPrimary: {
    flex: 1,
    height: 32,
    backgroundColor: colors.primary,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  actionBtnOutline: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnOutlineText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
  },
});
