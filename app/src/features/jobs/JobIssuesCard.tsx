import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { getUserErrorMessage, resolveOwnHandoverIssue, transitionIssue } from '../../shared/api';
import { t } from '../../shared/i18n';
import { Scanner } from '../../shared/scan/Scanner';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import type { IssueReportResponse } from '../../shared/types/contracts';
import { Button, Card, StatusPill, Text, TextField } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { isBlockingHandoverIssue } from './handoverData';

interface JobIssuesCardProps {
  issues: IssueReportResponse[];
  containerLabel: (containerId: string) => string;
  canCreateIssue: boolean;
  canManageIssues: boolean;
  onIssueUpdated: () => Promise<unknown>;
}

export function JobIssuesCard({
  issues,
  containerLabel,
  canCreateIssue,
  canManageIssues,
  onIssueUpdated,
}: JobIssuesCardProps) {
  const styles = useThemedStyles(createStyles);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [resolution, setResolution] = useState('');
  const [scannerIssueId, setScannerIssueId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorsById, setErrorsById] = useState<Record<string, string | null>>({});

  if (!issues.length) return null;

  const openResolveForm = (issue: IssueReportResponse) => {
    triggerHaptic('tap');
    setActiveIssueId(prev => (prev === issue.id ? null : issue.id));
    setScannedBarcode('');
    setResolution('');
    setErrorsById(prev => ({ ...prev, [issue.id]: null }));
  };

  const handleResolve = async (issue: IssueReportResponse) => {
    if (busyId) return;
    setBusyId(issue.id);
    setErrorsById(prev => ({ ...prev, [issue.id]: null }));
    try {
      if (canManageIssues) {
        await transitionIssue(issue.id, {
          status: 'RESOLVED',
          expectedVersion: issue.version,
          resolution,
          scannedBarcode: issue.problemCode ? scannedBarcode : null,
        });
      } else {
        await resolveOwnHandoverIssue(issue.id, {
          expectedVersion: issue.version,
          scannedBarcode,
          resolution,
        });
      }
      triggerHaptic('success');
      setActiveIssueId(null);
      setScannedBarcode('');
      setResolution('');
      await onIssueUpdated();
    } catch (failure) {
      setErrorsById(prev => ({
        ...prev,
        [issue.id]: getUserErrorMessage(failure, 'Could not resolve the issue. Refresh and try again.'),
      }));
      void onIssueUpdated();
    } finally {
      setBusyId(null);
    }
  };

  const handleCloseIssue = async (issue: IssueReportResponse) => {
    if (busyId || !canManageIssues) return;
    triggerHaptic('tap');
    setBusyId(issue.id);
    setErrorsById(prev => ({ ...prev, [issue.id]: null }));
    try {
      await transitionIssue(issue.id, {
        status: 'CLOSED',
        expectedVersion: issue.version,
      });
      triggerHaptic('success');
      await onIssueUpdated();
    } catch (failure) {
      setErrorsById(prev => ({
        ...prev,
        [issue.id]: getUserErrorMessage(failure, 'Could not close the issue. Refresh and try again.'),
      }));
      void onIssueUpdated();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card padding="md" gap={12}>
      <Text variant="headline">
        {t('Reported Issues ({count})', { count: issues.length })}
      </Text>

      {issues.map((issue) => {
        const blocking = isBlockingHandoverIssue(issue);
        const canResolve =
          issue.allowedTransitions.includes('RESOLVED') &&
          (canManageIssues || (canCreateIssue && Boolean(issue.problemCode)));
        const canClose = canManageIssues && issue.allowedTransitions.includes('CLOSED');
        const isFormOpen = activeIssueId === issue.id;
        const busy = busyId === issue.id;
        const issueError = errorsById[issue.id];

        return (
          <View key={issue.id} style={[styles.issueBox, blocking && styles.issueBoxBlocking]}>
            <View style={styles.rowBetween}>
              <Text variant="label" style={styles.monoText}>
                {issue.code}
              </Text>
              <StatusPill status={issue.status} size="sm" dot />
            </View>

            {issue.problemCode || issue.containerId ? (
              <Text variant="caption" color={blocking ? 'dangerText' : 'textSecondary'}>
                {issue.problemCode ? `${issue.problemCode}${blocking ? ` · ${t('Blocks Handover')}` : ''}` : ''}
                {issue.problemCode && issue.containerId ? ' · ' : ''}
                {issue.containerId ? containerLabel(issue.containerId) : ''}
              </Text>
            ) : null}

            <Text variant="body" color="textPrimary">
              {issue.description}
            </Text>

            {issue.resolution ? (
              <Text variant="caption" color="successText">
                {t('Resolution: {text}', { text: issue.resolution })}
              </Text>
            ) : null}

            {issueError ? (
              <Text variant="caption" color="dangerText">
                {issueError}
              </Text>
            ) : null}

            {isFormOpen ? (
              <View style={styles.resolveForm}>
                {issue.problemCode ? (
                  <View style={styles.scanRow}>
                    <View style={styles.flex}>
                      <TextField
                        value={scannedBarcode}
                        onChangeText={setScannedBarcode}
                        label="Expected Container Barcode"
                        placeholder={t('Scan or type container barcode')}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        editable={!busy}
                      />
                    </View>
                    <Button
                      title="Scan"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onPress={() => {
                        triggerHaptic('tap');
                        setScannerIssueId(issue.id);
                      }}
                    />
                  </View>
                ) : null}

                <TextField
                  value={resolution}
                  onChangeText={setResolution}
                  label="Resolution Note"
                  placeholder={t('Describe how this container issue was corrected')}
                  multiline
                  editable={!busy}
                />

                <View style={styles.actionsRow}>
                  <Button
                    title="Confirm Resolution"
                    variant="primary"
                    size="sm"
                    loading={busy}
                    disabled={busy || !resolution.trim() || (Boolean(issue.problemCode) && !scannedBarcode.trim())}
                    onPress={() => {
                      void handleResolve(issue);
                    }}
                    style={styles.flexBtn}
                  />
                  <Button
                    title="Cancel"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onPress={() => setActiveIssueId(null)}
                  />
                </View>
              </View>
            ) : (canResolve || canClose) ? (
              <View style={styles.actionsRow}>
                {canResolve ? (
                  <Button
                    title="Verify & Resolve"
                    variant="outline"
                    size="sm"
                    disabled={!!busyId}
                    onPress={() => openResolveForm(issue)}
                    style={styles.flexBtn}
                  />
                ) : null}
                {canClose ? (
                  <Button
                    title="Close Issue"
                    variant="secondary"
                    size="sm"
                    loading={busy}
                    disabled={!!busyId}
                    onPress={() => {
                      void handleCloseIssue(issue);
                    }}
                    style={styles.flexBtn}
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      <Scanner
        visible={Boolean(scannerIssueId)}
        onClose={() => setScannerIssueId(null)}
        expect={['CONTAINER']}
        title="Verify Expected Container"
        manualLabel="Container Barcode"
        onScanResult={(barcode) => {
          setScannedBarcode(barcode.trim());
          setScannerIssueId(null);
        }}
      />
    </Card>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    issueBox: {
      gap: 6,
      padding: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
    },
    issueBoxBlocking: {
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerBg,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    monoText: {
      fontFamily: typography.fontMono,
      fontWeight: '700',
    },
    resolveForm: {
      gap: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    scanRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    flex: {
      flex: 1,
      minWidth: 0,
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    flexBtn: {
      flexGrow: 1,
      minWidth: 120,
    },
  });
