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
import { BarcodeScanField, Button, Card, StatusPill, Text, TextField } from '../../shared/ui';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { triggerHaptic } from '../../shared/utils/haptics';
import { IssuePhotoSection } from '../safety/IssuePhotoSection';
import { isBlockingHandoverIssue } from './handoverData';
import { humanizeProblemCode } from './jobData';

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
  const activeIssue = issues.find(item => item.id === activeIssueId) ?? null;

  const openResolveForm = (issue: IssueReportResponse) => {
    triggerHaptic('tap');
    setActiveIssueId(issue.id);
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
        const busy = busyId === issue.id;
        const issueError = errorsById[issue.id];

        return (
          <View key={issue.id} style={[styles.issueBox, blocking && styles.issueBoxBlocking]}>
            <View style={styles.rowBetween}>
              <Text variant="label" style={styles.monoText}>
                {issue.code}
              </Text>
              <View style={styles.pillGroup}>
                {blocking ? (
                  <StatusPill status="WAITING" label="Blocks Handover" tone="danger" size="sm" />
                ) : null}
                <StatusPill status={issue.status} size="sm" dot />
              </View>
            </View>

            {issue.problemCode || issue.containerId ? (
              <Text variant="caption" color={blocking ? 'dangerText' : 'textSecondary'}>
                {issue.problemCode ? t(humanizeProblemCode(issue.problemCode)) : ''}
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

            <IssuePhotoSection
              issue={issue}
              canUpload={canCreateIssue}
              onUploaded={onIssueUpdated}
              onRefreshIssue={onIssueUpdated}
            />

            {issueError && activeIssueId !== issue.id ? (
              <Text variant="caption" color="dangerText">
                {issueError}
              </Text>
            ) : null}

            {(canResolve || canClose) ? (
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

      {activeIssue ? (
        <BottomSheet
          autoHeight
          onClose={() => {
            if (!busyId) setActiveIssueId(null);
          }}
          accessibilityLabel="Verify and resolve issue"
        >
          <View style={styles.sheetBody}>
            <View style={{ gap: 2 }}>
              <Text variant="headline">Verify & Resolve</Text>
              <Text variant="caption" color="textSecondary">
                {activeIssue.code}
                {activeIssue.containerId ? ` · ${containerLabel(activeIssue.containerId)}` : ''}
              </Text>
            </View>

            {activeIssue.problemCode ? (
              <BarcodeScanField
                label="Expected Container Barcode"
                value={scannedBarcode}
                onChangeText={setScannedBarcode}
                onSubmit={() => {}}
                onOpenScanner={() => {
                  triggerHaptic('tap');
                  setScannerIssueId(activeIssue.id);
                }}
                showVerifyButton={false}
                disabled={busyId === activeIssue.id}
              />
            ) : null}

            <TextField
              value={resolution}
              onChangeText={setResolution}
              label="Resolution Note"
              placeholder="Describe how this container issue was corrected"
              multiline
              editable={busyId !== activeIssue.id}
            />

            {errorsById[activeIssue.id] ? (
              <Text variant="caption" color="dangerText">
                {errorsById[activeIssue.id]}
              </Text>
            ) : null}

            <Button
              title="Confirm Resolution"
              variant="primary"
              size="lg"
              fullWidth
              loading={busyId === activeIssue.id}
              disabled={
                busyId === activeIssue.id ||
                !resolution.trim() ||
                (Boolean(activeIssue.problemCode) && !scannedBarcode.trim())
              }
              onPress={() => {
                void handleResolve(activeIssue);
              }}
            />
            <Button
              title="Cancel"
              variant="ghost"
              size="md"
              fullWidth
              disabled={busyId === activeIssue.id}
              onPress={() => setActiveIssueId(null)}
            />
          </View>
        </BottomSheet>
      ) : null}

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
    pillGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    monoText: {
      fontFamily: typography.fontMono,
      fontWeight: '700',
    },
    sheetBody: {
      padding: 20,
      gap: 12,
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
