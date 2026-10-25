import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Keyboard,
  QrCode,
  ScanLine,
  X,
  Zap,
} from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { useTopInset } from '../../shared/theme/layout';
import { triggerHaptic } from '../../shared/utils/haptics';

interface BarcodeScannerHUDProps {
  visible: boolean;
  onClose: () => void;
  onScanResult: (barcode: string) => void;
  targetBarcode?: string;
}

export function BarcodeScannerHUD({
  visible,
  onClose,
  onScanResult,
  targetBarcode = '',
}: BarcodeScannerHUDProps) {
  const topInset = useTopInset();
  const [torchOn, setTorchOn] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scanned = useRef(false);
  const manualInput = useRef<TextInput>(null);
  useEffect(() => { scanned.current = false; setManualBarcode(''); setCameraActive(false); setCameraError(null); }, [visible]);
  const submitBarcode = (value: string) => {
    const barcode = value.trim();
    if (!barcode || scanned.current) return;
    scanned.current = true; onScanResult(barcode);
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
              <Text style={styles.hudTitle}>Scan container barcode</Text>
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
                onBarcodeScanned={result => submitBarcode(result.data)} />}

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
            <View style={styles.fpsBadge}>
              <Text style={styles.fpsText}>{cameraError || (cameraActive ? 'Camera Ready' : 'Camera Off · Manual Entry Available')}</Text>
            </View>
          </View>

          {/* Manual entry remains available when the camera is unavailable. */}
          <View style={styles.actionsBox}>
            <TextInput ref={manualInput} value={manualBarcode} onChangeText={setManualBarcode}
              placeholder="Enter Or Scan Container Barcode" placeholderTextColor="#c4c8d0"
              autoCapitalize="none" autoCorrect={false} accessibilityLabel="Container barcode"
              onSubmitEditing={() => submitBarcode(manualBarcode)}
              style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#c4c8d0', paddingHorizontal: 12, color: '#ffffff', fontSize: 14 }} />

            <Pressable
              onPress={() => {
                triggerHaptic('success');
                submitBarcode(manualBarcode);
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

const styles = StyleSheet.create({
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
