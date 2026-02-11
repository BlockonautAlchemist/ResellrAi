import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii, shadows } from '../../lib/theme';
import PrimaryButton from './PrimaryButton';

interface UpgradeCardProps {
  onUpgrade: () => void;
  loading?: boolean;
}

const BENEFITS = [
  'Unlimited listings',
  'Direct eBay publishing',
  'Faster workflow',
];

export default function UpgradeCard({ onUpgrade, loading }: UpgradeCardProps) {
  return (
    <View style={[styles.card, shadows.md]}>
      <Text style={styles.title}>You've reached today's free limit</Text>
      <Text style={styles.body}>
        Upgrade to Premium to continue listing right now
      </Text>
      <View style={styles.benefits}>
        {BENEFITS.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>
      <PrimaryButton
        title="View Premium"
        onPress={onUpgrade}
        loading={loading}
        variant="primary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primaryLight,
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  title: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  benefits: {
    marginBottom: spacing.lg,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  checkmark: {
    fontSize: typography.sizes.button,
    color: colors.primary,
    fontWeight: typography.weights.bold,
    marginRight: spacing.sm,
  },
  benefitText: {
    fontSize: typography.sizes.body,
    color: colors.text,
  },
});
