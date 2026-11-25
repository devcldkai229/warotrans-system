import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ArrowUpRight, Box, CheckCircle2, ClipboardCheck, FileText, MapPin, PackageCheck, ScanLine, Truck, XCircle } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Scanner } from '../../shared/scan/Scanner';
import { resolveScan, type ContainerTask, type ScanTarget } from '../../shared/scan/scanRouter';
import { createScanApi } from '../../shared/scan/scanApi';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Button, Text } from '../../shared/ui';
import type { ThemeColors } from '../../shared/theme/colors';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { radii } from '../../shared/theme/radii';
import { confirmInspection, type ContainerListItem } from '../../shared/api';
import { getUserErrorMessage } from '../../shared/api/client';
import { usePlaceDirectory } from '../../shared/places/usePlaceDirectory';
import { toast } from '../../shared/context/ToastContext';
import { t } from '../../shared/i18n';
import { triggerHaptic } from '../../shared/utils/haptics';
import { problemsFor } from '../../shared/containerProblems';
import { ProblemCodeChips } from '../../shared/components/ProblemCodeChips';

const api = createScanApi();

/**
 * One scanner for everything: it recognises the code (container, voucher, request, job, shelf, product) and opens what
 * belongs to it. A container opens its card with what can be done with it now.
 */
export function ScanScreen() {
  const { styles } = useThemedStyles(createStyles);
  const { goBack, navigate, replace } = useNavigation();
  const [round, setRound] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [target, setTarget] = useState<Extract<ScanTarget, { type: 'container' }> | null>(null);
  const [inspect, setInspect] = useState<ContainerTask | null>(null);

  const onScan = async (_raw: string, scanned: Parameters<typeof resolveScan>[0]) => {
    setResolving(true);
    const result = await resolveScan(scanned, api);
    setResolving(false);
    if (result.type === 'route') { replace(result.screen as never, result.params); return; }
    if (result.type === 'container') { setTarget(result); return; }
    triggerHaptic('error');
    toast.error(result.message);
    setRound(value => value + 1); // a fresh scanner for the next try
  };

  return <View style={styles.screen}>
    {!target ? <Scanner key={round} visible title="Scan QR Code" manualLabel="Code" placeholder="Or type a code"
      onClose={goBack} onScanResult={(raw, scanned) => { void onScan(raw, scanned); }} /> : null}
    {resolving ? <View style={styles.resolving}><ActivityIndicator color="#fff" /><Text color="#ffffff">Looking up…</Text></View> : null}
    {target ? <ContainerCard container={target.container} tasks={target.tasks}
      onClose={goBack} onScanAgain={() => { setTarget(null); setRound(value => value + 1); }}
      onInspect={setInspect}
      onOpenJob={task => navigate('job_detail', { jobId: task.jobId, modal: 'verify' })}
      onMove={() => navigate('transport_create', { workflow: 'INTERNAL_RELOCATION', containers: [target.container.barcode] })}
      onOpenVoucher={() => target.container.voucher && navigate('stock_voucher_detail', { voucherId: target.container.voucher.id })} /> : null}
    {inspect && target ? <InspectionSheet task={inspect} container={target.container} onClose={() => setInspect(null)}
      onDone={() => { setInspect(null); setTarget(null); setRound(value => value + 1); }} /> : null}
  </View>;
}

function ContainerCard({ container, tasks, onClose, onScanAgain, onInspect, onOpenJob, onMove, onOpenVoucher }: {
  container: ContainerListItem; tasks: ContainerTask[]; onClose: () => void; onScanAgain: () => void;
  onInspect: (task: ContainerTask) => void; onOpenJob: (task: ContainerTask) => void; onMove: () => void; onOpenVoucher: () => void;
}) {
  const { styles, colors } = useThemedStyles(createStyles);
  const places = usePlaceDirectory();
  const shelf = container.currentStorageLocationCode ? places.locations.find(location => location.code === container.currentStorageLocationCode)?.name ?? container.currentStorageLocationCode : null;
  const where = shelf ? `${shelf}${container.currentLevelNo ? ` · ${t('Level {level}', { level: container.currentLevelNo })}` : ''}`
    : container.currentEndpointId ? places.name(container.currentEndpointId) : t('Not on a shelf');
  const movable = container.status === 'STORED' && !!container.currentStorageLocationId && !container.inActiveTransport;
  return <BottomSheet onClose={onClose} accessibilityLabel="Scanned container">
    <ScrollView contentContainerStyle={styles.sheet}>
      <View style={styles.head}>
        <View style={styles.headIcon}><Box size={22} color={colors.primaryText} /></View>
        <View style={{ flex: 1 }}>
          <Text variant="title" style={{ fontFamily: 'monospace' }} numberOfLines={1}>{container.barcode}</Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>{container.productName} · {container.productSku}</Text>
        </View>
        <View style={styles.statusPill}><Text variant="caption" fontWeight="700">{container.status}</Text></View>
      </View>
      <View style={styles.infoRow}><MapPin size={16} color={colors.textSecondary} /><Text variant="bodyMedium" style={{ flex: 1 }}>{where}</Text></View>
      {container.voucher ? <View style={styles.infoRow}><FileText size={16} color={colors.textSecondary} /><Text variant="bodyMedium" style={{ flex: 1 }}>{container.voucher.code}</Text></View> : null}

      {tasks.map(task => task.operation === 'INSPECTION_CONFIRM'
        ? <Button key={task.stepId} title={t('Inspect ({job})', { job: task.jobNo })} icon={ClipboardCheck} fullWidth onPress={() => onInspect(task)} />
        : <Button key={task.stepId} title={task.operation === 'PICKUP_CONFIRM' ? t('Confirm loading ({job})', { job: task.jobNo }) : t('Confirm unloading ({job})', { job: task.jobNo })}
            icon={task.operation === 'PICKUP_CONFIRM' ? Truck : PackageCheck} fullWidth onPress={() => onOpenJob(task)} />)}
      {movable ? <Button title="Move To Another Shelf" icon={ArrowUpRight} variant="outline" fullWidth onPress={onMove} /> : null}
      {container.voucher ? <Button title="Open Voucher" icon={FileText} variant="outline" fullWidth onPress={onOpenVoucher} /> : null}
      {!tasks.length ? <Text variant="caption" color="textSecondary">No job is waiting for this container right now.</Text> : null}
      <Button title="Scan Another Code" icon={ScanLine} variant="ghost" fullWidth onPress={onScanAgain} />
    </ScrollView>
  </BottomSheet>;
}

