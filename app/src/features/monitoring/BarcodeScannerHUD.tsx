import { CameraView, scanFromURLAsync, useCameraPermissions, type BarcodeType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ArrowRight, ImageIcon, Zap, X } from 'lucide-react-native';
import { t, translateText } from '../../shared/i18n';
import { classifyCode, createScanGuard, SCAN_KIND_LABEL, type ScanKind, type ScannedCode } from '../../shared/scan/scanCodes';
import { RawText as Text } from '../../shared/ui/Text';
import { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
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

const BARCODE_TYPES: BarcodeType[] = ['qr', 'code128', 'ean13', 'ean8', 'code39', 'upc_a', 'upc_e'];

export function BarcodeScannerHUD({
  visible,
  onClose,
  onScanResult,
  title = 'Scan QR Code',
  manualLabel = 'Code',
  placeholder = 'Or type a code',
  expect,
  continuous = false,
}: BarcodeScannerHUDProps) {
  const { styles } = useThemedStyles(createStyles);
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
  const [readingImage, setReadingImage] = useState(false);

  useEffect(() => {
    if (!visible) return;
    scanned.current = false;
    busy.current = false;
    guard.current = createScanGuard();
    setManualBarcode('');
    setCameraError(null);
    setNotice(null);
    setHistory([]);
    setTorchOn(false);

    let cancelled = false;
    (async () => {
      try {
        const result = permission?.granted ? permission : await requestPermission();
        if (cancelled) return;
        if (result.granted) {
          setCameraActive(true);
          setCameraError(null);
        } else {
          setCameraActive(false);
          setCameraError('Camera access denied. Enter the code below.');
        }
      } catch {
        if (cancelled) return;
        setCameraActive(false);
        setCameraError('Camera unavailable. Enter the code below.');
      }
    })();

    return () => {
      cancelled = true;
      setCameraActive(false);
    };
  }, [visible]);

  const submitBarcode = async (value: string) => {
    const barcode = value.trim();
    if (!barcode || scanned.current || busy.current || !guard.current(barcode)) return;
    const code = classifyCode(barcode);
    if (!code) return;
    if (expect?.length && !expect.includes(code.kind)) {
      triggerHaptic('error');
      setNotice({
        ok: false,
        message: t('This is a {kind} code. Scan a {expected}.', {
          kind: t(SCAN_KIND_LABEL[code.kind]).toLowerCase(),
          expected: expect.map((kind) => t(SCAN_KIND_LABEL[kind]).toLowerCase()).join(' / '),
        }),
      });
      return;
    }
    if (!continuous) {
      scanned.current = true;
      triggerHaptic('success');
      await onScanResult(code.code, code);
      return;
    }
    busy.current = true;
    try {
      const feedback = await onScanResult(code.code, code);
      const entry = {
        code: code.code,
        ok: feedback ? feedback.ok : true,
        message: feedback?.message ?? translateText('Scanned'),
      };
      triggerHaptic(entry.ok ? 'success' : 'error');
      setNotice(entry);
      setHistory((previous) => [entry, ...previous].slice(0, 30));
      setManualBarcode('');
    } finally {
      busy.current = false;
    }
  };

  // Backup for a camera that cannot focus or is denied: read the code from a photo or screenshot.
  const scanFromImage = async () => {
    if (readingImage) return;
    triggerHaptic('tap');
    setReadingImage(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const uri = picked.canceled ? null : picked.assets?.[0]?.uri;
      if (!uri) return;
      const found = await scanFromURLAsync(uri, BARCODE_TYPES);
      const data = found.find((item) => item.data?.trim())?.data;
      if (!data) {
        triggerHaptic('error');
        setNotice({ ok: false, message: translateText('No code found in this image. Try a sharper photo or type the code.') });
        return;
      }
      guard.current = createScanGuard();
      await submitBarcode(data);
    } catch {
      triggerHaptic('error');
      setNotice({ ok: false, message: translateText('Could not read this image. Type the code instead.') });
    } finally {
      setReadingImage(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingTop: topInset + 8 }]}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{translateText(title)}</Text>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  setTorchOn((value) => !value);
                }}
                disabled={!cameraActive}
                style={[styles.iconBtn, torchOn && styles.iconBtnOn, !cameraActive && styles.iconBtnDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Toggle torch light"
              >
                <Zap size={18} color={torchOn ? '#fbbf24' : '#ffffff'} />
              </Pressable>
              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  onClose();
                }}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Close scanner"
              >
                <X size={20} color="#ffffff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.stage}>
            <View style={styles.frame}>
              {cameraActive && permission?.granted ? (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={torchOn}
                  barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
                  onMountError={(error) => {
                    setCameraError(error.message);
                    setCameraActive(false);
                  }}
                  onBarcodeScanned={(result) => {
                    void submitBarcode(result.data);
                  }}
                />
              ) : (
                <View style={styles.cameraFallback}>
                  <Text style={styles.cameraFallbackText}>
                    {translateText(cameraError ?? 'Starting camera…')}
                  </Text>
                </View>
              )}

              <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
              <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
              <View style={styles.laser} pointerEvents="none" />
            </View>

            <Text style={styles.hint}>{translateText('Point at a QR code')}</Text>
            {notice ? (
              <View
                style={[styles.notice, notice.ok ? styles.noticeOk : styles.noticeBad]}
                accessibilityLiveRegion="polite"
              >
                <Text style={styles.noticeText} numberOfLines={2}>{notice.message}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.footer}>
            {continuous && history.length > 0 ? (
              <View style={styles.historyBox}>
                <Text style={styles.historyTitle}>{t('Scanned {count}', { count: history.length })}</Text>
                {history.slice(0, 3).map((item, index) => (
                  <View key={`${item.code}-${index}`} style={styles.historyRow}>
                    <View style={[styles.historyDot, { backgroundColor: item.ok ? '#22c55e' : '#ef4444' }]} />
                    <Text style={styles.historyCode}>{item.code}</Text>
                    <Text style={styles.historyMessage} numberOfLines={1}>{item.message}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable
              onPress={() => {
                void scanFromImage();
              }}
              disabled={readingImage}
              style={({ pressed }) => [styles.imageBtn, pressed && styles.submitBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={translateText('Scan from an image')}
            >
              {readingImage ? <ActivityIndicator size="small" color="#ffffff" /> : <ImageIcon size={18} color="#ffffff" />}
              <Text style={styles.imageBtnText}>{translateText(readingImage ? 'Reading image…' : 'Scan from an image')}</Text>
            </Pressable>

            <View style={styles.manualRow}>
              <TextInput
                value={manualBarcode}
                onChangeText={setManualBarcode}
                placeholder={translateText(placeholder)}
                placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={translateText(manualLabel)}
                onSubmitEditing={() => {
                  void submitBarcode(manualBarcode);
                }}
                style={styles.manualInput}
                returnKeyType="done"
              />
              <Pressable
                onPress={() => {
                  void submitBarcode(manualBarcode);
                }}
                disabled={!manualBarcode.trim()}
                style={({ pressed }) => [
                  styles.submitBtn,
                  !manualBarcode.trim() && styles.submitBtnDisabled,
                  pressed && manualBarcode.trim() && styles.submitBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={translateText('Use code')}
              >
                <ArrowRight size={20} color="#0f172a" />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: '#000000',
    },
    sheet: {
      flex: 1,
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 48,
    },
    title: {
      flex: 1,
      fontSize: 20,
      fontWeight: '700',
      color: '#ffffff',
      fontFamily: typography.fontSans,
      letterSpacing: -0.3,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 8,
    },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    iconBtnOn: {
      backgroundColor: 'rgba(251,191,36,0.28)',
    },
    iconBtnDisabled: {
      opacity: 0.35,
    },
    stage: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      paddingVertical: 12,
    },
    frame: {
      width: '100%',
      maxWidth: 300,
      aspectRatio: 1,
      borderRadius: 28,
      overflow: 'hidden',
      backgroundColor: '#111827',
      position: 'relative',
    },
    cameraFallback: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: '#111827',
    },
    cameraFallbackText: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 20,
      fontFamily: typography.fontSans,
    },
    corner: {
      position: 'absolute',
      width: 28,
      height: 28,
      borderColor: '#ffffff',
    },
    cornerTL: {
      top: 14,
      left: 14,
      borderTopWidth: 3,
      borderLeftWidth: 3,
      borderTopLeftRadius: 10,
    },
    cornerTR: {
      top: 14,
      right: 14,
      borderTopWidth: 3,
      borderRightWidth: 3,
      borderTopRightRadius: 10,
    },
    cornerBL: {
      bottom: 14,
      left: 14,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderBottomLeftRadius: 10,
    },
    cornerBR: {
      bottom: 14,
      right: 14,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: 10,
    },
    laser: {
      position: 'absolute',
      left: 28,
      right: 28,
      top: '50%',
      height: 2,
      marginTop: -1,
      backgroundColor: '#22c55e',
      shadowColor: '#22c55e',
      shadowOpacity: 0.9,
      shadowRadius: 8,
      elevation: 6,
    },
    hint: {
      fontSize: 15,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.78)',
      fontFamily: typography.fontSans,
    },
    notice: {
      maxWidth: 320,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
    },
    noticeOk: {
      backgroundColor: 'rgba(34,197,94,0.92)',
    },
    noticeBad: {
      backgroundColor: 'rgba(239,68,68,0.92)',
    },
    noticeText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
    footer: {
      gap: 12,
    },
    historyBox: {
      gap: 6,
      padding: 12,
      borderRadius: radii.lg,
      backgroundColor: 'rgba(15,23,42,0.72)',
    },
    historyTitle: {
      color: '#cbd5e1',
      fontSize: 12,
      fontWeight: '700',
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    historyDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    historyCode: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '700',
      fontFamily: typography.fontMono,
    },
    historyMessage: {
      flex: 1,
      color: '#cbd5e1',
      fontSize: 12,
    },
    imageBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 46,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
    },
    imageBtnText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
      fontFamily: typography.fontSans,
    },
    manualRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    manualInput: {
      flex: 1,
      minHeight: 52,
      borderRadius: 16,
      paddingHorizontal: 16,
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      fontFamily: typography.fontSans,
    },
    submitBtn: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ffffff',
    },
    submitBtnDisabled: {
      opacity: 0.35,
    },
    submitBtnPressed: {
      opacity: 0.85,
    },
  });
