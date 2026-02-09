import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../../lib/theme';

interface ScreenContainerProps {
  children: React.ReactNode;
  noPadding?: boolean;
  edges?: Edge[];
  style?: ViewStyle;
}

export default function ScreenContainer({
  children,
  noPadding,
  edges = ['top'],
  style,
}: ScreenContainerProps) {
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <View style={[styles.container, noPadding && styles.noPadding, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    padding: spacing.xl,
  },
  noPadding: {
    padding: 0,
  },
});
