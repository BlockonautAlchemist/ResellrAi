import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ONBOARDING_SEEN_KEY = 'resellr_has_seen_onboarding_auth';

export async function getHasSeenOnboardingAuth(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(ONBOARDING_SEEN_KEY) === 'true';
    }

    const value = await SecureStore.getItemAsync(ONBOARDING_SEEN_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setHasSeenOnboardingAuth(value: boolean): Promise<void> {
  try {
    const stringValue = value ? 'true' : 'false';

    if (Platform.OS === 'web') {
      localStorage.setItem(ONBOARDING_SEEN_KEY, stringValue);
      return;
    }

    await SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, stringValue);
  } catch {
    // Non-fatal: auth and onboarding can still function without this optimization.
  }
}
