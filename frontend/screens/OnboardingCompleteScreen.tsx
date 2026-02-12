import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PrimaryButton, Card } from '../components/ui';
import { colors, spacing, typography, radii, shadows } from '../lib/theme';

interface OnboardingCompleteScreenProps {
  navigation: any;
}

export default function OnboardingCompleteScreen({ navigation }: OnboardingCompleteScreenProps) {
  const handleStart = () => {
    navigation.reset({
      index: 1,
      routes: [{ name: 'Home' }, { name: 'Camera' }],
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.gradientTop, colors.gradientBottom]} style={styles.gradient}>
        <View style={styles.container}>
          <Text style={styles.step}>Step 3 of 3</Text>
          <Text style={styles.title}>You're all set</Text>
          <Text style={styles.subtitle}>Start your first listing in under a minute.</Text>

          <Card elevated style={styles.card}>
            <View style={styles.iconWrap}>
              <Feather name="camera" size={20} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Create your first listing</Text>
            <Text style={styles.cardBody}>Take photos and let AI generate the details.</Text>
          </Card>

          <PrimaryButton title="Start Listing" onPress={handleStart} size="lg" />
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.gradientTop,
  },
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: spacing.xl,
  },
  step: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: typography.sizes.heading,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.xl,
    marginHorizontal: 0,
    borderRadius: radii.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardBody: {
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
  },
});