/** Quality inspection: the result goes to the job's INSPECTION_CONFIRM step; a failure needs a reason. */
export function InspectionSheet({ task, container, onClose, onDone }: { task: Pick<ContainerTask, 'stepId' | 'jobNo'>; container: Pick<ContainerListItem, 'id' | 'barcode'>; onClose: () => void; onDone: () => void }) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [result, setResult] = useState<'PASSED' | 'FAILED' | null>(null);
  const [note, setNote] = useState('');
  const [defects, setDefects] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!result || pending) return;
    if (result === 'FAILED' && !defects.length) { setError(t('Choose what is wrong with the container.')); return; }
    if (result === 'FAILED' && !note.trim()) { setError(t('Say what is wrong with the container.')); return; }
    setPending(true); setError(null);
    try {
      const scanned = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(container.barcode) ? null : container.barcode;
      await confirmInspection(task.stepId, result, note, scanned, container.id, defects);
      triggerHaptic('success');
      toast.success(result === 'PASSED' ? t('{code} passed inspection.', { code: container.barcode }) : t('{code} failed inspection.', { code: container.barcode }));
      onDone();
    } catch (failure) { setError(getUserErrorMessage(failure, 'The inspection could not be saved.')); }
    finally { setPending(false); }
  };
  return <BottomSheet onClose={onClose} accessibilityLabel="Inspection">
    <View style={styles.sheet}>
      <Text variant="title">Inspection</Text>
      <Text variant="caption" color="textSecondary">{container.barcode} · {task.jobNo}</Text>
      <View style={styles.choiceRow}>
        <Pressable style={[styles.choice, result === 'PASSED' && styles.choicePass]} onPress={() => setResult('PASSED')} accessibilityRole="radio" accessibilityState={{ checked: result === 'PASSED' }}>
          <CheckCircle2 size={26} color={result === 'PASSED' ? '#ffffff' : colors.success} />
          <Text variant="bodyMedium" fontWeight="700" color={result === 'PASSED' ? '#ffffff' : colors.textPrimary}>Passed</Text>
        </Pressable>
        <Pressable style={[styles.choice, result === 'FAILED' && styles.choiceFail]} onPress={() => setResult('FAILED')} accessibilityRole="radio" accessibilityState={{ checked: result === 'FAILED' }}>
          <XCircle size={26} color={result === 'FAILED' ? '#ffffff' : colors.danger} />
          <Text variant="bodyMedium" fontWeight="700" color={result === 'FAILED' ? '#ffffff' : colors.textPrimary}>Failed</Text>
        </Pressable>
      </View>
      <Text variant="caption" color="textSecondary">Fail each bad container first. Passed closes the inspection for every container still on the robot.</Text>
      {result === 'FAILED' ? <>
        <Text variant="bodyMedium" fontWeight="700">What is wrong? (one or more)</Text>
        <ProblemCodeChips problems={problemsFor('INSPECTION')} selected={defects} onChange={setDefects} multiple disabled={pending} />
        <Text variant="caption" color="textSecondary">The container leaves the job and is held at the inspection point.</Text>
      </> : null}
      <TextInput style={styles.note} value={note} onChangeText={setNote} multiline placeholder={t(result === 'FAILED' ? 'What is wrong (required)' : 'Note (optional)')}
        placeholderTextColor={colors.textMuted} accessibilityLabel="Inspection note" />
      {error ? <Text variant="caption" color="dangerText" accessibilityRole="alert">{error}</Text> : null}
      <Button title="Save Inspection" fullWidth loading={pending} disabled={!result || pending} onPress={() => { void submit(); }} />
    </View>
  </BottomSheet>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0d12' },
  resolving: { position: 'absolute', alignSelf: 'center', top: '45%', flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, backgroundColor: 'rgba(15,23,42,0.85)', zIndex: 20 },
  sheet: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  choiceRow: { flexDirection: 'row', gap: 10 },
  choice: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 18, borderRadius: radii.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  choicePass: { backgroundColor: colors.success, borderColor: colors.success },
  choiceFail: { backgroundColor: colors.danger, borderColor: colors.danger },
  note: { minHeight: 80, padding: 12, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, textAlignVertical: 'top', backgroundColor: colors.surface },
});
