import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import {
  testConnection,
  getEbayStatus,
  getEbayConnection,
  startEbayOAuth,
  disconnectEbay,
  getUsageStatus,
  createBillingPortal,
  type EbayConnectionStatus,
  type UsageStatus,
} from '../lib/api';
import { isApiConfigured, isSupabaseConfigured, supabase } from '../lib/supabase';
import { colors, spacing, typography } from '../lib/theme';
import { Card, PrimaryButton, TierBadge, UsageCard, ErrorBanner, StatusChip } from '../components/ui';
import { setOAuthReturnRoute } from '../lib/oauth';

interface AccountScreenProps {
  navigation: any;
}

export default function AccountScreen({ navigation }: AccountScreenProps) {
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [ebayConnection, setEbayConnection] = useState<EbayConnectionStatus | null>(null);
  const [ebayAvailable, setEbayAvailable] = useState(false);
  const [isConnectingEbay, setIsConnectingEbay] = useState(false);
  const [isRefreshingEbay, setIsRefreshingEbay] = useState(false);
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const apiConfigured = isApiConfigured();
  const supabaseConfigured = isSupabaseConfigured();
  const appState = useRef(AppState.currentState);
  const pendingOAuthRef = useRef(false);

  const isEbayConnected = !!ebayConnection?.connected;
  const needsReauth = !!ebayConnection?.needs_reauth;
  const isPremium = usageStatus?.isPremium ?? false;
  const isAuthed = !!authEmail;

  useEffect(() => {
    if (!apiConfigured) {
      setApiConnected(false);
      return;
    }
    checkApi();
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (pendingOAuthRef.current) {
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

  useEffect(() => {
    let mounted = true;
    const initAuth = async () => {
      setAuthLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setAuthEmail(data.session?.user?.email ?? null);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

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
      console.warn('[AccountScreen] Failed to fetch usage status:', err);
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
      const status = await getEbayStatus();
      setEbayAvailable(status.available && status.configured);

      const connection = await getEbayConnection();
      setEbayConnection(connection);
    } catch (err) {
      console.error('[AccountScreen] Failed to check eBay status:', err);
    }
  };

  const handleConnectEbay = async () => {
    if (isEbayConnected && !needsReauth) {
      Alert.alert(
        'Disconnect eBay',
        `Connected as: ${ebayConnection?.ebay_username || 'eBay User'}\n\nDo you want to disconnect?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: async () => {
              setIsRefreshingEbay(true);
              await disconnectEbay();
              await checkEbayStatus();
              setIsRefreshingEbay(false);
            },
          },
        ]
      );
      return;
    }

    try {
      setIsConnectingEbay(true);
      setOAuthReturnRoute('Account');
      const { auth_url } = await startEbayOAuth();

      const isValidEbayAuthUrl =
        auth_url.startsWith('https://auth.ebay.com/oauth2/authorize') ||
        auth_url.startsWith('https://auth.sandbox.ebay.com/oauth2/authorize');

      if (!isValidEbayAuthUrl) {
        throw new Error('Received invalid eBay authorization URL from server');
      }

      pendingOAuthRef.current = true;
      await WebBrowser.openBrowserAsync(auth_url);
    } catch (err) {
      pendingOAuthRef.current = false;
      setIsConnectingEbay(false);
      setOAuthReturnRoute(null);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start eBay connection');
    }
  };

  const renderEbayStatus = () => {
    if (!ebayAvailable) {
      return <StatusChip label="Unavailable" status="warning" />;
    }

    if (needsReauth) {
      return <StatusChip label="Reconnect required" status="warning" />;
    }

    if (isEbayConnected) {
      return <StatusChip label="Connected" status="success" />;
    }

    return <StatusChip label="Not connected" status="neutral" />;
  };

  const renderSubscription = () => {
    if (usageStatus) {
      if (isPremium) {
        return (
          <View style={styles.subscriptionPremium}>
            <TierBadge isPremium />
            <Text style={styles.subscriptionNote}>Premium is active on your account.</Text>
            <PrimaryButton
              title="Manage Billing"
              onPress={async () => {
                try {
                  const { portalUrl } = await createBillingPortal();
                  await WebBrowser.openBrowserAsync(portalUrl);
                } catch (err) {
                  Alert.alert('Billing', err instanceof Error ? err.message : 'Failed to open billing portal');
                }
              }}
              variant="secondary"
              size="sm"
            />
          </View>
        );
      }

      return (
        <View>
          <UsageCard
            dailyUsed={usageStatus.dailyUsed}
            dailyLimit={usageStatus.dailyLimit}
            monthlyUsed={usageStatus.monthlyUsed}
            monthlyLimit={usageStatus.monthlyLimit}
            loading={usageLoading}
          />
          <PrimaryButton
            title="View Premium"
            onPress={() => navigation.navigate('Premium')}
            variant="primary"
            size="sm"
          />
        </View>
      );
    }

    return (
      <View style={styles.subscriptionPremium}>
        <TierBadge isPremium={false} />
        <Text style={styles.subscriptionNote}>Usage status will appear once loaded.</Text>
      </View>
    );
  };

  const ebayButtonTitle = needsReauth ? 'Reconnect eBay' : isEbayConnected ? 'Disconnect eBay' : 'Connect eBay';
  const ebayButtonVariant = isEbayConnected && !needsReauth ? 'danger' : 'ebay';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.gradientTop, colors.gradientBottom]} style={styles.gradient}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Account</Text>
            <Text style={styles.subtitle}>Manage your eBay connection and subscription.</Text>
          </View>

          {!apiConfigured && (
            <ErrorBanner
              message="API not configured"
              action="Set EXPO_PUBLIC_API_URL in frontend/.env"
              type="warning"
            />
          )}
          {apiConnected === false && apiConfigured && (
            <ErrorBanner
              message="Unable to reach API"
              action="Check your backend connection and try again"
              type="warning"
            />
          )}
          {apiConnected && !ebayAvailable && (
            <ErrorBanner
              message="eBay integration is unavailable"
              action="Ask support to enable eBay configuration"
              type="warning"
            />
          )}

          <Card elevated>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>eBay Connection</Text>
              {renderEbayStatus()}
            </View>
            <Text style={styles.cardBody}>
              {isEbayConnected
                ? `Connected as ${ebayConnection?.ebay_username || 'eBay User'}.`
                : 'Connect your eBay account to publish listings directly.'}
            </Text>
            <PrimaryButton
              title={ebayButtonTitle}
              onPress={handleConnectEbay}
              loading={isConnectingEbay || isRefreshingEbay}
              disabled={!apiConnected || !ebayAvailable || isRefreshingEbay}
              variant={ebayButtonVariant}
            />
          </Card>

          <Card elevated>
            <Text style={styles.cardTitle}>Sign In</Text>
            {!supabaseConfigured && (
              <Text style={styles.cardBody}>
                Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.
              </Text>
            )}
            {authLoading ? (
              <Text style={styles.cardBody}>Checking authentication...</Text>
            ) : isAuthed ? (
              <View>
                <Text style={styles.cardBody}>Signed in as {authEmail}</Text>
                <PrimaryButton
                  title="Sign Out"
                  onPress={async () => {
                    try {
                      await supabase.auth.signOut();
                      navigation.reset({ index: 0, routes: [{ name: 'OnboardingAuth' }] });
                    } catch (err) {
                      Alert.alert('Sign Out', err instanceof Error ? err.message : 'Failed to sign out');
                    }
                  }}
                  variant="secondary"
                  size="sm"
                />
              </View>
            ) : (
              <PrimaryButton
                title="Sign In / Create Account"
                onPress={() => navigation.navigate('Auth')}
                variant="primary"
                size="sm"
                disabled={!supabaseConfigured}
              />
            )}
          </Card>

          <Card elevated>
            <Text style={styles.cardTitle}>Subscription Status</Text>
            {renderSubscription()}
          </Card>
        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
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
    textAlign: 'center',
  },
  cardHeaderRow: {
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
  subscriptionPremium: {
    alignItems: 'center',
  },
  subscriptionNote: {
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});



