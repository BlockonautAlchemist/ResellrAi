import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const STORE_KEY = 'resellr_anon_id';

let cachedId: string | null = null;

const makeId = (): string => Crypto.randomUUID();

export async function getAnonId(): Promise<string> {
  if (cachedId) return cachedId;

  if (Platform.OS === 'web') {
    try {
      const existing = localStorage.getItem(STORE_KEY);
      const id = existing ?? makeId();
      if (!existing) localStorage.setItem(STORE_KEY, id);
      cachedId = id;
      return id;
    } catch {
      cachedId = makeId();
      return cachedId;
    }
  }

  try {
    const existing = await SecureStore.getItemAsync(STORE_KEY);
    const id = existing ?? makeId();
    if (!existing) await SecureStore.setItemAsync(STORE_KEY, id);
    cachedId = id;
    return id;
  } catch {
    cachedId = makeId();
    return cachedId;
  }
}