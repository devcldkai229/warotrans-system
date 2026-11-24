import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check, ChevronRight, ScanLine } from 'lucide-react-native';
import type { StockVoucherDetail } from '../../shared/api/warehouseApi';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Card, Text, TextField } from '../../shared/ui';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { InboundBatchEditor } from './InboundBatchEditor';
import { InboundBatchSummary } from './InboundBatchSummary';
import { applyBatchGroupProduct, applyDraftBatchGroupEdit, batchTotal, isPendingBatchForVoucher, newBatchGroup, type InboundBatchGroup } from './inboundBatch';
import { ReceivingProductPicker } from './ReceivingProductPicker';
import { OutboundVoucherSelection } from './OutboundVoucherSelection';
import { useVoucherPreparation } from './useVoucherPreparation';
import { contentProblem, inboundContentsProgress, inboundPreparationProblem, nextIncompleteContainer, type PreparedContent } from './voucherPreparation';
import { createVoucherStyles } from './voucherStyles';

interface Props { data: StockVoucherDetail; accountId: string; writable: boolean; preparation?: ReturnType<typeof useVoucherPreparation> }
export function VoucherDraftWorkspace({ data, accountId, writable, preparation }: Props) {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  const fallbackPrep = useVoucherPreparation(preparation ? '' : accountId, preparation ? '' : data.warehouseId, data.id, data.type);
  const prep = preparation || fallbackPrep;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [productFor, setProductFor] = useState<string | null>(null);
  const [scanFor, setScanFor] = useState<string | null>(null);
  const [lookup, setLookup] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const ids = data.lines.map(line => line.containerId);
  const progress = inboundContentsProgress(ids, prep.value);
  const inbound = data.type === 'INBOUND';
  const hasPendingBatch = inbound && data.status === 'DRAFT' && !data.lines.length
    && isPendingBatchForVoucher(prep.value.pendingBatch, data.warehouseId, data.id);
  const hasServerBatchLines = inbound && data.lines.length > 0 && data.lines.every(line => line.contentsQuantity != null);
  const steps = inbound ? ['Barcodes', 'Contents', 'Review'] : ['Containers', 'Review', 'Confirm'];
  const currentStep = review ? inbound ? 2 : 1 : inbound && data.lines.length ? 1 : 0;
  useEffect(() => {
    if (prep.ready && !prep.value.requestedCount && data.lines.length && inbound) prep.update(previous => ({ ...previous, requestedCount: String(data.lines.length) }));
  }, [prep.ready, data.lines.length, inbound]);
  useEffect(() => {
    if (prep.ready && writable && inbound && !data.lines.length && !hasPendingBatch && !prep.value.groups?.length) {
      const initialCount = prep.value.requestedCount || '1';
      prep.update(previous => ({
        ...previous,
        requestedCount: previous.requestedCount || initialCount,
        groups: [newBatchGroup([], initialCount)],
      }));
    }
  }, [prep.ready, writable, inbound, data.lines.length, hasPendingBatch, prep.value.groups?.length]);
  const editGroups = (next: InboundBatchGroup[]) => {
    if (!writable || hasPendingBatch) return;
    prep.update(previous => applyDraftBatchGroupEdit(previous, next, data.warehouseId, data.id));
  };
  const editContent = (id: string, fields: Partial<PreparedContent>) => {
    if (!writable || !data.lines.some(line => line.containerId === id)) return;
    setReview(false); setReviewError(null);
    prep.update(previous => ({ ...previous, contents: { ...previous.contents, [id]: { ...(previous.contents[id] || { product: null, quantity: '' }), ...fields } } }));
  };
  const localReview = () => {
    const error = inbound ? inboundPreparationProblem(ids, prep.value) : null;
    const invalidLine = error && inbound && progress.firstIncomplete && error === contentProblem(prep.value.contents[progress.firstIncomplete]) ? data.lines.find(line => line.containerId === progress.firstIncomplete) : null;
    setReviewError(invalidLine ? `${invalidLine.containerBarcode}: ${contentProblem(prep.value.contents[invalidLine.containerId])}` : error);
    if (invalidLine) setExpanded(invalidLine.containerId);
    if (!error) { setReview(true); setExpanded(null); }
  };
  if (!prep.ready) return <Card gap={12}><Text variant="body">{prep.error || 'Loading Preparation…'}</Text>{prep.error && <Button title="Retry" variant="outline" onPress={prep.retry} />}</Card>;
  return <>
    {!hasServerBatchLines && (inbound ? !!data.lines.length : !data.lines.length) && <View style={styles.stepTrack}>{steps.map((label, index) => <React.Fragment key={label}>
      {!!index && <View style={styles.stepLine} />}
      <View style={styles.step}><View style={[styles.stepNumber, index <= currentStep && styles.stepCurrent]}>
        {index < currentStep ? <Check size={15} color={colors.primaryText} /> : <Text variant="caption" color={index === currentStep ? 'primaryText' : 'textMuted'}>{index + 1}</Text>}
      </View><Text variant="caption" color={index === currentStep ? 'textPrimary' : 'textMuted'}>{label}</Text></View>
    </React.Fragment>)}</View>}
    {prep.error && <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{prep.error}</Text><Button title="Retry Save" variant="outline" onPress={() => { void prep.persist().catch(() => {}); }} /></View>}
    {!writable && <Text variant="body" color="textSecondary">Preparation is read-only. Check access or refresh this voucher.</Text>}
    {inbound && !review && <>
      {!data.lines.length && hasPendingBatch && (
        <Card gap={12} style={styles.reviewCard}>
          <Text variant="headline">Pending Barcode Allocation</Text>
          <Text variant="caption" color="warningText">
            Editing is locked until the previous allocation result is confirmed on the server.
          </Text>
          <View style={styles.batchStatBar}>
            <View style={styles.stat}>
              <Text variant="title" style={styles.tabular}>{prep.value.pendingBatch!.body.containerCount}</Text>
              <Text variant="bodyMedium" color="textSecondary">Containers</Text>
            </View>
            <Text variant="caption" color="textSecondary" style={[styles.tabular, { fontWeight: '600' }]}>
              {t('{count} product groups', { count: prep.value.pendingBatch!.body.groups.length })}
            </Text>
          </View>
          {!!prep.value.groups?.length && <InboundBatchSummary groups={prep.value.groups} />}
        </Card>
      )}
      {!data.lines.length && !hasPendingBatch && (
        <InboundBatchEditor
          requestedCount={prep.value.requestedCount}
          groups={prep.value.groups?.length ? prep.value.groups : [newBatchGroup([], prep.value.requestedCount || '1')]}
          editable={writable}
          onChange={editGroups}
        />
      )}
      {hasServerBatchLines && !!prep.value.groups?.length && <Card gap={12} style={styles.reviewCard}>
        <View style={styles.between}><Text variant="headline">Inbound Batch</Text></View>
        <View style={styles.batchStatBar}>
          <View style={styles.stat}><Text variant="title" style={styles.tabular}>{data.containerCount}</Text><Text variant="bodyMedium" color="textSecondary">Containers</Text></View>
          <Text variant="caption" color="textSecondary" style={[styles.tabular, { fontWeight: '600' }]}>{t('{count} product groups', { count: prep.value.groups.length })}</Text>
        </View>
        <InboundBatchSummary groups={prep.value.groups} />
      </Card>}
      {!!data.lines.length && !hasServerBatchLines && <Card gap={8}>
        <View style={styles.between}><Text variant="headline" style={{ flex: 1 }}>Container Contents</Text><Text variant="caption" color="textSecondary">{progress.complete}/{progress.total} complete</Text></View>
        <Text variant="caption" color="textSecondary">Product and quantity edits below are saved on this device only.</Text>
        {data.lines.map((line, index) => {
          const value = prep.value.contents[line.containerId];
          const problem = contentProblem(value);
          return <View key={line.id} style={styles.containerRow}>
            <Pressable style={[styles.row, { minHeight: 44 }]} accessibilityRole="button" accessibilityState={{ expanded: expanded === line.containerId }} accessibilityLabel={`Edit container ${index + 1}, ${line.containerBarcode}`} onPress={() => { setExpanded(expanded === line.containerId ? null : line.containerId); setReviewError(null); }}>
              <View style={styles.flex}><Text variant="caption" color="textMuted">Container {index + 1} Of {data.lines.length}</Text><Text variant="code" selectable>{line.containerBarcode}</Text><Text variant="bodyMedium">{value?.product?.name || line.productName}</Text><Text variant="caption" color="textSecondary">{!problem ? t('Qty {quantity}', { quantity: value!.quantity }) : 'Contents incomplete'}</Text></View>
              {!problem ? <Check size={20} color={colors.primaryText} /> : <ChevronRight size={20} color={colors.textMuted} />}
            </Pressable>
            {expanded === line.containerId && <View style={styles.formSection}>
              <Text variant="caption" color="textSecondary">Server product: {line.productName} · {line.productSku}</Text>
              <View style={styles.row}>
                <Button title={value?.product ? `${value.product.sku} · Change Product` : 'Choose Product'} variant="outline" style={{ flex: 1 }} disabled={!writable} onPress={() => { setLookup(null); setProductFor(line.containerId); }} />
                <Pressable style={styles.iconButton} disabled={!writable} accessibilityRole="button" accessibilityLabel="Scan product or supplier barcode" accessibilityState={{ disabled: !writable }} onPress={() => setScanFor(line.containerId)}><ScanLine size={22} color={colors.primaryText} /></Pressable>
              </View>
              <View style={[styles.row, { alignItems: 'flex-start' }]}>
                <TextField label="Contents Quantity" containerStyle={{ flex: 1 }} value={value?.quantity || ''} onChangeText={quantity => editContent(line.containerId, { quantity })} keyboardType="decimal-pad" maxLength={16} editable={writable} placeholder="e.g. 24" />
              </View>
              {problem && <Text variant="caption" color={reviewError?.startsWith(`${line.containerBarcode}:`) ? 'dangerText' : 'textSecondary'} accessibilityRole={reviewError?.startsWith(`${line.containerBarcode}:`) ? 'alert' : undefined}>{problem}</Text>}
              <View style={styles.formSection}>
                {nextIncompleteContainer(ids, line.containerId, prep.value) && <Button title="Next Incomplete Container" variant="outline" disabled={!writable} onPress={() => {
                  const problem = contentProblem(prep.value.contents[line.containerId]);
                  if (problem) { setReviewError(`${line.containerBarcode}: ${problem}`); return; }
                  setReviewError(null); setExpanded(nextIncompleteContainer(ids, line.containerId, prep.value));
                }} />}
                <Button title="Done Editing" variant="ghost" onPress={() => setExpanded(null)} />
              </View>
            </View>}
          </View>;
        })}
        <Button title="Review Preparation" variant="outline" disabled={!writable} onPress={localReview} />
      </Card>}
    </>}
    {!inbound && !data.lines.length && !review && writable && <OutboundVoucherSelection accountId={accountId} warehouseId={data.warehouseId} value={prep.value} update={prep.update} onReview={localReview} showReviewAction={false} />}
    {reviewError && <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{reviewError}</Text></View>}
    {review && <Card gap={14}>
      <View style={styles.between}><Text variant="headline">Review Preparation</Text><Button title="Edit" variant="ghost" size="sm" onPress={() => setReview(false)} /></View>
      <Text variant="bodyMedium">{inbound ? data.lines.length : Object.keys(prep.value.selected).length} containers · {data.warehouseName}</Text>
      {inbound ? data.lines.map(line => { const content = prep.value.contents[line.containerId]; return <View key={line.id} style={styles.containerRow}><Text variant="code" selectable>{line.containerBarcode}</Text><Text variant="bodyMedium">{content?.product?.name || line.productName}</Text><Text variant="body">{content?.quantity}</Text></View>; })
        : Object.values(prep.value.selected).map(item => <View key={item.id} style={styles.containerRow}><Text variant="code" selectable>{item.barcode}</Text><Text variant="bodyMedium">{item.productName}</Text></View>)}
      <Text variant="body" color="textSecondary">{inbound ? 'When supported, confirmation will add these containers to stock at Inbound.' : 'When supported, confirmation will deduct these containers after the server verifies all are at Outbound.'}</Text>
      <Button title={inbound ? 'Confirm Inbound Voucher' : 'Confirm Outbound Voucher'} disabled onPress={() => {}} />
      <Text variant="caption" color="textSecondary">Saving contents, saving selection and posting stock are awaiting server support. This preparation has not changed the server voucher or stock.</Text>
    </Card>}
    {!!productFor && writable && data.lines.some(line => line.containerId === productFor) && <ReceivingProductPicker selectedProduct={prep.value.contents[productFor]?.product || null} initialBarcode={lookup} onClose={() => setProductFor(null)} onSelect={product => { editContent(productFor, { product }); setProductFor(null); }} />}
    {!!scanFor && writable && <BarcodeScannerHUD visible title="Scan Product Barcode" manualLabel="Product Or Supplier Barcode" onClose={() => setScanFor(null)} onScanResult={barcode => { editContent(scanFor, { product: null }); setLookup(barcode); setProductFor(scanFor); setScanFor(null); }} />}
  </>;
}
