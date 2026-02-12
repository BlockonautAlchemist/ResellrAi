import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Card, PrimaryButton } from '../components/ui';
import { colors, spacing, typography, radii, shadows } from '../lib/theme';

interface OnboardingPlanScreenProps {
  navigation: any;
}

type PlanChoice = 'free' | 'premium';

export default function OnboardingPlanScreen({ navigation }: OnboardingPlanScreenProps) {
  const [selected, setSelected] = useState<PlanChoice>('free');

  const handleContinue = () => {
    if (selected === 'free') {
      navigation.navigate('OnboardingComplete');
    } else {
      navigation.navigate('Premium', { origin: 'onboarding', nextRoute: 'OnboardingEbay' });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.gradientTop, colors.gradientBottom]} style={styles.gradient}>
        <View style={styles.container}>
          <Text style={styles.step}>Step 2 of 3</Text>
          <Text style={styles.title}>Choose your plan</Text>
          <Text style={styles.subtitle}>Start free or unlock Premium features anytime.</Text>

          <TouchableOpacity onPress={() => setSelected('free')} activeOpacity={0.9}>
            <Card elevated style={[styles.planCard, selected === 'free' && styles.planCardSelected]}>
              <View style={styles.planHeader}>
                <Text style={styles.planTitle}>Free</Text>
                {selected === 'free' && <Feather name="check-circle" size={18} color={colors.primary} />}
              </View>
              <Text style={styles.planLine}>Generate listings with AI</Text>
              <Text style={styles.planLine}>Copy details to eBay</Text>
              <Text style={styles.planLine}>Daily + monthly limits</Text>
            </Card>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setSelected('premium')} activeOpacity={0.9}>
            <Card elevated style={[styles.planCard, selected === 'premium' && styles.planCardSelected]}>
              <View style={styles.planHeader}>
                <Text style={styles.planTitle}>Premium</Text>
                {selected === 'premium' && <Feather name="check-circle" size={18} color={colors.success} />}
              </View>
              <Text style={styles.planLine}>Unlimited listings</Text>
              <Text style={styles.planLine}>Direct eBay publish</Text>
              <Text style={styles.planLine}>Price comparables</Text>
            </Card>
          </TouchableOpacity>

          <PrimaryButton
            title={selected === 'free' ? 'Continue as Free' : 'Continue with Premium'}
            onPress={handleContinue}
            size="lg"
          />
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
  planCard: {
    marginBottom: spacing.lg,
    marginHorizontal: 0,
    borderRadius: radii.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    ...shadows.md,
  },
  planCardSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  planTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  planLine: {
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});
