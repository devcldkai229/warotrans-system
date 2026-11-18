import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { t, translateText } from '../../shared/i18n';
import { classifyCode, createScanGuard, SCAN_KIND_LABEL, type ScanKind, type ScannedCode } from '../../shared/scan/scanCodes';
import { RawText as Text } from '../../shared/ui/Text';
import {
  Keyboard,
  QrCode,
  ScanLine,
  X,
  Zap,
} from 'lucide-react-native';
import { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import { useTopInset } from '../../shared/theme/layout';
import { triggerHaptic } from '../../shared/utils/haptics';

/** What the screen says back about one scan in continuous mode (shown in the scanned list). */
export interface ScanFeedback { ok: boolean; message: string }

interface BarcodeScannerHUDProps {
  visible: boolean;
  onClose: () => void;
  /** The code as scanned or typed. In continuous mode it may answer with feedback for the scanned list. */
  onScanResult: (barcode: string, scanned: ScannedCode) => void | ScanFeedback | Promise<ScanFeedback | void>;
  /** Only these kinds are accepted; another kind is told what it is and the scanner keeps going. */
  expect?: ScanKind[];
  /** Keep scanning after each code (batch checks, label claims), with the list of what was scanned. */
  continuous?: boolean;
  targetBarcode?: string;
  title?: string;
  manualLabel?: string;
  placeholder?: string;
}

export function BarcodeScannerHUD({
  visible,
  onClose,
  onScanResult,
  targetBarcode = '',
  title = 'Scan container barcode',
  manualLabel = 'Container barcode',
  placeholder = 'Enter Or Scan Container Barcode',
  expect,
  continuous = false,
}: BarcodeScannerHUDProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const topInset = useTopInset();
  const [torchOn, setTorchOn] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scanned = useRef(false);
  const busy = useRef(false);
  const guard = useRef(createScanGuard());
  const [notice, setNotice] = useState<ScanFeedback | null>(null);
  const [history, setHistory] = useState<{ code: string; ok: boolean; message: string }[]>([]);
  const manualInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    scanned.current = false; busy.current = false; guard.current = createScanGuard();
    setManualBarcode(''); setCameraError(null); setNotice(null); setHistory([]);
    // Start the camera straight away when access was given before; otherwise the button asks.
    setCameraActive(visible && !!permission?.granted);
  }, [visible]);
  const submitBarcode = async (value: string) => {
    const barcode = value.trim();
    if (!barcode || scanned.current || busy.current || !guard.current(barcode)) return;
    const code = classifyCode(barcode);
    if (!code) return;
    if (expect?.length && !expect.includes(code.kind)) {
      triggerHaptic('error');
      setNotice({ ok: false, message: t('This is a {kind} code. Scan a {expected}.', { kind: t(SCAN_KIND_LABEL[code.kind]).toLowerCase(), expected: expect.map(kind => t(SCAN_KIND_LABEL[kind]).toLowerCase()).join(' / ') }) });
      return;
    }
    if (!continuous) {
      scanned.current = true;
      triggerHaptic('success');
      // The recognised code, not the raw payload: a label QR (WT:C:C181126001) answers C181126001.
      await onScanResult(code.code, code);
      return;
    }
    busy.current = true;
    try {
      const feedback = await onScanResult(code.code, code);
      const entry = { code: code.code, ok: feedback ? feedback.ok : true, message: feedback?.message ?? translateText('Scanned') };
      triggerHaptic(entry.ok ? 'success' : 'error');
      setNotice(entry);
      setHistory(previous => [entry, ...previous].slice(0, 30));
      setManualBarcode('');
    } finally { busy.current = false; }
  };
  const enableCamera = async () => {
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (result.granted) { setCameraActive(true); setCameraError(null); }
      else setCameraError('Camera access denied. Enter the barcode below.');
    } catch { setCameraError('Camera unavailable. Enter the barcode below.'); }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.overlay, { paddingTop: topInset + 12 }]}>
          {/* Header Bar */}
          <View style={styles.header}>
            <View>
              <View style={styles.hudBadge}>
                <Text style={styles.hudBadgeText}>Camera HUD</Text>
              </View>
              <Text style={styles.hudTitle}>{title}</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  setTorchOn(!torchOn);
                }}
                style={[styles.headerIconBtn, torchOn && styles.headerIconBtnActive]}
                accessibilityRole="button"
                accessibilityLabel="Toggle torch light"
              >
                <Zap size={18} color={torchOn ? colors.warning : '#ffffff'} />
              </Pressable>
              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  onClose();
                }}
                style={styles.headerIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Close scanner"
              >
                <X size={20} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          {/* Viewfinder Center Reticle */}
          <View style={styles.reticleContainer}>
            <View style={styles.reticleBox}>
              {cameraActive && permission?.granted && <CameraView style={StyleSheet.absoluteFill}
                facing="back" enableTorch={torchOn} barcodeScannerSettings={{ barcodeTypes: ['code128', 'qr', 'ean13', 'ean8', 'code39', 'upc_a', 'upc_e'] }}
                onMountError={error => { setCameraError(error.message); setCameraActive(false); }}
                onBarcodeScanned={result => { void submitBarcode(result.data); }} />}

              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />

              {/* Glowing Scan Laser Line */}
              <View style={styles.laserLine} />

              <View style={styles.reticleCenterIcon}>
                <ScanLine size={48} color="#ffffff" />
              </View>
            </View>

            <Text style={styles.reticleInstruction}>
              Align 1D Code 128 or 2D QR code within frame
            </Text>
            {notice ? <View style={[styles.noticeBox, notice.ok ? styles.noticeOk : styles.noticeBad]} accessibilityLiveRegion="polite">
              <Text style={styles.noticeText} numberOfLines={2}>{notice.message}</Text>
            </View> : null}
            <View style={styles.fpsBadge}>
              <Text style={styles.fpsText}>{cameraError || (cameraActive ? 'Camera Ready' : 'Camera Off · Manual Entry Available')}</Text>
            </View>
          </View>

          {/* Manual entry remains available when the camera is unavailable. */}
          <View style={styles.actionsBox}>
            {continuous && history.length ? <View style={styles.historyBox}>
              <Text style={styles.historyTitle}>{t('Scanned {count}', { count: history.length })}</Text>
              {history.slice(0, 4).map((item, index) => <View key={`${item.code}-${index}`} style={styles.historyRow}>
                <View style={[styles.historyDot, { backgroundColor: item.ok ? '#22c55e' : '#ef4444' }]} />
                <Text style={styles.historyCode}>{item.code}</Text>
                <Text style={styles.historyMessage} numberOfLines={1}>{item.message}</Text>
              </View>)}
            </View> : null}
            <TextInput ref={manualInput} value={manualBarcode} onChangeText={setManualBarcode}
              placeholder={translateText(placeholder)} placeholderTextColor="#c4c8d0"
              autoCapitalize="none" autoCorrect={false} accessibilityLabel={translateText(manualLabel)}
              onSubmitEditing={() => { void submitBarcode(manualBarcode); }}
              style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#c4c8d0', paddingHorizontal: 12, color: '#ffffff', fontSize: 14 }} />

            <Pressable
              onPress={() => {
                void submitBarcode(manualBarcode);
              }}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.btnMatch,
                pressed && styles.btnPressed,
              ]}
              accessibilityRole="button"
            >
              <QrCode size={18} color="#ffffff" />
              <Text style={styles.btnMatchText}>
                Use Entered Barcode
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                triggerHaptic('error');
                void enableCamera();
              }}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.btnMismatch,
                pressed && styles.btnPressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.btnMismatchText}>
                Enable Camera
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                setCameraActive(false); manualInput.current?.focus();
              }}
              style={({ pressed }) => [
                styles.cancelBtn,
                pressed && styles.cancelBtnPressed,
              ]}
              accessibilityRole="button"
            >
              <Keyboard size={16} color="#cbd5e1" />
              <Text style={styles.cancelText}>Manual keyboard entry</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  noticeBox: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, maxWidth: 320 },
  noticeOk: { backgroundColor: 'rgba(34, 197, 94, 0.9)' },
  noticeBad: { backgroundColor: 'rgba(239, 68, 68, 0.92)' },
  noticeText: { color: '#ffffff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  historyBox: { gap: 6, padding: 10, borderRadius: 12, backgroundColor: 'rgba(15, 23, 42, 0.72)' },
  historyTitle: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyCode: { color: '#ffffff', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  historyMessage: { flex: 1, color: '#cbd5e1', fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#0f172a',
    justifyContent: 'space-between',
    padding: 18,
    paddingTop: 0,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  hudBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  hudBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#cbd5e1',
    fontFamily: typography.fontMono,
  },
  hudTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 4,
    fontFamily: typography.fontSans,
  },
  reticleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleBox: {
    width: 250,
    height: 250,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...shadows.float,
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: '#ffffff',
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  laserLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: '50%',
    height: 2,
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8,
  },
  reticleCenterIcon: {
    opacity: 0.25,
  },
  reticleInstruction: {
    fontSize: 13,
    color: '#cbd5e1',
    textAlign: 'center',
    marginTop: 18,
    fontFamily: typography.fontSans,
  },
  fpsBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 8,
  },
  fpsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4ade80',
    fontFamily: typography.fontMono,
  },
  actionsBox: {
    gap: 10,
    zIndex: 20,
    paddingBottom: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: radii.md,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnMatch: {
    backgroundColor: colors.darkAction,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    ...shadows.control,
  },
  btnMatchText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: typography.fontSans,
  },
  btnMismatch: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  btnMismatchText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fca5a5',
    fontFamily: typography.fontSans,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  cancelBtnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
    fontFamily: typography.fontSans,
  },
});
