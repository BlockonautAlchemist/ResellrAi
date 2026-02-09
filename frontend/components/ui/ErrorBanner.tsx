import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, radii, spacing } from '../../lib/theme';

interface ErrorBannerProps {
  message: string;
  type?: 'error' | 'warning';
  action?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function ErrorBanner({
  message,
  type = 'error',
  action,
  onRetry,
  onDismiss,
}: ErrorBannerProps) {
  const isWarning = type === 'warning';
  const bgColor = isWarning ? colors.warningLight : colors.errorLight;
  const textColor = isWarning ? colors.warningDark : colors.error;

  return (
    <View style={[styles.banner, { backgroundColor: bgColor }]}>
      <View style={styles.content}>
        <Text style={[styles.message, { color: textColor }]}>{message}</Text>
        {action && <Text style={styles.action}>{action}</Text>}
      </View>
      <View style={styles.actions}>
        {onRetry && (
          <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
            <Text style={[styles.retryText, { color: textColor }]}>Retry</Text>
          </TouchableOpacity>
        )}
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} style={styles.dismissButton}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  content: {
    flex: 1,
  },
  message: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing.xs,
  },
  action: {
    fontSize: typography.sizes.md,
    color: colors.textTertiary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  retryButton: {
    paddingVertical: spacing.xs,
  },
  retryText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  dismissButton: {
    paddingVertical: spacing.xs,
  },
  dismissText: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
  },
});
