import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors, spacing, typography, radii } from '../../lib/theme';

interface PremiumTeaserProps {
  onPress: () => void;
  loading?: boolean;
}

const BENEFITS = [
  'Unlimited listings',
  'Direct eBay publishing',
  'Faster workflow',
];

export default function PremiumTeaser({ onPress, loading }: PremiumTeaserProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Premium unlocks:</Text>
      <View style={styles.benefits}>
        {BENEFITS.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.7}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={styles.buttonText}>View Premium</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  benefits: {
    marginBottom: spacing.md,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  bullet: {
    fontSize: typography.sizes.body,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  benefitText: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
  },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.primary,
  },
});
