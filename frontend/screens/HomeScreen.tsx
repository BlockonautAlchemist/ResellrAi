import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  AppState,
  AppStateStatus,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { testConnection, getEbayStatus, getEbayConnection, startEbayOAuth, disconnectEbay, type EbayConnectionStatus } from '../lib/api';
import { isApiConfigured } from '../lib/supabase';
import { colors, spacing, typography, radii, shadows } from '../lib/theme';
import { ScreenContainer, PrimaryButton, Card, StatusChip, TierBadge } from '../components/ui';

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
  const apiConfigured = isApiConfigured();
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

  // Re-check eBay status when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (apiConnected) {
        checkEbayStatus();
      }
    });
    return unsubscribe;
  }, [navigation, apiConnected]);

  const checkApi = async () => {
    const connected = await testConnection();
    setApiConnected(connected);
    if (connected) {
      checkEbayStatus();
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
    <ScreenContainer edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>ResellrAI</Text>
        <Text style={styles.subtitle}>AI-Powered Listing Generator</Text>
      </View>

      <TierBadge isPremium={!!ebayConnection?.connected} />

      <View style={styles.statusContainer}>
        {!apiConfigured ? (
          <StatusChip label="API Not Configured" status="error" />
        ) : apiConnected === null ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : apiConnected ? (
          <StatusChip label="API Connected" status="success" />
        ) : (
          <StatusChip label="API Disconnected" status="error" />
        )}
      </View>

      <View style={styles.buttonContainer}>
        <PrimaryButton
          title="New Listing"
          onPress={() => navigation.navigate('Camera')}
          disabled={!apiConnected}
          size="lg"
        />
      </View>

      {/* eBay Connection */}
      {ebayAvailable && (
        <View style={styles.ebayButtonContainer}>
          <PrimaryButton
            title={ebayConnection?.connected ? 'eBay Connected' : 'Connect eBay'}
            subtitle={ebayConnection?.connected ? (ebayConnection.ebay_username || 'Tap to manage') : undefined}
            onPress={handleConnectEbay}
            disabled={isConnectingEbay || isRefreshingEbay}
            loading={isConnectingEbay || isRefreshingEbay}
            variant={ebayConnection?.connected ? 'success' : 'ebay'}
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
          <Text style={styles.featureText}>Edit, confirm, and copy to clipboard</Text>
        </View>
      </Card>

      <Text style={styles.version}>v0.3.0 - eBay Integration</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
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
  statusContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  buttonContainer: {
    marginBottom: spacing.xxxl + spacing.sm,
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
  version: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
});
