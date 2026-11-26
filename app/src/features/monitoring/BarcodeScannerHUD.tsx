import { CameraView, scanFromURLAsync, useCameraPermissions, type BarcodeType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Mask, Rect, Stop } from 'react-native-svg';
import { ArrowRight, Camera, CameraOff, ImageIcon, Keyboard, X, Zap } from 'lucide-react-native';
import { t, translateText } from '../../shared/i18n';
import { classifyCode, createScanGuard, SCAN_KIND_LABEL, type ScanKind, type ScannedCode } from '../../shared/scan/scanCodes';
import { RawText as Text } from '../../shared/ui/Text';
import { ThemeColors } from '../../shared/theme/colors';
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
  subtitle?: string;
  busy?: boolean;
  manualLabel?: string;
  placeholder?: string;
}

const BARCODE_TYPES: BarcodeType[] = ['qr', 'code128', 'ean13', 'ean8', 'code39', 'upc_a', 'upc_e'];

const WEB_GLASS_STYLE: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(18px) saturate(160%)',
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
      } as unknown as ViewStyle)
    : null;

const WEB_NO_OUTLINE: ViewStyle | null =
  Platform.OS === 'web'
    ? ({ outlineStyle: 'none', outlineWidth: 0 } as unknown as ViewStyle)
    : null;

