import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase credentials not configured.\n' +
    'Copy .env.example to .env and fill in your values.'
  );
}

// Secure storage adapter for auth tokens
const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      // Use localStorage for web
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

// Create Supabase client
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// API URLs for backend calls
export const API_URL_DEFAULT = process.env.EXPO_PUBLIC_API_URL;
export const API_URL_TUNNEL = process.env.EXPO_PUBLIC_API_URL_TUNNEL;
// Backward-compatible alias; runtime resolver may pick a different URL.
export const API_URL = API_URL_DEFAULT ?? API_URL_TUNNEL;

if (!API_URL_DEFAULT && !API_URL_TUNNEL) {
  console.warn(
    '⚠️ API URL not configured.\n' +
      'Set EXPO_PUBLIC_API_URL (LAN/default) and optionally EXPO_PUBLIC_API_URL_TUNNEL (ngrok for Expo tunnel).'
  );
}

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Check if backend API is configured
 */
export function isApiConfigured(): boolean {
  return Boolean(API_URL_DEFAULT || API_URL_TUNNEL);
}

/**
 * Test connection to Supabase
 */
export async function testConnection(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    console.log('Supabase not configured');
    return false;
  }
  
  try {
    const { error } = await supabase.from('_test_connection').select('*').limit(1);
    // Even if table doesn't exist, connection worked if we got a proper error
    if (error && error.code === '42P01') {
      // Table doesn't exist - but connection worked
      return true;
    }
    return !error;
  } catch (err) {
    console.error('Supabase connection test failed:', err);
    return false;
  }
}
