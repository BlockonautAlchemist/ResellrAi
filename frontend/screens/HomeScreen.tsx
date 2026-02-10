import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  AppState,
  AppStateStatus,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { testConnection, getEbayStatus, getEbayConnection, startEbayOAuth, disconnectEbay, getUsageStatus, type EbayConnectionStatus, type UsageStatus } from '../lib/api';
import { isApiConfigured } from '../lib/supabase';
import { colors, spacing, typography, radii, shadows } from '../lib/theme';
import { ScreenContainer, PrimaryButton, Card, TierBadge, UsageCard, UpgradeCard, PremiumTeaser } from '../components/ui';

interface HomeScreenProps {
  navigation: any;
  route: {
    params?: {
      ebayCallback?: boolean;
      ebaySuccess?: boolean;
      ebayError?: string;
      ebayMessage?: string;
    };
  };
}

export default function HomeScreen({ navigation, route }: HomeScreenProps) {
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [ebayConnection, setEbayConnection] = useState<EbayConnectionStatus | null>(null);
  const [ebayAvailable, setEbayAvailable] = useState(false);
  const [isConnectingEbay, setIsConnectingEbay] = useState(false);
  const [isRefreshingEbay, setIsRefreshingEbay] = useState(false);
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const apiConfigured = isApiConfigured();

  // Derived state for conditional rendering
  const isFree = usageStatus ? !usageStatus.isPremium : true;
  const isEbayConnected = !!ebayConnection?.connected;
  const isPremium = isEbayConnected || (usageStatus?.isPremium ?? false);
  const isLimitReached = isFree && !isEbayConnected && (
    (usageStatus?.dailyUsed ?? 0) >= (usageStatus?.dailyLimit ?? Infinity) ||
    (usageStatus?.monthlyUsed ?? 0) >= (usageStatus?.monthlyLimit ?? Infinity)
  );
  const shouldShowUpgradeCard = isLimitReached && !isPremium;
  const shouldShowPremiumTeaser = isFree && !isEbayConnected && !isLimitReached;
  const isFreeNotConnected = isFree && !isEbayConnected;
  const appState = useRef(AppState.currentState);
  const pendingOAuthRef = useRef(false);

  useEffect(() => {
    if (!apiConfigured) {
      setApiConnected(false);
      return;
    }
    checkApi();
  }, []);

  // Handle OAuth callback from deep link
  useEffect(() => {
    const params = route.params;
    if (params?.ebayCallback) {
      console.log('[HomeScreen] OAuth callback received:', params);

      // Clear the pending OAuth flag
      pendingOAuthRef.current = false;
      setIsConnectingEbay(false);

      // Refresh eBay status after OAuth callback
      if (params.ebaySuccess) {
        setIsRefreshingEbay(true);
        checkEbayStatus().finally(() => setIsRefreshingEbay(false));
      }

      // Clear the params to prevent re-triggering
      navigation.setParams({
        ebayCallback: undefined,
        ebaySuccess: undefined,
        ebayError: undefined,
        ebayMessage: undefined,
      });
    }
  }, [route.params]);

  // Listen for app state changes (background -> foreground)
  // This handles the case where user returns from browser after OAuth
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log(`[HomeScreen] AppState: ${appState.current} → ${nextAppState}`);

      // App came to foreground
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // If we were waiting for OAuth, refresh eBay status
        if (pendingOAuthRef.current) {
          console.log('[HomeScreen] Returning from OAuth, refreshing eBay status...');
          pendingOAuthRef.current = false;
          setIsConnectingEbay(false);
          setIsRefreshingEbay(true);
          checkEbayStatus().finally(() => setIsRefreshingEbay(false));
        }
      }

      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [apiConnected]);

  // Re-check eBay status and usage when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (apiConnected) {
        checkEbayStatus();
        fetchUsageStatus();
      }
    });
    return unsubscribe;
  }, [navigation, apiConnected]);

  const fetchUsageStatus = async () => {
    try {
      setUsageLoading(true);
      const status = await getUsageStatus();
      setUsageStatus(status);
    } catch (err) {
      console.warn('[HomeScreen] Failed to fetch usage status:', err);
    } finally {
      setUsageLoading(false);
    }
  };

  const checkApi = async () => {
    const connected = await testConnection();
    setApiConnected(connected);
    if (connected) {
      checkEbayStatus();
      fetchUsageStatus();
    }
  };

  const checkEbayStatus = async () => {
    try {
      // First check if eBay integration is available at system level
      const status = await getEbayStatus();
      setEbayAvailable(status.available && status.configured);

      // Then check per-user connection status
      const connection = await getEbayConnection();
      setEbayConnection(connection);
      console.log('[HomeScreen] eBay connection status:', connection);
    } catch (err) {
      console.error('Failed to check eBay status:', err);
    }
  };

  const handleConnectEbay = async () => {
    if (ebayConnection?.connected) {
      // Show disconnect option
      Alert.alert(
        'eBay Connected',
        `Connected as: ${ebayConnection.ebay_username || 'eBay User'}\n\nDo you want to disconnect?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: async () => {
              await disconnectEbay();
              setEbayConnection({ connected: false });
            },
          },
        ]
      );
      return;
    }

    try {
      setIsConnectingEbay(true);
      const { auth_url } = await startEbayOAuth();

      // Validate the auth_url is an eBay authorization URL (not our backend callback)
      const isValidEbayAuthUrl =
        auth_url.startsWith('https://auth.ebay.com/oauth2/authorize') ||
        auth_url.startsWith('https://auth.sandbox.ebay.com/oauth2/authorize');

      if (!isValidEbayAuthUrl) {
        console.error('[HomeScreen] Invalid auth_url - not an eBay authorize URL:', auth_url.substring(0, 80));
        throw new Error('Received invalid eBay authorization URL from server');
      }

      // Safe debug logging: hostname + pathname, first 80 chars
      try {
        const authUrlObj = new URL(auth_url);
        console.log('[HomeScreen] Opening eBay OAuth URL:', {
          hostname: authUrlObj.hostname,
          pathname: authUrlObj.pathname,
          preview: auth_url.substring(0, 80) + '...',
        });
      } catch {
        console.log('[HomeScreen] Opening eBay OAuth URL:', auth_url.substring(0, 80) + '...');
      }

      // Mark that we're waiting for OAuth to complete
      pendingOAuthRef.current = true;

      // Open eBay auth URL using expo-web-browser for better iOS reliability
      await WebBrowser.openBrowserAsync(auth_url);

      // Note: We keep isConnectingEbay true until we return from browser
      // The AppState listener or deep link handler will clear it
    } catch (err) {
      pendingOAuthRef.current = false;
      setIsConnectingEbay(false);
      console.error('[HomeScreen] eBay OAuth error:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start eBay connection');
    }
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>ResellrAI</Text>
          <Text style={styles.subtitle}>AI-Powered Listing Generator</Text>
        </View>

        {isFreeNotConnected ? (
          <>
            {/* 1. New Listing Button */}
            <View style={styles.buttonContainerTop}>
              <PrimaryButton
                title="New Listing"
                onPress={() => navigation.navigate('Camera')}
                disabled={!apiConnected || shouldShowUpgradeCard}
                size="lg"
              />
            </View>

            {/* 2. Workflow Card */}
            <Card elevated style={{ marginBottom: spacing.sm }}>
              <Text style={styles.featureTitle}>Free Plan Workflow</Text>
              <View style={styles.featureItem}>
                <View style={styles.featureNumberCircle}>
                  <Text style={styles.featureNumber}>1</Text>
                </View>
                <Text style={styles.featureText}>Take photos of your item</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureNumberCircle}>
                  <Text style={styles.featureNumber}>2</Text>
                </View>
                <Text style={styles.featureText}>AI generates title, description, and price</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureNumberCircle}>
                  <Text style={styles.featureNumber}>3</Text>
                </View>
                <Text style={styles.featureText}>Copy to clipboard</Text>
              </View>
            </Card>

            {/* 3. Usage Limits Card */}
            <View style={styles.usageContainer}>
              {usageStatus ? (
                <UsageCard
                  dailyUsed={usageStatus.dailyUsed}
                  dailyLimit={usageStatus.dailyLimit}
                  monthlyUsed={usageStatus.monthlyUsed}
                  monthlyLimit={usageStatus.monthlyLimit}
                  loading={usageLoading}
                />
              ) : (
                <TierBadge isPremium={false} />
              )}
            </View>

            {/* 4. Premium Upsell Card */}
            {shouldShowUpgradeCard && (
              <View style={styles.upgradeContainer}>
                <UpgradeCard
                  onUpgrade={handleConnectEbay}
                  loading={isConnectingEbay || isRefreshingEbay}
                />
              </View>
            )}
            {shouldShowPremiumTeaser && (
              <View style={styles.upgradeContainer}>
                <PremiumTeaser
                  onPress={handleConnectEbay}
                  loading={isConnectingEbay || isRefreshingEbay}
                />
              </View>
            )}
          </>
        ) : (
          <>
            {/* Connected/Premium layout (unchanged) */}
            {isPremium ? (
              <TierBadge isPremium />
            ) : isFree && usageStatus ? (
              <UsageCard
                dailyUsed={usageStatus.dailyUsed}
                dailyLimit={usageStatus.dailyLimit}
                monthlyUsed={usageStatus.monthlyUsed}
                monthlyLimit={usageStatus.monthlyLimit}
                loading={usageLoading}
              />
            ) : (
              <TierBadge isPremium={false} />
            )}

            <View style={styles.buttonContainer}>
              <PrimaryButton
                title="New Listing"
                onPress={() => navigation.navigate('Camera')}
                disabled={!apiConnected || shouldShowUpgradeCard}
                size="lg"
              />
            </View>

            {ebayAvailable && isEbayConnected && (
              <View style={styles.ebayButtonContainer}>
                <PrimaryButton
                  title="eBay Connected"
                  subtitle={ebayConnection?.ebay_username || 'Tap to manage'}
                  onPress={handleConnectEbay}
                  disabled={isConnectingEbay || isRefreshingEbay}
                  loading={isConnectingEbay || isRefreshingEbay}
                  variant="success"
                />
              </View>
            )}

            <Card elevated>
              <Text style={styles.featureTitle}>How it works:</Text>
              <View style={styles.featureItem}>
                <View style={styles.featureNumberCircle}>
                  <Text style={styles.featureNumber}>1</Text>
                </View>
                <Text style={styles.featureText}>Take photos of your item</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureNumberCircle}>
                  <Text style={styles.featureNumber}>2</Text>
                </View>
                <Text style={styles.featureText}>AI generates title, description, and price</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureNumberCircle}>
                  <Text style={styles.featureNumber}>3</Text>
                </View>
                <Text style={styles.featureText}>Publish directly to eBay</Text>
              </View>
            </Card>
          </>
        )}

      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.sm,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.sizes.hero,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.sizes.button,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  buttonContainer: {
    marginTop: spacing.xxxl,
    marginBottom: spacing.xxxl + spacing.sm,
  },
  buttonContainerTop: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  ebayButtonContainer: {
    marginBottom: spacing.xl,
  },
  featureTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  featureNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  featureNumber: {
    color: colors.textInverse,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
  featureText: {
    fontSize: typography.sizes.input,
    color: colors.textSecondary,
    flex: 1,
  },
  usageContainer: {
    marginTop: 0,
    marginBottom: 0,
  },
  upgradeContainer: {
    marginBottom: 0,
  },
});
