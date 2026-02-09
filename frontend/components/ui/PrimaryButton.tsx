import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';
import { colors, typography, radii, spacing } from '../../lib/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ebay' | 'success' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  subtitle?: string;
}

const VARIANT_COLORS: Record<ButtonVariant, { bg: string; text: string }> = {
  primary: { bg: colors.primary, text: colors.textInverse },
  secondary: { bg: colors.surfaceSecondary, text: colors.text },
  ebay: { bg: colors.ebay, text: colors.textInverse },
  success: { bg: colors.success, text: colors.textInverse },
  danger: { bg: colors.error, text: colors.textInverse },
};

const SIZE_STYLES: Record<ButtonSize, { paddingVertical: number; fontSize: number }> = {
  sm: { paddingVertical: 10, fontSize: typography.sizes.body },
  md: { paddingVertical: 14, fontSize: typography.sizes.button },
  lg: { paddingVertical: 16, fontSize: typography.sizes.title },
};

export default function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  size = 'md',
  subtitle,
}: PrimaryButtonProps) {
  const variantColors = VARIANT_COLORS[variant];
  const sizeStyle = SIZE_STYLES[size];

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: variantColors.bg,
          paddingVertical: sizeStyle.paddingVertical,
        },
        (disabled || loading) && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={variantColors.text} />
          <Text
            style={[
              styles.text,
              { color: variantColors.text, fontSize: sizeStyle.fontSize },
            ]}
          >
            {title}
          </Text>
        </View>
      ) : (
        <>
          <Text
            style={[
              styles.text,
              { color: variantColors.text, fontSize: sizeStyle.fontSize },
            ]}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={[
                styles.subtitle,
                { color: variant === 'secondary' ? colors.textTertiary : colors.whiteAlpha80 },
              ]}
            >
              {subtitle}
            </Text>
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: spacing.xxxl,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: typography.weights.semibold,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
