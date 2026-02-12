import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, AppState, AppStateStatus } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Card, PrimaryButton, StatusChip } from '../components/ui';
import { colors, spacing, typography, radii, shadows } from '../lib/theme';
import { getEbayStatus, getEbayConnection, startEbayOAuth, disconnectEbay, type EbayConnectionStatus } from '../lib/api';
import { setOAuthReturnRoute } from '../lib/oauth';

interface OnboardingEbayScreenProps {
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

export default function OnboardingEbayScreen({ navigation, route }: OnboardingEbayScreenProps) {
  const [ebayConnection, setEbayConnection] = useState<EbayConnectionStatus | null>(null);
  const [ebayAvailable, setEbayAvailable] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pendingOAuthRef = useRef(false);
  const appState = useRef(AppState.currentState);

  const isConnected = !!ebayConnection?.connected;
  const needsReauth = !!ebayConnection?.needs_reauth;

  useEffect(() => {
    refreshEbayStatus();
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (pendingOAuthRef.current) {
          pendingOAuthRef.current = false;
          setIsConnecting(false);
          setIsRefreshing(true);
          refreshEbayStatus().finally(() => setIsRefreshing(false));
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (route.params?.ebayCallback && route.params.ebaySuccess) {
      setIsRefreshing(true);
      refreshEbayStatus().finally(() => setIsRefreshing(false));
    }
  }, [route.params]);

  const refreshEbayStatus = async () => {
    try {
      const status = await getEbayStatus();
      setEbayAvailable(status.available && status.configured);
      const connection = await getEbayConnection();
      setEbayConnection(connection);
    } catch (err) {
      console.error('[OnboardingEbay] Failed to refresh eBay status:', err);
    }
  };

  const handleConnect = async () => {
    if (isConnected && !needsReauth) {
      Alert.alert(
        'Disconnect eBay',
        `Connected as: ${ebayConnection?.ebay_username || 'eBay User'}\n\nDo you want to disconnect?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: async () => {
              setIsRefreshing(true);
              await disconnectEbay();
              await refreshEbayStatus();
              setIsRefreshing(false);
            },
          },
        ]
      );
      return;
    }

    try {
      setIsConnecting(true);
      setOAuthReturnRoute('OnboardingEbay');
      const { auth_url } = await startEbayOAuth();
      pendingOAuthRef.current = true;
      await WebBrowser.openBrowserAsync(auth_url);
    } catch (err) {
      pendingOAuthRef.current = false;
      setIsConnecting(false);
      setOAuthReturnRoute(null);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start eBay connection');
    }
  };

  const renderStatus = () => {
    if (!ebayAvailable) return <StatusChip label="Unavailable" status="warning" />;
    if (needsReauth) return <StatusChip label="Reconnect required" status="warning" />;
    if (isConnected) return <StatusChip label="Connected" status="success" />;
    return <StatusChip label="Not connected" status="neutral" />;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.gradientTop, colors.gradientBottom]} style={styles.gradient}>
        <View style={styles.container}>
          <Text style={styles.title}>Connect eBay</Text>
          <Text style={styles.subtitle}>Publish listings directly from ResellrAI.</Text>

          <Card elevated style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>eBay Connection</Text>
              {renderStatus()}
            </View>
            <Text style={styles.cardBody}>
              {isConnected
                ? `Connected as ${ebayConnection?.ebay_username || 'eBay User'}.`
                : 'Connect your eBay account to enable one-tap publishing.'}
            </Text>
            <PrimaryButton
              title={needsReauth ? 'Reconnect eBay' : isConnected ? 'Disconnect eBay' : 'Connect eBay'}
              onPress={handleConnect}
              loading={isConnecting || isRefreshing}
              disabled={!ebayAvailable || isRefreshing}
              variant={isConnected && !needsReauth ? 'danger' : 'ebay'}
            />
          </Card>

          <PrimaryButton
            title={isConnected ? 'Continue' : 'Skip for now'}
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
            variant="secondary"
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  cardBody: {
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
});
