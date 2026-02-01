import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { EbayPublishStep } from '../lib/api';

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
                  <ActivityIndicator size="small" color="#fff" />
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
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  stepsContainer: {
    paddingLeft: 8,
  },
  stepWrapper: {
    position: 'relative',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  stepIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepComplete: {
    backgroundColor: '#34C759',
  },
  stepInProgress: {
    backgroundColor: '#007AFF',
  },
  stepFailed: {
    backgroundColor: '#FF3B30',
  },
  stepNumber: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
    paddingTop: 4,
  },
  stepLabel: {
    fontSize: 15,
    color: '#999',
    fontWeight: '500',
  },
  stepLabelComplete: {
    color: '#34C759',
  },
  stepLabelActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  stepLabelFailed: {
    color: '#FF3B30',
  },
  stepDetail: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  stepError: {
    fontSize: 13,
    color: '#FF3B30',
    marginTop: 4,
  },
  connector: {
    position: 'absolute',
    left: 15,
    top: 48,
    width: 2,
    height: 24,
    backgroundColor: '#e0e0e0',
  },
  connectorComplete: {
    backgroundColor: '#34C759',
  },
});
