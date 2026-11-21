import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  MapPin,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import {
  getIssue,
  getMapVersionDetail,
  getUserErrorMessage,
  listIssues,
  reportWarehouseHazard,
  transitionIssue,
} from '../../shared/api';
import { getOperatingContext } from '../../shared/api/operatingContextApi';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { t } from '../../shared/i18n';
import type { ThemeColors } from '../../shared/theme/colors';
import { dockReservedSpace } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import type {
  HazardType,
  IssueReportResponse,
  IssueSeverity,
  IssueStatus,
} from '../../shared/types/contracts';
import {
  Button,
  Card,
  EmptyState,
  SegmentedControl,
  StatusPill,
  Text,
  TextField,
} from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import {
  buildHazardRequestBody,
  collectMapHazardLocations,
  createHazardRequestId,
  HAZARD_SEVERITY_OPTIONS,
  HAZARD_TYPE_OPTIONS,
  hazardPayloadFingerprint,
  hazardSeverityTone,
  hazardTypeLabel,
  type HazardLocationKind,
} from './hazardReportData';
import { IssuePhotoSection } from './IssuePhotoSection';

const LOCATION_KIND_OPTIONS: ReadonlyArray<{ label: string; value: HazardLocationKind }> = [
  { label: 'Corridor / Aisle', value: 'edge' },
  { label: 'Work Zone', value: 'zone' },
  { label: 'Station / Endpoint', value: 'endpoint' },
];

const TRANSITION_LABELS: Record<string, string> = {
  ACKNOWLEDGED: 'Acknowledge',
  IN_PROGRESS: 'Start Work',
  RESOLVED: 'Resolve',
  CLOSED: 'Close Issue',
};

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '—';