const WEB_INPUT_NO_OUTLINE: TextStyle | null =
  Platform.OS === 'web'
    ? ({ outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle)
    : null;

export function BarcodeScannerHUD({
  visible,
  onClose,
  onScanResult,
  title = 'Scan QR Code',
  subtitle,
  busy: externalBusy = false,
  manualLabel = 'Code',
  placeholder = 'Enter code or barcode',
  expect,
  continuous = false,
}: BarcodeScannerHUDProps) {
  const { styles } = useThemedStyles(createStyles);
  const topInset = useTopInset();
  const insets = useSafeAreaInsets();
  const [bounds, setBounds] = useState({ width: 390, height: 800 });
  const [torchOn, setTorchOn] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualFocused, setManualFocused] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scanned = useRef(false);
  const busy = useRef(false);
  const guard = useRef(createScanGuard());
  const [notice, setNotice] = useState<ScanFeedback | null>(null);
  const [history, setHistory] = useState<{ code: string; ok: boolean; message: string }[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [readingImage, setReadingImage] = useState(false);
  const [cornerFlash, setCornerFlash] = useState<'idle' | 'ok' | 'bad'>('idle');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerCornerFeedback = (kind: 'ok' | 'bad') => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setCornerFlash(kind);
    pulseAnim.setValue(0.95);
    Animated.spring(pulseAnim, {
      toValue: 1,
      friction: 6,
      tension: 180,
      useNativeDriver: true,
    }).start();
    flashTimerRef.current = setTimeout(() => setCornerFlash('idle'), 550);
  };

  useEffect(() => {
    if (!visible) return;
    scanned.current = false;
    busy.current = false;
    guard.current = createScanGuard();
    setManualOpen(false);
    setManualFocused(false);
    setManualBarcode('');
    setCameraError(null);
    setNotice(null);
    setHistory([]);
    setHistoryExpanded(false);
    setTorchOn(false);
    setCornerFlash('idle');

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
          setManualOpen(true);
        }
      } catch {
        if (cancelled) return;
        setCameraActive(false);
        setCameraError('Camera unavailable. Enter the code below.');
        setManualOpen(true);
      }
    })();

    return () => {
      cancelled = true;
      setCameraActive(false);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [visible]);

  const submitBarcode = async (value: string) => {
    const barcode = value.trim();
    if (!barcode || scanned.current || busy.current || !guard.current(barcode)) return;
    const code = classifyCode(barcode);
    if (!code) return;
    if (expect?.length && !expect.includes(code.kind)) {
      triggerHaptic('error');
      triggerCornerFeedback('bad');
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
      triggerCornerFeedback('ok');
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
      triggerCornerFeedback(entry.ok ? 'ok' : 'bad');
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
        triggerCornerFeedback('bad');
        setNotice({ ok: false, message: translateText('No code found in this image. Try a sharper photo or type the code.') });
        return;
      }
      guard.current = createScanGuard();
      await submitBarcode(data);
    } catch {
      triggerHaptic('error');
      triggerCornerFeedback('bad');
      setNotice({ ok: false, message: translateText('Could not read this image. Type the code instead.') });
    } finally {
      setReadingImage(false);
    }
  };

  if (!visible) return null;

  const hasCamera = Boolean(cameraActive && permission?.granted);
  const resolvedSubtitle = subtitle
    ? translateText(subtitle)
    : expect?.length
      ? t('Scan a {expected}', {
          expected: expect.map((kind) => t(SCAN_KIND_LABEL[kind]).toLowerCase()).join(' / '),
        })
      : null;

  const stageW = Math.min(bounds.width, 520);
  const cutSize = Math.min(264, Math.max(200, Math.round(Math.min(stageW - 72, bounds.height * 0.34))));
  const cutX = Math.round((bounds.width - cutSize) / 2);
  const cutY = Math.max(topInset + 76, Math.round(bounds.height * 0.41 - cutSize / 2));
  const cornerColor =
    cornerFlash === 'ok' ? '#34d399' : cornerFlash === 'bad' ? '#f87171' : '#ffffff';
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'ios' ? 26 : 18);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={styles.root}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width > 0 && height > 0) setBounds({ width, height });
        }}
      >
        {/* 1. Full-bleed Live Camera */}
        {hasCamera ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onMountError={(error) => {
              setCameraError(error.message);
              setCameraActive(false);
              setManualOpen(true);
            }}
            onBarcodeScanned={(result) => {
              void submitBarcode(result.data);
            }}
          />
        ) : (
          <View style={styles.cameraOffBackdrop} />
        )}

        {/* 2. Cutout Scrim + Subtle Top/Bottom Vignettes */}
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
          <Defs>
            <Mask id="qr-scanner-cutout">
              <Rect x="0" y="0" width="100%" height="100%" fill="#ffffff" />
              <Rect x={cutX} y={cutY} width={cutSize} height={cutSize} rx={28} ry={28} fill="#000000" />
            </Mask>
            <LinearGradient id="qr-vignette-top" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity="0.64" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="qr-vignette-bottom" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0.72" />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(6, 9, 14, 0.56)"
            mask="url(#qr-scanner-cutout)"
          />
          <Rect x="0" y="0" width="100%" height={topInset + 96} fill="url(#qr-vignette-top)" />
          <Rect
            x="0"
            y={Math.max(0, bounds.height - 210)}
            width="100%"
            height={210}
            fill="url(#qr-vignette-bottom)"
          />
        </Svg>

        {/* 3. Precision Viewfinder Frame (no laser) */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.cutoutFrame,
            {
              left: cutX,
              top: cutY,
              width: cutSize,
              height: cutSize,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          {!hasCamera ? (
            <View style={styles.cameraFallback}>
              <CameraOff size={26} color="rgba(255,255,255,0.65)" strokeWidth={1.75} />
              <Text style={styles.cameraFallbackText}>
                {translateText(cameraError ?? 'Starting camera…')}
              </Text>
            </View>
          ) : null}

          <View style={[styles.corner, styles.cornerTL, { borderColor: cornerColor }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: cornerColor }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: cornerColor }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: cornerColor }]} />
        </Animated.View>

        {/* 4. Floating Status / Hint Text Below Viewfinder */}
        <View
          pointerEvents="none"
          style={[styles.statusSlot, { top: cutY + cutSize + 18 }]}
        >
          {notice ? (
            <View
              style={[styles.statusPill, WEB_GLASS_STYLE, notice.ok ? styles.noticeOk : styles.noticeBad]}
              accessibilityLiveRegion="polite"
            >
              <Text style={styles.noticeText} numberOfLines={2}>{notice.message}</Text>
            </View>
          ) : externalBusy || readingImage ? (
            <View style={[styles.statusPill, styles.busyPill, WEB_GLASS_STYLE]}>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={styles.hintText}>
                {translateText(readingImage ? 'Reading image…' : 'Looking up…')}
              </Text>
            </View>
          ) : hasCamera ? (
            <Text style={styles.plainHintText}>{translateText('Point at a QR code')}</Text>
          ) : null}
        </View>

        {/* 5. Floating Minimal Top Bar */}
        <View style={[styles.topBar, { paddingTop: topInset + 10 }]} pointerEvents="box-none">
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>{translateText(title)}</Text>
            {resolvedSubtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>{resolvedSubtitle}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              onClose();
            }}
            style={({ pressed }) => [
              styles.closeBtn,
              WEB_GLASS_STYLE,
              WEB_NO_OUTLINE,
              pressed && styles.btnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
          >
            <X size={20} color="#ffffff" />
          </Pressable>
        </View>

        {/* 6. PA 1 Bottom Thumb Dock */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.dockWrapper}
          pointerEvents="box-none"
        >
          <View style={[styles.dockInner, { paddingBottom: bottomPad }]} pointerEvents="box-none">
            {continuous && history.length > 0 ? (
              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  setHistoryExpanded((v) => !v);
                }}
                style={[styles.historyPill, WEB_GLASS_STYLE, WEB_NO_OUTLINE]}
                accessibilityRole="button"
                accessibilityLabel={t('Scanned {count}', { count: history.length })}
              >
                <View style={styles.historyHeader}>
                  <View style={[styles.historyDot, { backgroundColor: history[0].ok ? '#34d399' : '#f87171' }]} />
                  <Text style={styles.historyCode} numberOfLines={1}>{history[0].code}</Text>
                  <Text style={styles.historyMessage} numberOfLines={1}>{history[0].message}</Text>
                  <View style={styles.historyCountBadge}>
                    <Text style={styles.historyCountText}>{history.length}</Text>
                  </View>
                </View>
                {historyExpanded && history.length > 1 ? (
                  <View style={styles.historyExtra}>
                    {history.slice(1, 5).map((item, idx) => (
                      <View key={`${item.code}-${idx}`} style={styles.historyRow}>
                        <View style={[styles.historyDot, { backgroundColor: item.ok ? '#34d399' : '#f87171' }]} />
                        <Text style={styles.historyCode}>{item.code}</Text>
                        <Text style={styles.historyMessage} numberOfLines={1}>{item.message}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Pressable>
            ) : null}

            {!manualOpen ? (
              <View style={styles.thumbDock}>
                <View style={styles.dockItem}>
                  <Pressable
                    onPress={() => {
                      if (!hasCamera) return;
                      triggerHaptic('tap');
                      setTorchOn((v) => !v);
                    }}
                    disabled={!hasCamera}
                    style={({ pressed }) => [
                      styles.dockCircle,
                      WEB_GLASS_STYLE,
                      WEB_NO_OUTLINE,
                      torchOn && styles.dockCircleActive,
                      !hasCamera && styles.dockCircleDisabled,
                      pressed && hasCamera && styles.btnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle torch light"
                  >
                    <Zap size={22} color={torchOn ? '#0f172a' : '#ffffff'} strokeWidth={2} />
                  </Pressable>
                  <Text style={[styles.dockLabel, !hasCamera && styles.dockLabelDisabled]}>
                    {translateText('Flash')}
                  </Text>
                </View>

                <View style={styles.dockItem}>
                  <Pressable
                    onPress={() => {
                      void scanFromImage();
                    }}
                    disabled={readingImage}
                    style={({ pressed }) => [
                      styles.dockCircle,
                      WEB_GLASS_STYLE,
                      WEB_NO_OUTLINE,
                      pressed && styles.btnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={translateText('Scan from an image')}
                  >
                    {readingImage ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <ImageIcon size={22} color="#ffffff" strokeWidth={2} />
                    )}
                  </Pressable>
                  <Text style={styles.dockLabel}>{translateText('Photo')}</Text>
                </View>

                <View style={styles.dockItem}>
                  <Pressable
                    onPress={() => {
                      triggerHaptic('tap');
                      setManualOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.dockCircle,
                      WEB_GLASS_STYLE,
                      WEB_NO_OUTLINE,
                      pressed && styles.btnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={translateText('Enter code')}
                  >
                    <Keyboard size={22} color="#ffffff" strokeWidth={2} />
                  </Pressable>
                  <Text style={styles.dockLabel}>{translateText('Enter code')}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.manualContainer}>
                {!hasCamera ? (
                  <Pressable
                    onPress={() => {
                      void scanFromImage();
                    }}
                    disabled={readingImage}
                    style={({ pressed }) => [
                      styles.fallbackImagePill,
                      WEB_GLASS_STYLE,
                      WEB_NO_OUTLINE,
                      pressed && styles.btnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={translateText('Scan from an image')}
                  >
                    {readingImage ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <ImageIcon size={16} color="#ffffff" />
                    )}
                    <Text style={styles.fallbackImageText}>
                      {translateText(readingImage ? 'Reading image…' : 'Scan from an image')}
                    </Text>
                  </Pressable>
                ) : null}

                <View style={[styles.manualCapsule, manualFocused && styles.manualCapsuleFocused, WEB_GLASS_STYLE]}>
                  {hasCamera ? (
                    <Pressable
                      onPress={() => {
                        triggerHaptic('tap');
                        setManualOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.cameraToggleBtn,
                        WEB_NO_OUTLINE,
                        pressed && styles.btnPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Close code input"
                    >
                      <Camera size={18} color="rgba(255,255,255,0.78)" strokeWidth={1.9} />
                    </Pressable>
                  ) : null}
                  <TextInput
                    value={manualBarcode}
                    onChangeText={setManualBarcode}
                    placeholder={translateText(placeholder)}
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus={hasCamera}
                    onFocus={() => setManualFocused(true)}
                    onBlur={() => setManualFocused(false)}
                    accessibilityLabel={translateText(manualLabel)}
                    onSubmitEditing={() => {
                      void submitBarcode(manualBarcode);
                    }}
                    style={[styles.manualInput, WEB_INPUT_NO_OUTLINE]}
                    returnKeyType="done"
                  />
                  <Pressable
                    onPress={() => {
                      void submitBarcode(manualBarcode);
                    }}
                    disabled={!manualBarcode.trim()}
                    style={({ pressed }) => [
                      styles.submitBtn,
                      WEB_NO_OUTLINE,
                      !manualBarcode.trim() && styles.submitBtnDisabled,
                      pressed && manualBarcode.trim() && styles.btnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={translateText('Use code')}
                  >
                    <ArrowRight
                      size={18}
                      color={manualBarcode.trim() ? '#0f172a' : 'rgba(255, 255, 255, 0.38)'}
                      strokeWidth={2.4}
                    />
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#090b10',
      position: 'relative',
    },
    cameraOffBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: '#0c1017',
    },
    cutoutFrame: {
      position: 'absolute',
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cameraFallback: {
      paddingHorizontal: 22,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    cameraFallbackText: {
      color: 'rgba(255, 255, 255, 0.78)',
      fontSize: 13.5,
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 19,
      fontFamily: typography.fontSans,
    },
    corner: {
      position: 'absolute',
      width: 34,
      height: 34,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.65,
      shadowRadius: 5,
      elevation: 4,
    },
    cornerTL: {
      top: 0,
      left: 0,
      borderTopWidth: 3.5,
      borderLeftWidth: 3.5,
      borderTopLeftRadius: 28,
    },
    cornerTR: {
      top: 0,
      right: 0,
      borderTopWidth: 3.5,
      borderRightWidth: 3.5,
      borderTopRightRadius: 28,
    },
    cornerBL: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3.5,
      borderLeftWidth: 3.5,
      borderBottomLeftRadius: 28,
    },
    cornerBR: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3.5,
      borderRightWidth: 3.5,
      borderBottomRightRadius: 28,
    },
    statusSlot: {
      position: 'absolute',
      left: 24,
      right: 24,
      alignItems: 'center',
      zIndex: 10,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      maxWidth: 340,
      borderWidth: StyleSheet.hairlineWidth,
    },
    busyPill: {
      backgroundColor: 'rgba(18, 20, 24, 0.72)',
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    plainHintText: {
      color: 'rgba(255, 255, 255, 0.88)',
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      fontFamily: typography.fontSans,
      textShadowColor: 'rgba(0, 0, 0, 0.65)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    hintText: {
      color: 'rgba(255, 255, 255, 0.92)',
      fontSize: 13.5,
      fontWeight: '600',
      fontFamily: typography.fontSans,
    },
    noticeOk: {
      backgroundColor: 'rgba(16, 185, 129, 0.88)',
      borderColor: 'rgba(167, 243, 208, 0.35)',
    },
    noticeBad: {
      backgroundColor: 'rgba(220, 38, 38, 0.88)',
      borderColor: 'rgba(254, 202, 202, 0.35)',
    },
    noticeText: {
      color: '#ffffff',
      fontSize: 13.5,
      fontWeight: '700',
      textAlign: 'center',
      fontFamily: typography.fontSans,
    },
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      maxWidth: 520,
      alignSelf: 'center',
      width: '100%',
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      zIndex: 15,
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
      gap: 2,
      paddingTop: 4,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: '#ffffff',
      fontFamily: typography.fontSans,
      letterSpacing: -0.35,
      textShadowColor: 'rgba(0, 0, 0, 0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    subtitle: {
      fontSize: 12.5,
      fontWeight: '500',
      color: 'rgba(255, 255, 255, 0.78)',
      fontFamily: typography.fontSans,
      textShadowColor: 'rgba(0, 0, 0, 0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(18, 20, 24, 0.56)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    dockWrapper: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 20,
    },
    dockInner: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      paddingHorizontal: 20,
      gap: 12,
    },
    historyPill: {
      borderRadius: 16,
      backgroundColor: 'rgba(18, 20, 24, 0.74)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.12)',
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
    },
    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    historyExtra: {
      gap: 6,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255, 255, 255, 0.12)',
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    historyDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    historyCode: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '700',
      fontFamily: typography.fontMono,
    },
    historyMessage: {
      flex: 1,
      color: 'rgba(255, 255, 255, 0.78)',
      fontSize: 12.5,
      fontFamily: typography.fontSans,
    },
    historyCountBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: 'rgba(255, 255, 255, 0.14)',
    },
    historyCountText: {
      color: '#ffffff',
      fontSize: 11.5,
      fontWeight: '700',
      fontFamily: typography.fontMono,
    },
    thumbDock: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 32,
      paddingVertical: 4,
    },
    dockItem: {
      alignItems: 'center',
      gap: 7,
      minWidth: 64,
    },
    dockCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(18, 20, 24, 0.56)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    dockCircleActive: {
      backgroundColor: '#ffffff',
      borderColor: '#ffffff',
    },
    dockCircleDisabled: {
      opacity: 0.38,
    },
    dockLabel: {
      color: 'rgba(255, 255, 255, 0.92)',
      fontSize: 12,
      fontWeight: '600',
      fontFamily: typography.fontSans,
      textShadowColor: 'rgba(0, 0, 0, 0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    dockLabelDisabled: {
      opacity: 0.45,
    },
    manualContainer: {
      gap: 10,
      alignItems: 'center',
    },
    fallbackImagePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      minHeight: 40,
      borderRadius: 999,
      backgroundColor: 'rgba(18, 20, 24, 0.56)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    fallbackImageText: {
      color: '#ffffff',
      fontSize: 13.5,
      fontWeight: '600',
      fontFamily: typography.fontSans,
    },
    manualCapsule: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 10,
      paddingRight: 6,
      paddingVertical: 5,
      borderRadius: 26,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(18, 20, 24, 0.86)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.14)',
    },
    manualCapsuleFocused: {
      borderColor: 'rgba(255, 255, 255, 0.34)',
    },
    cameraToggleBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    manualInput: {
      flex: 1,
      minHeight: 42,
      paddingHorizontal: 8,
      color: '#ffffff',
      fontSize: 15.5,
      fontWeight: '600',
      fontFamily: typography.fontSans,
    },
    submitBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ffffff',
    },
    submitBtnDisabled: {
      backgroundColor: 'rgba(255, 255, 255, 0.10)',
    },
    btnPressed: {
      opacity: 0.78,
      transform: [{ scale: 0.96 }],
    },
  });
