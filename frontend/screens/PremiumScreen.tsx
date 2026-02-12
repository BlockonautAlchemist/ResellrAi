import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, AppState, AppStateStatus } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Card, PrimaryButton, TierBadge } from '../components/ui';
import { colors, spacing, typography, radii, shadows } from '../lib/theme';
import { createCheckoutSession, getUsageStatus, type UsageStatus } from '../lib/api';

interface PremiumScreenProps {
  navigation: any;
  route?: {
    params?: {
      origin?: 'onboarding' | 'general';
      nextRoute?: string;
    };
  };
}

export default function PremiumScreen({ navigation, route }: PremiumScreenProps) {
  const origin = route?.params?.origin ?? 'general';
  const nextRoute = route?.params?.nextRoute;
  const showProgress = origin === 'onboarding';
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const pendingCheckoutRef = useRef(false);
  const appState = useRef(AppState.currentState);

  const isPremium = usageStatus?.isPremium ?? false;

  useEffect(() => {
    refreshUsage();
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (pendingCheckoutRef.current) {
          pendingCheckoutRef.current = false;
          refreshUsage();
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const refreshUsage = async () => {
    try {
      const status = await getUsageStatus();
      setUsageStatus(status);
    } catch (err) {
      console.warn('[PremiumScreen] Failed to fetch usage status:', err);
    }
  };

  const handleUpgrade = async () => {
    try {
      setLoading(true);
      const { checkoutUrl } = await createCheckoutSession();
      pendingCheckoutRef.current = true;
      await WebBrowser.openBrowserAsync(checkoutUrl);
    } catch (err) {
      Alert.alert('Upgrade', err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (nextRoute) {
      navigation.reset({ index: 0, routes: [{ name: nextRoute }] });
      return;
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.gradientTop, colors.gradientBottom]} style={styles.gradient}>
        <View style={styles.container}>
          {showProgress && <Text style={styles.step}>Step 3 of 3</Text>}
          <Text style={styles.title}>Upgrade to Premium</Text>
          <Text style={styles.subtitle}>
            Publish directly to eBay, remove limits, and unlock price comps.
          </Text>

          <Card elevated style={styles.card}>
            <View style={styles.badgeRow}>
              <TierBadge isPremium />
            </View>
            <Text style={styles.cardTitle}>What you unlock</Text>
            <Text style={styles.cardLine}>Unlimited AI listings</Text>
            <Text style={styles.cardLine}>Direct eBay publishing</Text>
            <Text style={styles.cardLine}>Price comparables</Text>
          </Card>

          {isPremium ? (
            <PrimaryButton
              title={nextRoute ? 'Continue' : 'Premium Active'}
              onPress={handleContinue}
              variant="success"
              size="lg"
            />
          ) : (
            <>
              <PrimaryButton
                title="Upgrade with Stripe"
                onPress={handleUpgrade}
                loading={loading}
                size="lg"
              />
              <PrimaryButton
                title="I've already upgraded"
                onPress={refreshUsage}
                variant="secondary"
              />
            </>
          )}
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
  badgeRow: {
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  cardLine: {
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});
