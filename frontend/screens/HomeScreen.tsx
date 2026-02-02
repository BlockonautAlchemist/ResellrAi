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
import { TEMP_USER_ID } from '../lib/constants';

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

  // Listen for app state changes (background → foreground)
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
      const connection = await getEbayConnection(TEMP_USER_ID);
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
              await disconnectEbay(TEMP_USER_ID);
              setEbayConnection({ connected: false });
            },
          },
        ]
      );
      return;
    }

    try {
      setIsConnectingEbay(true);
      const { auth_url } = await startEbayOAuth(TEMP_USER_ID);

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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ResellrAI</Text>
        <Text style={styles.subtitle}>AI-Powered Listing Generator</Text>
      </View>

      <View style={styles.statusContainer}>
        {!apiConfigured ? (
          <Text style={styles.statusDisconnected}>API Not Configured</Text>
        ) : apiConnected === null ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : apiConnected ? (
          <Text style={styles.statusConnected}>API Connected</Text>
        ) : (
          <Text style={styles.statusDisconnected}>API Disconnected</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.button, !apiConnected && styles.buttonDisabled]}
        onPress={() => navigation.navigate('Camera')}
        disabled={!apiConnected}
      >
        <Text style={styles.buttonText}>New Listing</Text>
      </TouchableOpacity>

      {/* eBay Connection */}
      {ebayAvailable && (
        <TouchableOpacity
          style={[
            styles.ebayButton,
            ebayConnection?.connected && styles.ebayButtonConnected,
            (isConnectingEbay || isRefreshingEbay) && styles.buttonDisabled,
          ]}
          onPress={handleConnectEbay}
          disabled={isConnectingEbay || isRefreshingEbay}
        >
          {isConnectingEbay || isRefreshingEbay ? (
            <View style={styles.ebayLoadingContainer}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.ebayLoadingText}>
                {isConnectingEbay ? 'Connecting...' : 'Verifying...'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.ebayButtonText}>
                {ebayConnection?.connected ? 'eBay Connected' : 'Connect eBay'}
              </Text>
              {ebayConnection?.connected && (
                <Text style={styles.ebayUsername}>
                  {ebayConnection.ebay_username || 'Tap to manage'}
                </Text>
              )}
            </>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.features}>
        <Text style={styles.featureTitle}>How it works:</Text>
        <View style={styles.featureItem}>
          <Text style={styles.featureNumber}>1</Text>
          <Text style={styles.featureText}>Take photos of your item</Text>
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.featureNumber}>2</Text>
          <Text style={styles.featureText}>AI generates title, description, and price</Text>
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.featureNumber}>3</Text>
          <Text style={styles.featureText}>Edit, confirm, and copy to clipboard</Text>
        </View>
      </View>

      <Text style={styles.version}>v0.3.0 - eBay Integration</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  statusConnected: {
    color: '#34C759',
    fontSize: 14,
    fontWeight: '600',
  },
  statusDisconnected: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 40,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  ebayButton: {
    backgroundColor: '#e53238',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    flexDirection: 'column',
  },
  ebayButtonConnected: {
    backgroundColor: '#34C759',
  },
  ebayButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  ebayUsername: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  ebayLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ebayLoadingText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
  },
  features: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 28,
    marginRight: 12,
  },
  featureText: {
    fontSize: 15,
    color: '#555',
    flex: 1,
  },
  version: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    fontSize: 12,
    color: '#999',
  },
});
