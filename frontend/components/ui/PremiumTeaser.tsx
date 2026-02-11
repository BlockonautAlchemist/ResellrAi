import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radii, shadows } from '../../lib/theme';

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
            <Ionicons name="checkmark-circle" size={20} color={colors.success} style={styles.checkIcon} />
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
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>View Premium</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.premiumCardBg,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#F0E6C8',
    ...shadows.md,
  },
  title: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  benefits: {
    marginBottom: spacing.md,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs + 2,
  },
  checkIcon: {
    marginRight: spacing.sm,
  },
  benefitText: {
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
  },
  button: {
    alignSelf: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.full,
    backgroundColor: colors.premiumAccent,
  },
  buttonText: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
    color: '#fff',
  },
});
