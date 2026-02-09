import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Card from './Card';
import { colors, spacing, typography, radii, tier } from '../../lib/theme';

interface UsageCardProps {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  loading?: boolean;
}

function getBarColor(used: number, limit: number): string {
  const pct = limit > 0 ? used / limit : 0;
  if (pct >= 1) return colors.error;
  if (pct >= 0.6) return colors.warning;
  return colors.success;
}

function getEncouragingCopy(
  dailyUsed: number,
  dailyLimit: number,
  monthlyUsed: number,
  monthlyLimit: number
): string {
  const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);

  if (monthlyRemaining === 0) return 'Monthly limit reached — resets next month';
  if (dailyRemaining === 0) return 'Daily limit reached — resets tomorrow';
  if (dailyRemaining <= 2) return "You're almost at today's limit";
  if (monthlyRemaining <= 5) return `${monthlyRemaining} listings left this month`;
  return `You have ${dailyRemaining} listings left today`;
}

export default function UsageCard({
  dailyUsed,
  dailyLimit,
  monthlyUsed,
  monthlyLimit,
  loading,
}: UsageCardProps) {
  const dailyPct = loading || dailyLimit === 0 ? 0 : Math.min(1, dailyUsed / dailyLimit);
  const monthlyPct = loading || monthlyLimit === 0 ? 0 : Math.min(1, monthlyUsed / monthlyLimit);
  const dailyColor = loading ? colors.surfaceSecondary : getBarColor(dailyUsed, dailyLimit);
  const monthlyColor = loading ? colors.surfaceSecondary : getBarColor(monthlyUsed, monthlyLimit);

  return (
    <Card elevated>
      {/* Free Plan pill */}
      <View style={styles.pillRow}>
        <View style={[styles.pill, { backgroundColor: tier.free.color }]}>
          <Text style={styles.pillText}>{tier.free.label} Plan</Text>
        </View>
      </View>

      {/* Daily bar */}
      <View style={styles.barSection}>
        <View style={styles.barHeader}>
          <Text style={styles.barLabel}>Today</Text>
          <Text style={[styles.barCount, { color: dailyColor }]}>
            {loading ? '—' : `${Math.min(dailyUsed, dailyLimit)} / ${dailyLimit}`}
          </Text>
        </View>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              { width: `${dailyPct * 100}%`, backgroundColor: dailyColor },
            ]}
          />
        </View>
      </View>

      {/* Monthly bar */}
      <View style={styles.barSection}>
        <View style={styles.barHeader}>
          <Text style={styles.barLabel}>This Month</Text>
          <Text style={[styles.barCount, { color: monthlyColor }]}>
            {loading ? '—' : `${Math.min(monthlyUsed, monthlyLimit)} / ${monthlyLimit}`}
          </Text>
        </View>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              { width: `${monthlyPct * 100}%`, backgroundColor: monthlyColor },
            ]}
          />
        </View>
      </View>

      {/* Encouraging copy */}
      <Text style={[styles.copy, loading && styles.copyMuted]}>
        {loading
          ? 'Loading usage...'
          : getEncouragingCopy(dailyUsed, dailyLimit, monthlyUsed, monthlyLimit)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    alignItems: 'center',
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
  barSection: {
    marginBottom: spacing.md,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  barLabel: {
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  barCount: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
  barTrack: {
    height: 6,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: radii.full,
  },
  copy: {
    fontSize: typography.sizes.md,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  copyMuted: {
    color: colors.textMuted,
  },
});
