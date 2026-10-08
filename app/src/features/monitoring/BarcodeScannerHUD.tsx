import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../../shared/theme/colors';

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
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Header Bar */}
        <View style={styles.header}>
          <View>
            <View style={styles.hudBadge}>
              <Text style={styles.hudBadgeText}>SCR-STF-13 · CAMERA HUD</Text>
            </View>
            <Text style={styles.hudTitle}>Scan Container Barcode</Text>
            <Text style={styles.hudSubtitle}>Target: {targetBarcode}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        {/* Viewfinder Center Reticle */}
        <View style={styles.reticleContainer}>
          <View style={styles.reticleBox}>
            {/* Corner Brackets */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Laser Line */}
            <View style={styles.laserLine} />

            <Text style={styles.reticleCenterIcon}>📷</Text>
          </View>

          <Text style={styles.reticleInstruction}>
            Align 1D Code128 or 2D QR Code within reticle
          </Text>
          <View style={styles.fpsBadge}>
            <Text style={styles.fpsText}>⚡ AUTO-FOCUS ACTIVE · 60 FPS</Text>
          </View>
        </View>

        {/* Bottom Simulation Buttons */}
        <View style={styles.actionsBox}>
          <Pressable
            onPress={() => onScanResult(targetBarcode)}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.btnMatch,
              pressed && styles.btnPressed,
            ]}
          >
            <Text style={styles.btnMatchText}>
              ✓ SIMULATE SCAN MATCH ({targetBarcode})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onScanResult('WRONG-BARCODE-999')}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.btnMismatch,
              pressed && styles.btnPressed,
            ]}
          >
            <Text style={styles.btnMismatchText}>
              ⚠️ SIMULATE MISMATCH (WRONG-999)
            </Text>
          </Pressable>

          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Manual Keyboard Entry</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#090d16', // Dark camera viewfinder
    paddingHorizontal: 20,
    paddingTop: 44,
    paddingBottom: 28,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  hudBadge: {
    backgroundColor: 'rgba(14, 116, 144, 0.3)',
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  hudBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: '#38bdf8',
  },
  hudTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
  },
  hudSubtitle: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#94a3b8',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  reticleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleBox: {
    width: 240,
    height: 240,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
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
    shadowRadius: 8,
    elevation: 4,
  },
  reticleCenterIcon: {
    fontSize: 28,
    opacity: 0.25,
  },
  reticleInstruction: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 16,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  fpsBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 8,
  },
  fpsText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: '#4ade80',
  },
  actionsBox: {
    gap: 8,
  },
  actionBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnMatch: {
    backgroundColor: colors.primary,
  },
  btnMatchText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '900',
  },
  btnMismatch: {
    backgroundColor: colors.danger,
  },
  btnMismatchText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '900',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
});
