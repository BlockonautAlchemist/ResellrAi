import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { EbayPublishStep } from '../lib/api';
import { colors, spacing, typography, radii } from '../lib/theme';

interface PublishProgressProps {
  steps: EbayPublishStep[];
  currentStep?: number;
}

const STEP_LABELS = {
  inventory: 'Creating Inventory',
  offer: 'Creating Offer',
  publish: 'Publishing',
};

export default function PublishProgress({ steps, currentStep }: PublishProgressProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Publishing to eBay</Text>
      <View style={styles.stepsContainer}>
        {steps.map((step, index) => (
          <View key={step.step} style={styles.stepWrapper}>
            <View style={styles.stepRow}>
              {/* Step indicator */}
              <View
                style={[
                  styles.stepIndicator,
                  step.status === 'complete' && styles.stepComplete,
                  step.status === 'in_progress' && styles.stepInProgress,
                  step.status === 'failed' && styles.stepFailed,
                ]}
              >
                {step.status === 'complete' ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : step.status === 'in_progress' ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : step.status === 'failed' ? (
                  <Text style={styles.errorMark}>✕</Text>
                ) : (
                  <Text style={styles.stepNumber}>{step.step}</Text>
                )}
              </View>

              {/* Step content */}
              <View style={styles.stepContent}>
                <Text
                  style={[
                    styles.stepLabel,
                    step.status === 'complete' && styles.stepLabelComplete,
                    step.status === 'in_progress' && styles.stepLabelActive,
                    step.status === 'failed' && styles.stepLabelFailed,
                  ]}
                >
                  {STEP_LABELS[step.name]}
                </Text>
                {step.status === 'complete' && step.item_sku && step.name === 'inventory' && (
                  <Text style={styles.stepDetail}>SKU: {step.item_sku}</Text>
                )}
                {step.status === 'complete' && step.offer_id && step.name === 'offer' && (
                  <Text style={styles.stepDetail}>Offer ID: {step.offer_id}</Text>
                )}
                {step.status === 'complete' && step.listing_id && step.name === 'publish' && (
                  <Text style={styles.stepDetail}>Listing ID: {step.listing_id}</Text>
                )}
                {step.status === 'failed' && step.error && (
                  <Text style={styles.stepError}>{step.error}</Text>
                )}
              </View>
            </View>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <View
                style={[
                  styles.connector,
                  step.status === 'complete' && styles.connectorComplete,
                ]}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  title: {
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  stepsContainer: {
    paddingLeft: spacing.sm,
  },
  stepWrapper: {
    position: 'relative',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  stepIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.separator,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stepComplete: {
    backgroundColor: colors.success,
  },
  stepInProgress: {
    backgroundColor: colors.primary,
  },
  stepFailed: {
    backgroundColor: colors.error,
  },
  stepNumber: {
    color: colors.textTertiary,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
  checkmark: {
    color: colors.textInverse,
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.bold,
  },
  errorMark: {
    color: colors.textInverse,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  stepContent: {
    flex: 1,
    paddingTop: spacing.xs,
  },
  stepLabel: {
    fontSize: typography.sizes.input,
    color: colors.textMuted,
    fontWeight: typography.weights.medium,
  },
  stepLabelComplete: {
    color: colors.success,
  },
  stepLabelActive: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  stepLabelFailed: {
    color: colors.error,
  },
  stepDetail: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  stepError: {
    fontSize: typography.sizes.md,
    color: colors.error,
    marginTop: spacing.xs,
  },
  connector: {
    position: 'absolute',
    left: 15,
    top: 48,
    width: 2,
    height: 24,
    backgroundColor: colors.separator,
  },
  connectorComplete: {
    backgroundColor: colors.success,
  },
});
