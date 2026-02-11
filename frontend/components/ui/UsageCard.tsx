import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii, shadows } from '../../lib/theme';

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
    <View style={styles.card}>
      <Text style={styles.title}>Usage Tracking</Text>

      {/* Daily bar */}
      <View style={styles.barSection}>
        <View style={styles.barHeader}>
          <Text style={styles.barLabel}>
            {loading ? 'Today: —' : `Today: ${Math.min(dailyUsed, dailyLimit)}/${dailyLimit}`}
          </Text>
          <Text style={[styles.barPct, { color: dailyColor }]}>
            {loading ? '—' : `${Math.round(dailyPct * 100)}%`}
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
          <Text style={styles.barLabel}>
            {loading ? 'This Month: —' : `This Month: ${Math.min(monthlyUsed, monthlyLimit)}/${monthlyLimit}`}
          </Text>
          <Text style={[styles.barPct, { color: monthlyColor }]}>
            {loading ? '—' : `${Math.round(monthlyPct * 100)}%`}
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    ...shadows.md,
  },
  title: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
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
  barPct: {
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
