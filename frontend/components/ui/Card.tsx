import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing, radii, shadows } from '../../lib/theme';

interface CardProps {
  children: React.ReactNode;
  elevated?: boolean;
  borderColor?: string;
  style?: ViewStyle;
}

export default function Card({ children, elevated, borderColor, style }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        elevated && shadows.md,
        borderColor && { borderWidth: 2, borderColor },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
});
