import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { generateListing, UsageLimitError, type GenerateListingResponse } from '../lib/api';
import { colors, spacing, typography, radii } from '../lib/theme';
import { ScreenContainer, PrimaryButton, ErrorBanner } from '../components/ui';

interface GeneratingScreenProps {
  navigation: any;
  route: {
    params: {
      photos: string[];
      platform: 'ebay';
      userHints?: { brand?: string };
    };
  };
}

const STEPS = [
  { id: 'upload', label: 'Uploading photos...' },
  { id: 'analyze', label: 'Analyzing with AI...' },
  { id: 'generate', label: 'Generating listing...' },
  { id: 'price', label: 'Estimating price...' },
  { id: 'format', label: 'Formatting for platform...' },
];

export default function GeneratingScreen({ navigation, route }: GeneratingScreenProps) {
  const { photos, platform, userHints } = route.params;
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<UsageLimitError | null>(null);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    // Update elapsed time every 100ms
    const timer = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 100);

    return () => clearInterval(timer);
  }, [startTime]);

  useEffect(() => {
    // Simulate step progression based on time
    const stepTimer = setInterval(() => {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }, 3000);

    return () => clearInterval(stepTimer);
  }, []);

  useEffect(() => {
    doGenerate();
  }, []);

  const doGenerate = async () => {
    try {
      const result = await generateListing({
        photos,
        platform,
        userHints,
      });

      // Navigate to preview with the result
      navigation.replace('Preview', { listing: result });
    } catch (err) {
      console.error('Generation failed:', err);

      if (err instanceof UsageLimitError) {
        setLimitError(err);
        return;
      }

      setError(err instanceof Error ? err.message : 'Generation failed');
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  if (limitError) {
    const isDaily = limitError.limitType === 'daily';
    return (
      <ScreenContainer edges={[]}>
        <View style={styles.errorScreenContainer}>
          <View style={styles.limitIconCircle}>
            <Text style={styles.limitIconText}>!</Text>
          </View>
          <Text style={styles.limitTitle}>
            {isDaily ? 'Daily Limit Reached' : 'Monthly Limit Reached'}
          </Text>
          <Text style={styles.limitMessage}>
            {isDaily
              ? `You've used ${Math.min(limitError.dailyUsed, limitError.dailyLimit)}/${limitError.dailyLimit} listings today.`
              : `You've used ${Math.min(limitError.monthlyUsed, limitError.monthlyLimit)}/${limitError.monthlyLimit} listings this month.`}
          </Text>
          <Text style={styles.limitSubtext}>
            Connect your eBay account for unlimited listings.
          </Text>
          <View style={styles.limitButtons}>
            <PrimaryButton
              title="Connect eBay for Unlimited"
              onPress={() => navigation.navigate('Home')}
              variant="ebay"
            />
            <View style={styles.buttonSpacer} />
            <PrimaryButton
              title="Go Back"
              onPress={() => navigation.goBack()}
              variant="secondary"
            />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer edges={[]}>
        <View style={styles.errorScreenContainer}>
          <ErrorBanner message={error} type="error" />
          <Text style={styles.errorTitle}>Generation Failed</Text>
          <View style={styles.limitButtons}>
            <PrimaryButton
              title="Try Again"
              onPress={() => navigation.goBack()}
            />
            <View style={styles.buttonSpacer} />
            <PrimaryButton
              title="Go Home"
              onPress={() => navigation.navigate('Home')}
              variant="secondary"
            />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={[]}>
      <View style={styles.progressContainer}>
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />

        <Text style={styles.title}>Generating Listing</Text>
        <Text style={styles.timer}>{formatTime(elapsedTime)}</Text>

        <View style={styles.steps}>
          {STEPS.map((step, index) => (
            <View key={step.id} style={styles.stepRow}>
              <View
                style={[
                  styles.stepIndicator,
                  index < currentStep && styles.stepComplete,
                  index === currentStep && styles.stepActive,
                ]}
              >
                {index < currentStep ? (
                  <Text style={styles.stepCheckmark}>✓</Text>
                ) : index === currentStep ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  index <= currentStep && styles.stepLabelActive,
                ]}
              >
                {step.label}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.hint}>
          This usually takes 15-30 seconds
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  progressContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  spinner: {
    marginBottom: spacing.xxl,
  },
  title: {
    fontSize: typography.sizes.heading,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  timer: {
    fontSize: typography.sizes.hero,
    fontWeight: '300',
    color: colors.primary,
    marginBottom: spacing.xxxl + spacing.sm,
  },
  steps: {
    width: '100%',
    maxWidth: 300,
    marginBottom: spacing.xxxl + spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  stepIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.separator,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  stepComplete: {
    backgroundColor: colors.success,
  },
  stepActive: {
    backgroundColor: colors.primary,
  },
  stepNumber: {
    color: colors.textMuted,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
  stepCheckmark: {
    color: colors.textInverse,
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.bold,
  },
  stepLabel: {
    fontSize: typography.sizes.button,
    color: colors.textMuted,
  },
  stepLabelActive: {
    color: colors.text,
    fontWeight: typography.weights.medium,
  },
  hint: {
    fontSize: typography.sizes.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  // Error / Limit screens
  errorScreenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  limitIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  limitIconText: {
    color: colors.textInverse,
    fontSize: 32,
    fontWeight: typography.weights.bold,
  },
  limitTitle: {
    fontSize: typography.sizes.heading,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  limitMessage: {
    fontSize: typography.sizes.button,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  limitSubtext: {
    fontSize: typography.sizes.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xxxl,
  },
  limitButtons: {
    width: '100%',
    maxWidth: 300,
  },
  buttonSpacer: {
    height: spacing.md,
  },
  errorTitle: {
    fontSize: typography.sizes.heading,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
});
