import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tier, typography, spacing, radii } from '../../lib/theme';

interface TierBadgeProps {
  isPremium: boolean;
}

export default function TierBadge({ isPremium }: TierBadgeProps) {
  const t = isPremium ? tier.premium : tier.free;

  return (
    <View style={styles.container}>
      <View style={[styles.pill, { backgroundColor: t.color }]}>
        <Text style={styles.pillText}>{t.label}</Text>
      </View>
      <Text style={styles.limits}>{t.limits}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  pillText: {
    color: '#fff',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  limits: {
    fontSize: typography.sizes.md,
    color: '#666',
  },
});
