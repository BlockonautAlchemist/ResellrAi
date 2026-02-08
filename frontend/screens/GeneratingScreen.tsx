import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { generateListing, UsageLimitError, type GenerateListingResponse } from '../lib/api';

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

      Alert.alert(
        'Generation Failed',
        err instanceof Error ? err.message : 'An error occurred',
        [
          { text: 'Try Again', onPress: () => navigation.goBack() },
          { text: 'Cancel', onPress: () => navigation.navigate('Home') },
        ]
      );
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  if (limitError) {
    const isDaily = limitError.limitType === 'daily';
    return (
      <View style={styles.container}>
        <Text style={styles.limitIcon}>!</Text>
        <Text style={styles.limitTitle}>Free Limit Reached</Text>
        <Text style={styles.limitMessage}>
          {isDaily
            ? `You've used ${limitError.dailyUsed}/${limitError.dailyLimit} listings today.`
            : `You've used ${limitError.monthlyUsed}/${limitError.monthlyLimit} listings this month.`}
        </Text>
        <Text style={styles.limitSubtext}>
          Connect your eBay account for unlimited listings.
        </Text>
        <TouchableOpacity
          style={styles.limitCtaButton}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.limitCtaText}>Connect eBay for Unlimited</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.limitSecondaryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.limitSecondaryText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>❌</Text>
        <Text style={styles.errorTitle}>Generation Failed</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" style={styles.spinner} />
      
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
                <ActivityIndicator size="small" color="#fff" />
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  spinner: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  timer: {
    fontSize: 36,
    fontWeight: '300',
    color: '#007AFF',
    marginBottom: 40,
  },
  steps: {
    width: '100%',
    maxWidth: 300,
    marginBottom: 40,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepComplete: {
    backgroundColor: '#34C759',
  },
  stepActive: {
    backgroundColor: '#007AFF',
  },
  stepNumber: {
    color: '#999',
    fontSize: 14,
    fontWeight: '600',
  },
  stepCheckmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  stepLabel: {
    fontSize: 16,
    color: '#999',
  },
  stepLabelActive: {
    color: '#333',
    fontWeight: '500',
  },
  hint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  limitIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF9500',
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 56,
    marginBottom: 16,
    overflow: 'hidden',
  },
  limitTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  limitMessage: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 8,
  },
  limitSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 32,
  },
  limitCtaButton: {
    backgroundColor: '#e53238',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  limitCtaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  limitSecondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  limitSecondaryText: {
    color: '#007AFF',
    fontSize: 16,
  },
});
