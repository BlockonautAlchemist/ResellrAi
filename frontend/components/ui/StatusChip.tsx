import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, radii, spacing } from '../../lib/theme';

type ChipStatus = 'success' | 'error' | 'warning' | 'info' | 'neutral';

interface StatusChipProps {
  label: string;
  status: ChipStatus;
}

const STATUS_COLORS: Record<ChipStatus, { bg: string; text: string }> = {
  success: { bg: colors.success, text: colors.textInverse },
  error: { bg: colors.error, text: colors.textInverse },
  warning: { bg: colors.warning, text: colors.textInverse },
  info: { bg: colors.primary, text: colors.textInverse },
  neutral: { bg: colors.surfaceSecondary, text: colors.textTertiary },
};

export default function StatusChip({ label, status }: StatusChipProps) {
  const statusColors = STATUS_COLORS[status];

  return (
    <View style={[styles.chip, { backgroundColor: statusColors.bg }]}>
      <Text style={[styles.label, { color: statusColors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
});
