import React, { useEffect, useRef, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Linking, Alert } from 'react-native';
import { NavigationContainer, NavigationContainerRef, getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './screens/HomeScreen';
import AccountScreen from './screens/AccountScreen';
import AuthScreen from './screens/AuthScreen';
import CameraScreen from './screens/CameraScreen';
import GeneratingScreen from './screens/GeneratingScreen';
import ListingPreviewScreen from './screens/ListingPreviewScreen';
import ExportScreen from './screens/ExportScreen';
import CompsScreen from './screens/CompsScreen';
import { API_URL } from './lib/supabase';
import { colors, typography } from './lib/theme';

const Stack = createNativeStackNavigator();

// Get Expo dev URL from environment (for OAuth deep linking in development)
const EXPO_DEV_URL = process.env.EXPO_PUBLIC_DEV_URL;

// Build deep linking prefixes
// - resellrai:// for production builds
// - exp://host:port for Expo Go development
const linkingPrefixes: string[] = ['resellrai://'];
if (EXPO_DEV_URL) {
  linkingPrefixes.push(EXPO_DEV_URL);
}

// Deep linking configuration
// Note: OAuth callbacks are handled manually in handleDeepLink, not via screen navigation
// We only define prefixes here - the config is minimal to avoid "screen not found" errors
const linking = {
  prefixes: linkingPrefixes,
  config: {
    screens: {
      Home: 'home',
    },
  },
  // Intercept OAuth callbacks - prevent auto-navigation to non-existent screen
  getStateFromPath: (path: string, options: any) => {
    if (path.includes('oauth/success') || path.includes('ebay-callback')) {
      return undefined; // Let handleDeepLink (Linking.addEventListener) handle it
    }
    return defaultGetStateFromPath(path, options);
  },
};

export default function App() {
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  // Handle deep links for OAuth callbacks
  // Supports both Expo Go format (exp://host/--/oauth/success) and custom scheme (resellrai://oauth/success)
  const handleDeepLink = useCallback((event: { url: string }) => {
    console.log('[Deep Link] Received:', event.url);

    try {
      const url = new URL(event.url);
      const pathname = url.pathname;
      const provider = url.searchParams.get('provider');
      const success = url.searchParams.get('success') === 'true';
      const error = url.searchParams.get('error');
      const message = url.searchParams.get('message');

      console.log('[Deep Link] Parsed:', { pathname, provider, success, error });

      // Check if this is an OAuth callback
      // Matches: /--/oauth/success, /oauth/success, /ebay-callback, or host=ebay-callback
      const isOAuthCallback =
        pathname.includes('/oauth/success') ||
        pathname === '/ebay-callback' ||
        url.host === 'ebay-callback' ||
        url.host === 'oauth';

      if (isOAuthCallback) {
        console.log('[Deep Link] OAuth callback detected for provider:', provider || 'ebay');

        // Navigate to Home and trigger eBay status refresh
        if (navigationRef.current) {
          navigationRef.current.navigate('Home', {
            ebayCallback: true,
            ebaySuccess: success,
            ebayError: error,
            ebayMessage: message,
          });
        }

        // Show feedback to user (only on error - success is shown via UI state change)
        if (!success && error) {
          Alert.alert('Connection Failed', message || 'Failed to connect eBay account. Please try again.');
        }
      }
    } catch (err) {
      console.error('[Deep Link] Parse error:', err);
    }
  }, []);

  useEffect(() => {
    // Check for initial URL (app opened via deep link)
    const checkInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        console.log('[Deep Link] Initial URL:', initialUrl);
        handleDeepLink({ url: initialUrl });
      }
    };

    checkInitialURL();

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink]);

  console.log(`[DEBUG] API base URL: ${API_URL ?? 'not configured'}`);
  console.log(`[DEBUG] Expo dev URL: ${EXPO_DEV_URL ?? 'not configured'}`);
  console.log(`[DEBUG] Deep link prefixes:`, linkingPrefixes);
  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <StatusBar style="auto" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.primary,
          headerTitleStyle: {
            fontWeight: typography.weights.semibold,
          },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Account"
          component={AccountScreen}
          options={{ title: 'Account' }}
        />
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ title: 'Sign In' }}
        />
        <Stack.Screen
          name="Camera"
          component={CameraScreen}
          options={{ title: 'New Listing' }}
        />
        <Stack.Screen
          name="Generating"
          component={GeneratingScreen}
          options={{
            title: 'Generating',
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Preview"
          component={ListingPreviewScreen}
          options={{ title: 'Preview Listing' }}
        />
        <Stack.Screen
          name="Export"
          component={ExportScreen}
          options={{ title: 'Export' }}
        />
        <Stack.Screen
          name="Comps"
          component={CompsScreen}
          options={{ title: 'Price Comparables' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}



