import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertOctagon,
  Layers,
  LifeBuoy,
  Navigation,
  PackageCheck,
  RotateCw,
  Truck,
} from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { WorkflowItem } from './workflowTemplates';

interface WorkflowTemplateCardProps {
  workflow: WorkflowItem;
  onSelect: (workflow: WorkflowItem) => void;
}

export function WorkflowTemplateCard({
  workflow,
  onSelect,
}: WorkflowTemplateCardProps) {
  const isSafety = workflow.category === 'SAFETY';

  const renderIcon = () => {
    switch (workflow.icon) {
      case 'package-check':
        return <PackageCheck size={20} color={workflow.badgeTone} />;
      case 'truck':
        return <Truck size={20} color={workflow.badgeTone} />;
      case 'rotate-cw':
        return <RotateCw size={20} color={workflow.badgeTone} />;
      case 'navigation':
        return <Navigation size={20} color={workflow.badgeTone} />;
      case 'layers':
        return <Layers size={20} color={workflow.badgeTone} />;
      case 'octagon':
        return <AlertOctagon size={20} color={workflow.badgeTone} />;
      case 'life-buoy':
        return <LifeBuoy size={20} color={workflow.badgeTone} />;
      default:
        return <PackageCheck size={20} color={workflow.badgeTone} />;
    }
  };

  const getBadgeStyle = () => {
    if (workflow.id === 'replenishment') {
      return { bg: 'rgba(0, 92, 209, 0.1)', text: colors.primary, border: 'rgba(0, 92, 209, 0.2)' };
    }
    switch (workflow.category) {
      case 'INBOUND':
        return { bg: 'rgba(0, 92, 209, 0.1)', text: colors.primary, border: 'rgba(0, 92, 209, 0.2)' };
      case 'OUTBOUND':
        return { bg: '#fef3c7', text: '#78350f', border: 'rgba(245, 158, 11, 0.25)' };
      case 'INTERNAL':
        return { bg: '#d2f4dc', text: colors.success, border: 'rgba(0, 122, 56, 0.25)' };
      case 'DIRECT':
        return { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' };
      case 'SAFETY':
        return { bg: '#fee2e2', text: colors.danger, border: 'rgba(200, 39, 43, 0.25)' };
      default:
        return { bg: '#f1f5f9', text: colors.textSecondary, border: colors.border };
    }
  };

  const badgeStyle = getBadgeStyle();

  return (
    <Pressable
      onPress={() => onSelect(workflow)}
      style={({ pressed }) => [
        styles.card,
        isSafety && styles.cardSafety,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Select workflow ${workflow.name}`}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: workflow.tone }]}>
          {renderIcon()}
        </View>
        <View style={[styles.badge, { backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border }]}>
          <Text style={[styles.badgeText, { color: badgeStyle.text }]}>
            {workflow.category}
          </Text>
        </View>
      </View>

      <Text style={styles.name}>{workflow.name}</Text>
      <Text style={styles.note} numberOfLines={2}>
        {workflow.note}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    minHeight: 144,
    justifyContent: 'space-between',
    ...shadows.panel,
  },
  cardSafety: {
    borderColor: colors.dangerBorder,
    backgroundColor: '#fffdfd',
  },
  cardPressed: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    letterSpacing: 0.8,
  },
  name: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
    marginTop: 'auto',
  },
  note: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 14,
    marginTop: 4,
  },
});
