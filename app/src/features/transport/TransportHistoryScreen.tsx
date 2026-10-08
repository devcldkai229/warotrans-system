import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Badge } from '../../shared/components/Badge';
import { Input } from '../../shared/components/Input';
import { colors } from '../../shared/theme/colors';

export interface TransportAuditOrder {
  id: string;
  workflowName: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  source: string;
  destination: string;
  container: string;
  product: string;
  qty: number;
  robot: string;
  timeAgo: string;
}

const PAST_ORDERS: TransportAuditOrder[] = [
  {
    id: 'TR-2048',
    workflowName: 'Inbound Putaway',
    status: 'IN_PROGRESS',
    source: 'Dock 01',
    destination: 'Rack A-02 Bin 03',
    container: 'BOX-101',
    product: 'Optical Proximity Sensor X4',
    qty: 45,
    robot: 'AMR-01',
    timeAgo: 'Just now',
  },
  {
    id: 'TR-2046',
    workflowName: 'Outbound Retrieval',
    status: 'IN_PROGRESS',
    source: 'Rack B-04',
    destination: 'Dock 04',
    container: 'BOX-204',
    product: 'Pneumatic Actuator Valve',
    qty: 50,
    robot: 'AMR-02',
    timeAgo: '4 mins ago',
  },
  {
    id: 'TR-2045',
    workflowName: 'Internal Relocation',
    status: 'COMPLETED',
    source: 'Rack A-01',
    destination: 'Rack A-09',
    container: 'TOTE-088',
    product: 'Relay Modules 24V',
    qty: 20,
    robot: 'AMR-01',
    timeAgo: '42 mins ago',
  },
  {
    id: 'TR-2042',
    workflowName: 'Point-to-Point Transport',
    status: 'COMPLETED',
    source: 'Dock 02',
    destination: 'Depot 01',
    container: 'BOX-305',
    product: 'Micro Controller Unit ESP32',
    qty: 100,
    robot: 'AMR-02',
    timeAgo: '1 hour ago',
  },
  {
    id: 'TR-2040',
    workflowName: 'Inbound Putaway',
    status: 'COMPLETED',
    source: 'Dock 01',
    destination: 'Rack B-01',
    container: 'BOX-205',
    product: 'Heavy Duty Coupler 20mm',
    qty: 40,
    robot: 'AMR-01',
    timeAgo: '2 hours ago',
  },
  {
    id: 'TR-2038',
    workflowName: 'Replenishment',
    status: 'CANCELLED',
    source: 'Rack B-08',
    destination: 'Rack A-02',
    container: 'BOX-991',
    product: 'Damaged Packaging Return',
    qty: 15,
    robot: 'AMR-02',
    timeAgo: '3 hours ago',
  },
];

export function TransportHistoryScreen() {
  const { navigate } = useNavigation();
  const [filter, setFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [search, setSearch] = useState('');

  const inProgressCount = PAST_ORDERS.filter((o) => o.status === 'IN_PROGRESS').length;
  const completedCount = PAST_ORDERS.filter((o) => o.status === 'COMPLETED').length;
  const cancelledCount = PAST_ORDERS.filter((o) => o.status === 'CANCELLED').length;

  const filtered = PAST_ORDERS.filter((o) => {
    if (filter !== 'ALL' && o.status !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.id.toLowerCase().includes(q) ||
      o.workflowName.toLowerCase().includes(q) ||
      o.source.toLowerCase().includes(q) ||
      o.destination.toLowerCase().includes(q) ||
      o.container.toLowerCase().includes(q) ||
      o.product.toLowerCase().includes(q) ||
      o.robot.toLowerCase().includes(q)
    );
  });

  const getStatusTone = (status: TransportAuditOrder['status']) => {
    switch (status) {
      case 'IN_PROGRESS':
        return 'warning';
      case 'COMPLETED':
        return 'success';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <View style={styles.container}>
      {/* Metric Counters */}
      <View style={styles.countersRow}>
        <Pressable
          onPress={() => setFilter('ALL')}
          style={[styles.counterBtn, filter === 'ALL' && styles.counterBtnActive]}
        >
          <Text style={styles.counterNum}>{PAST_ORDERS.length}</Text>
          <Text style={styles.counterLabel}>Total</Text>
        </Pressable>

        <Pressable
          onPress={() => setFilter('IN_PROGRESS')}
          style={[styles.counterBtn, filter === 'IN_PROGRESS' && styles.counterBtnActive]}
        >
          <Text style={[styles.counterNum, { color: colors.warning }]}>{inProgressCount}</Text>
          <Text style={styles.counterLabel}>Active</Text>
        </Pressable>

        <Pressable
          onPress={() => setFilter('COMPLETED')}
          style={[styles.counterBtn, filter === 'COMPLETED' && styles.counterBtnActive]}
        >
          <Text style={[styles.counterNum, { color: colors.success }]}>{completedCount}</Text>
          <Text style={styles.counterLabel}>Done</Text>
        </Pressable>

        <Pressable
          onPress={() => setFilter('CANCELLED')}
          style={[styles.counterBtn, filter === 'CANCELLED' && styles.counterBtnActive]}
        >
          <Text style={[styles.counterNum, { color: colors.danger }]}>{cancelledCount}</Text>
          <Text style={styles.counterLabel}>Void</Text>
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchWrap}>
        <Input
          placeholder="Filter by TR-xxxx, SKU, container, robot..."
          value={search}
          onChangeText={setSearch}
          containerStyle={{ marginBottom: 0 }}
        />
      </View>

      {/* Order Cards List */}
      <ScrollView style={styles.ordersList} contentContainerStyle={styles.ordersContent}>
        {filtered.map((order) => (
          <View key={order.id} style={styles.orderCard}>
            <View style={styles.cardHeader}>
              <View style={styles.idGroup}>
                <Text style={styles.orderId}>{order.id}</Text>
                <Text style={styles.wfName}>· {order.workflowName}</Text>
              </View>
              <Badge
                label={order.status.replace('_', ' ')}
                tone={getStatusTone(order.status)}
                size="sm"
              />
            </View>

            <Text style={styles.routeText}>
              {order.source} ➔ {order.destination}
            </Text>

            <View style={styles.payloadBox}>
              <Text style={styles.containerBarcode}>📦 {order.container}</Text>
              <Text style={styles.productDesc}>
                {order.qty} × {order.product}
              </Text>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.robotAssigned}>Carrier: {order.robot}</Text>
              <View style={styles.footerActions}>
                <Text style={styles.timeAgo}>{order.timeAgo}</Text>
                <Pressable
                  onPress={() => navigate('live_map', { robotId: order.robot, jobId: order.id })}
                  style={styles.trackBtn}
                >
                  <Text style={styles.trackBtnText}>Track Map ›</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  countersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  counterBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  counterBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  counterNum: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  counterLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  ordersList: {
    flex: 1,
    marginTop: 10,
  },
  ordersContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  idGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orderId: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.primary,
  },
  wfName: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  routeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  payloadBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  containerBarcode: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: colors.textPrimary,
  },
  productDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceSubtle,
    paddingTop: 8,
  },
  robotAssigned: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: colors.textPrimary,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeAgo: {
    fontSize: 10,
    color: colors.textMuted,
  },
  trackBtn: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  trackBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primaryDark,
  },
});
