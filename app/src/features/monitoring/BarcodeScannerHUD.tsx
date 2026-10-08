import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
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
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
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
  targetBarcode = 'BOX-101',
}: BarcodeScannerHUDProps) {
  const [torchOn, setTorchOn] = useState(false);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.overlay}>
        {/* Header Bar */}
        <View style={styles.header}>
          <View>
            <View style={styles.hudBadge}>
              <Text style={styles.hudBadgeText}>SCR-STF-13 · CAMERA HUD</Text>
            </View>
            <Text style={styles.hudTitle}>Scan Container Barcode</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setTorchOn(!torchOn)}
              style={[styles.headerIconBtn, torchOn && styles.headerIconBtnActive]}
            >
              <Zap size={18} color={torchOn ? colors.warning : '#ffffff'} />
            </Pressable>
            <Pressable onPress={onClose} style={styles.headerIconBtn}>
              <X size={20} color="#ffffff" />
            </Pressable>
          </View>
        </View>

        {/* Viewfinder Center Reticle */}
        <View style={styles.reticleContainer}>
          <View style={styles.reticleBox}>
            {/* Corner Brackets */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Glowing Scan Laser Line */}
            <View style={styles.laserLine} />

            <View style={styles.reticleCenterIcon}>
              <ScanLine size={48} color={colors.primary} />
            </View>
          </View>

          <Text style={styles.reticleInstruction}>
            Align 1D Code128 or 2D QR Code within the scanning reticle
          </Text>
          <View style={styles.fpsBadge}>
            <Text style={styles.fpsText}>⚡ AUTO-FOCUS ACTIVE · 60 FPS</Text>
          </View>
        </View>

        {/* Bottom Simulation Buttons */}
        <View style={styles.actionsBox}>
          <Pressable
            onPress={() => {
              triggerHaptic('success');
              onScanResult(targetBarcode);
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.btnMatch,
              pressed && styles.btnPressed,
            ]}
          >
            <QrCode size={16} color="#ffffff" />
            <Text style={styles.btnMatchText}>
              SIMULATE SCAN MATCH ({targetBarcode})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('error');
              onScanResult('BOX-999');
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.btnMismatch,
              pressed && styles.btnPressed,
            ]}
          >
            <Text style={styles.btnMismatchText}>
              SIMULATE MISMATCH (BOX-999)
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              onClose();
            }}
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && styles.cancelBtnPressed,
            ]}
          >
            <Keyboard size={16} color="#ffffff" />
            <Text style={styles.cancelText}>Manual Keyboard Entry</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
    padding: 18,
    paddingTop: 36,
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
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  hudBadge: {
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.4)',
    alignSelf: 'flex-start',
  },
  hudBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
    letterSpacing: 0.8,
  },
  hudTitle: {
    fontSize: 16,
    fontWeight: '900',
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
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(37, 99, 235, 0.5)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...shadows.float,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: colors.primary,
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  laserLine: {
    position: 'absolute',
    left: 12,
    right: 12,
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
    opacity: 0.35,
  },
  reticleInstruction: {
    fontSize: 11,
    color: '#cbd5e1',
    textAlign: 'center',
    marginTop: 18,
    fontFamily: typography.fontSans,
  },
  fpsBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    marginTop: 8,
  },
  fpsText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4ade80',
    fontFamily: typography.fontMono,
  },
  actionsBox: {
    gap: 8,
    zIndex: 20,
    paddingBottom: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnMatch: {
    backgroundColor: colors.primary,
    ...shadows.control,
  },
  btnMatchText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: typography.fontSans,
  },
  btnMismatch: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  btnMismatchText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#f87171',
    fontFamily: typography.fontMono,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  cancelBtnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
});