export function BlockPathHazardScreen() {
  const { styles, colors } = useThemedStyles(createStyles);
  const { session } = useAuth();
  const { goBack, params, dockHeight } = useNavigation();
  const client = useQueryClient();

  const canCreate = sessionCan(session, PERMISSIONS.issueCreate);
  const canRead = sessionCan(session, PERMISSIONS.issueRead);
  const canManage = sessionCan(session, PERMISSIONS.issueManage);

  const initialIssueId = typeof params?.issueId === 'string' ? params.issueId : '';
  const [inspectIssueId, setInspectIssueId] = useState(initialIssueId);

  const [locationKind, setLocationKind] = useState<HazardLocationKind>('edge');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [hazardType, setHazardType] = useState<HazardType>('LIQUID_SPILL');
  const [severity, setSeverity] = useState<IssueSeverity>('HIGH');
  const [description, setDescription] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedTicket, setSubmittedTicket] = useState<IssueReportResponse | null>(null);

  const [resolutionNote, setResolutionNote] = useState('');
  const [transitionBusy, setTransitionBusy] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const requestRef = useRef<{ fingerprint: string; requestId: string }>({
    fingerprint: '',
    requestId: createHazardRequestId(),
  });

  useEffect(() => {
    setInspectIssueId(initialIssueId);
    setSubmittedTicket(null);
    setTransitionError(null);
    setResolutionNote('');
  }, [initialIssueId]);

  const mapQuery = useQuery({
    queryKey: ['hazard-map-locations', session?.id],
    queryFn: async ({ signal }) => {
      const context = await getOperatingContext();
      const map = await getMapVersionDetail(context.map.id, signal);
      return { context, map };
    },
    enabled: Boolean(session?.id && canCreate),
  });

  const activeIssueId = submittedTicket?.id || inspectIssueId;
  const issueQuery = useQuery({
    queryKey: ['hazard-issue-detail', session?.id, activeIssueId],
    queryFn: ({ signal }) => getIssue(activeIssueId, signal),
    enabled: Boolean(session?.id && canRead && activeIssueId),
  });

  const recentHazardsQuery = useQuery({
    queryKey: ['recent-warehouse-hazards', session?.id],
    queryFn: ({ signal }) => listIssues({ take: 20 }, signal),
    enabled: Boolean(session?.id && canRead && !activeIssueId),
  });

  const locations = useMemo(
    () => collectMapHazardLocations(mapQuery.data?.map),
    [mapQuery.data?.map],
  );

  const activeLocationOptions = locations[locationKind === 'edge' ? 'edges' : locationKind === 'zone' ? 'zones' : 'endpoints'];

  useEffect(() => {
    if (!activeLocationOptions.length) {
      if (selectedLocationId) setSelectedLocationId('');
      return;
    }
    if (!activeLocationOptions.some(item => item.id === selectedLocationId)) {
      setSelectedLocationId(activeLocationOptions[0].id);
    }
  }, [activeLocationOptions, selectedLocationId]);

  useEffect(() => {
    if (!locations.edges.length && locationKind === 'edge') {
      if (locations.zones.length) setLocationKind('zone');
      else if (locations.endpoints.length) setLocationKind('endpoint');
    }
  }, [locations.edges.length, locations.zones.length, locations.endpoints.length, locationKind]);

  const activeIssue = issueQuery.data ?? submittedTicket;
  const recentHazards = useMemo(
    () => (recentHazardsQuery.data?.items ?? []).filter(item => Boolean(item.hazard)),
    [recentHazardsQuery.data?.items],
  );

  const handleSubmit = async () => {
    const mapId = mapQuery.data?.map.id;
    const trimmedDesc = description.trim();
    if (!canCreate || submitBusy || !mapId) return;
    if (!selectedLocationId) {
      setSubmitError(t('Select a corridor edge, work zone, or station endpoint on the published map.'));
      return;
    }
    if (!trimmedDesc) {
      setSubmitError(t('Description is required.'));
      return;
    }

    const fingerprint = hazardPayloadFingerprint({
      mapVersionId: mapId,
      locationKind,
      locationId: selectedLocationId,
      hazardType,
      severity,
      description: trimmedDesc,
    });
    if (requestRef.current.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, requestId: createHazardRequestId() };
    }

    triggerHaptic('tap');
    setSubmitBusy(true);
    setSubmitError(null);
    try {
      const created = await reportWarehouseHazard(
        buildHazardRequestBody(requestRef.current.requestId, {
          mapVersionId: mapId,
          locationKind,
          locationId: selectedLocationId,
          hazardType,
          severity,
          description: trimmedDesc,
        }),
      );
      triggerHaptic('success');
      requestRef.current = { fingerprint: '', requestId: createHazardRequestId() };
      setSubmittedTicket(created);
      setInspectIssueId(created.id);
      setDescription('');
      void client.invalidateQueries({ queryKey: ['recent-warehouse-hazards'] });
      void client.invalidateQueries({ queryKey: ['notification-inbox'] });
    } catch (failure) {
      setSubmitError(
        getUserErrorMessage(
          failure,
          'Could not submit the hazard report. You can safely retry without creating duplicates.',
        ),
      );
    } finally {
      setSubmitBusy(false);
    }
  };

  const handleTransition = async (targetStatus: IssueStatus) => {
    if (!activeIssue || !canManage || transitionBusy) return;
    if (targetStatus === 'RESOLVED' && !resolutionNote.trim()) {
      setTransitionError(t('Enter a resolution note up to 1000 characters.'));
      return;
    }
    triggerHaptic('tap');
    setTransitionBusy(targetStatus);
    setTransitionError(null);
    try {
      const updated = await transitionIssue(activeIssue.id, {
        status: targetStatus,
        expectedVersion: activeIssue.version,
        resolution: targetStatus === 'RESOLVED' ? resolutionNote.trim() : null,
      });
      triggerHaptic('success');
      if (submittedTicket?.id === updated.id) {
        setSubmittedTicket(updated);
      }
      client.setQueryData(['hazard-issue-detail', session?.id, updated.id], updated);
      setResolutionNote('');
      void client.invalidateQueries({ queryKey: ['recent-warehouse-hazards'] });
    } catch (failure) {
      setTransitionError(getUserErrorMessage(failure, 'Issue could not be updated. Refresh and try again.'));
      void issueQuery.refetch();
    } finally {
      setTransitionBusy(null);
    }
  };

  const startNewReport = () => {
    triggerHaptic('tap');
    setInspectIssueId('');
    setSubmittedTicket(null);
    setSubmitError(null);
    setTransitionError(null);
    setResolutionNote('');
  };

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label={mapQuery.data?.map ? `${mapQuery.data.map.code} · Safety` : 'Floor Safety & Hazards'}
        title="Corridor Hazard"
        onBack={goBack}
        rightAction={
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              if (activeIssueId) void issueQuery.refetch();
              if (canCreate) void mapQuery.refetch();
              if (canRead && !activeIssueId) void recentHazardsQuery.refetch();
            }}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('Refresh')}
          >
            <RefreshCw size={18} color={colors.textPrimary} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: dockReservedSpace(dockHeight) + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {activeIssueId ? (
          issueQuery.isPending && !activeIssue ? (
            <Card padding="md" gap={8}>
              <Text variant="headline">Loading…</Text>
            </Card>
          ) : issueQuery.isError && !activeIssue ? (
            <EmptyState
              icon={AlertTriangle}
              tone="danger"
              title="Hazard ticket not found."
              message={getUserErrorMessage(issueQuery.error, 'Could not read issue details from the server.')}
              actionTitle={canCreate ? 'Report New Hazard' : 'Retry'}
              onAction={() => {
                if (canCreate) startNewReport();
                else void issueQuery.refetch();
              }}
            />
          ) : activeIssue ? (
            <View style={styles.stack}>
              <Card padding="md" gap={12}>
                <View style={styles.rowBetween}>
                  <View style={styles.iconRow}>
                    <View style={styles.ticketBadge}>
                      <ShieldAlert size={20} color={colors.dangerText} />
                    </View>
                    <View style={styles.flexText}>
                      <Text variant="title">Hazard Ticket Logged</Text>
                      <Text variant="caption" style={styles.monoText}>{activeIssue.code}</Text>
                    </View>
                  </View>
                  <StatusPill status={activeIssue.status} size="sm" dot />
                </View>

                <View style={styles.receiptBox}>
                  <View style={styles.receiptRow}>
                    <Text variant="caption" color="textSecondary">Location</Text>
                    <Text variant="bodyMedium" style={styles.monoText}>
                      {activeIssue.hazard?.locationCode || '—'}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text variant="caption" color="textSecondary">Hazard Type</Text>
                    <Text variant="bodyMedium">
                      {t(hazardTypeLabel(activeIssue.hazard?.hazardType))}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text variant="caption" color="textSecondary">Severity</Text>
                    <StatusPill
                      status={activeIssue.severity}
                      tone={hazardSeverityTone(activeIssue.severity)}
                      size="sm"
                    />
                  </View>
                  <View style={styles.receiptRow}>
                    <Text variant="caption" color="textSecondary">Reported</Text>
                    <Text variant="caption" color="textPrimary">
                      {formatDateTime(activeIssue.reportedAt)}
                    </Text>
                  </View>
                </View>

                <Text variant="body" color="textPrimary">{activeIssue.description}</Text>

                {activeIssue.resolution ? (
                  <View style={styles.infoBanner}>
                    <Text variant="caption" color="infoText">
                      {t('Resolution: {text}', { text: activeIssue.resolution })}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.infoBanner}>
                  <Text variant="caption" color="textSecondary">
                    Reporting logs a safety ticket and notifies warehouse staff. Robot routes and traffic zones are only changed by authorized traffic control.
                  </Text>
                </View>

                <IssuePhotoSection
                  issue={activeIssue}
                  canUpload={canCreate}
                  onUploaded={(updated) => {
                    if (submittedTicket?.id === updated.id) {
                      setSubmittedTicket(updated);
                    }
                    client.setQueryData(['hazard-issue-detail', session?.id, updated.id], updated);
                  }}
                  onRefreshIssue={canRead ? () => issueQuery.refetch() : undefined}
                />

                {canManage && activeIssue.allowedTransitions.length > 0 ? (
                  <View style={styles.transitionSection}>
                    <Text variant="label" color="textSecondary">Transition Status</Text>
                    {activeIssue.allowedTransitions.includes('RESOLVED') ? (
                      <TextField
                        label="Resolution Note"
                        value={resolutionNote}
                        onChangeText={setResolutionNote}
                        placeholder="Describe how the floor hazard was cleared"
                        maxLength={1000}
                        editable={!transitionBusy}
                      />
                    ) : null}
                    {transitionError ? (
                      <Text variant="caption" color="dangerText">{transitionError}</Text>
                    ) : null}
                    <View style={styles.actionRow}>
                      {activeIssue.allowedTransitions.map((nextStatus) => (
                        <Button
                          key={nextStatus}
                          title={TRANSITION_LABELS[nextStatus] || nextStatus}
                          variant={nextStatus === 'RESOLVED' ? 'primary' : 'outline'}
                          size="sm"
                          loading={transitionBusy === nextStatus}
                          disabled={!!transitionBusy}
                          onPress={() => {
                            void handleTransition(nextStatus as IssueStatus);
                          }}
                          style={styles.flexBtn}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {canCreate ? (
                  <Button
                    title="Report New Hazard"
                    variant="outline"
                    size="md"
                    fullWidth
                    onPress={startNewReport}
                  />
                ) : null}
              </Card>
            </View>
          ) : null
        ) : !canCreate ? (
          <EmptyState
            icon={ShieldAlert}
            tone="warning"
            title="Hazard Report Unavailable"
            message="You do not have permission to report warehouse hazards."
            actionTitle="Go Back"
            onAction={goBack}
          />
        ) : (
          <View style={styles.stack}>
            <Card padding="md" gap={12}>
              <Text variant="headline">Hazard Report</Text>
              <Text variant="body" color="textSecondary">
                Reporting logs a safety ticket and notifies warehouse staff. Robot routes and traffic zones are only changed by authorized traffic control.
              </Text>
            </Card>

            {/* Location Picker */}
            <Card padding="md" gap={12}>
              <Text variant="headline">Location</Text>
              <Text variant="caption" color="textSecondary">
                Select a corridor edge, work zone, or station endpoint on the published map.
              </Text>

              <SegmentedControl
                options={LOCATION_KIND_OPTIONS}
                value={locationKind}
                onChange={(next) => {
                  triggerHaptic('tap');
                  setLocationKind(next);
                }}
                size="sm"
                accessibilityLabel="Location"
              />

              {mapQuery.isPending ? (
                <Text variant="caption" color="textSecondary">Loading…</Text>
              ) : mapQuery.isError ? (
                <EmptyState
                  compact
                  tone="warning"
                  title="Hazard Report Unavailable"
                  message={getUserErrorMessage(mapQuery.error, 'Could not load map locations.')}
                  actionTitle="Retry"
                  onAction={() => {
                    void mapQuery.refetch();
                  }}
                />
              ) : activeLocationOptions.length === 0 ? (
                <View style={styles.warnBanner}>
                  <Text variant="caption" color="warningText">
                    No active locations found for this category on the published map.
                  </Text>
                </View>
              ) : (
                <View style={styles.optionList}>
                  {activeLocationOptions.map((loc) => {
                    const selected = loc.id === selectedLocationId;
                    return (
                      <Pressable
                        key={loc.id}
                        disabled={submitBusy}
                        onPress={() => {
                          triggerHaptic('tap');
                          setSelectedLocationId(loc.id);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={({ pressed }) => [
                          styles.optionRow,
                          selected && styles.optionRowSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <MapPin size={16} color={selected ? colors.primaryText : colors.textSecondary} />
                        <View style={styles.flexText}>
                          <Text variant="bodyMedium" color={selected ? 'primaryText' : 'textPrimary'} style={styles.monoText}>
                            {loc.label}
                          </Text>
                          {loc.subtitle ? (
                            <Text variant="caption" color="textSecondary">{loc.subtitle}</Text>
                          ) : null}
                        </View>
                        {selected ? <Check size={16} color={colors.primaryText} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Card>

            {/* Hazard Type */}
            <Card padding="md" gap={12}>
              <Text variant="headline">Hazard Type</Text>
              <View style={styles.typeGrid}>
                {HAZARD_TYPE_OPTIONS.map((item) => {
                  const selected = hazardType === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      disabled={submitBusy}
                      onPress={() => {
                        triggerHaptic('tap');
                        setHazardType(item.value);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [
                        styles.typeCard,
                        selected && styles.typeCardSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text variant="bodyMedium" color={selected ? 'dangerText' : 'textPrimary'} fontWeight="700">
                        {t(item.label)}
                      </Text>
                      <Text variant="caption" color="textSecondary">
                        {t(item.desc)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>

            {/* Severity & Description */}
            <Card padding="md" gap={12}>
              <Text variant="headline">Severity</Text>
              <SegmentedControl
                options={HAZARD_SEVERITY_OPTIONS}
                value={severity}
                onChange={(next) => {
                  triggerHaptic('tap');
                  setSeverity(next);
                }}
                size="sm"
                accessibilityLabel="Severity"
              />

              <TextField
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder={t('Describe physical location and hazard details...')}
                multiline
                numberOfLines={3}
                maxLength={2000}
                editable={!submitBusy}
              />

              <View style={styles.infoBanner}>
                <Text variant="label" color="textPrimary">Photo Attachment (Optional)</Text>
                <Text variant="caption" color="textSecondary">
                  Photo attachment is optional and not yet enabled on this server; submit the report now so warehouse staff are alerted immediately.
                </Text>
              </View>

              {submitError ? (
                <View style={styles.dangerBanner}>
                  <Text variant="caption" color="dangerText">{submitError}</Text>
                </View>
              ) : null}

              <Button
                title="Report Warehouse Hazard"
                icon={AlertTriangle}
                variant="danger"
                size="lg"
                loading={submitBusy}
                disabled={submitBusy || !mapQuery.data?.map.id || !selectedLocationId}
                fullWidth
                onPress={() => {
                  void handleSubmit();
                }}
              />
            </Card>

            {/* Recent Warehouse Hazards */}
            {canRead && recentHazards.length > 0 ? (
              <Card padding="md" gap={10}>
                <Text variant="headline">
                  {t('Recent Warehouse Hazards ({count})', { count: recentHazards.length })}
                </Text>
                {recentHazards.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      triggerHaptic('tap');
                      setInspectIssueId(item.id);
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.recentRow, pressed && styles.pressed]}
                  >
                    <View style={styles.flexText}>
                      <View style={styles.iconRow}>
                        <Text variant="bodyMedium" style={styles.monoText}>
                          {item.hazard?.locationCode || item.code}
                        </Text>
                        <Text variant="caption" color="textSecondary">
                          · {t(hazardTypeLabel(item.hazard?.hazardType))}
                        </Text>
                      </View>
                      <Text variant="caption" color="textSecondary" numberOfLines={2}>
                        {item.description}
                      </Text>
                    </View>
                    <StatusPill status={item.status} size="sm" dot />
                  </Pressable>
                ))}
              </Card>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    refreshBtn: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.72,
    },
    scrollContent: {
      padding: 16,
      gap: 14,
    },
    stack: {
      gap: 14,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    iconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 1,
    },
    flexText: {
      flex: 1,
      minWidth: 0,
    },
    monoText: {
      fontFamily: typography.fontMono,
      fontWeight: '700',
    },
    ticketBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.dangerBg,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    receiptBox: {
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      gap: 8,
    },
    receiptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    infoBanner: {
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      gap: 4,
    },
    warnBanner: {
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      backgroundColor: colors.warningBg,
    },
    dangerBanner: {
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerBg,
    },
    transitionSection: {
      gap: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    flexBtn: {
      flexGrow: 1,
      minWidth: 120,
    },
    optionList: {
      gap: 8,
    },
    optionRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
    },
    optionRowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },
    typeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    typeCard: {
      flexGrow: 1,
      flexBasis: '47%',
      minHeight: 68,
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      gap: 4,
      justifyContent: 'center',
    },
    typeCardSelected: {
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerBg,
    },
    recentRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  });
