import { API_URL_DEFAULT, API_URL_TUNNEL } from './supabase';

export type RuntimeNetworkMode = 'lan' | 'tunnel' | 'unknown';

export interface RuntimeNetworkState {
  mode: RuntimeNetworkMode;
  launchUrl: string | null;
  baseUrl: string | null;
  source: 'EXPO_PUBLIC_API_URL' | 'EXPO_PUBLIC_API_URL_TUNNEL' | 'none';
  reason: string;
}

function isPrivateLanHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return true;
  }

  const octets = hostname.split('.');
  if (octets.length !== 4 || octets.some((part) => Number.isNaN(Number(part)))) {
    return false;
  }

  const [a, b] = octets.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function detectRuntimeMode(launchUrl: string | null | undefined): {
  mode: RuntimeNetworkMode;
  reason: string;
} {
  if (!launchUrl) {
    return { mode: 'unknown', reason: 'No launch URL provided by Linking.getInitialURL().' };
  }

  try {
    const parsed = new URL(launchUrl);
    const host = parsed.host.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    if (host.includes('u.expo.dev') || host.includes('exp.direct')) {
      return { mode: 'tunnel', reason: `Launch host "${host}" matches Expo tunnel domain.` };
    }

    if (isPrivateLanHost(hostname)) {
      return { mode: 'lan', reason: `Launch host "${hostname}" is a private LAN address.` };
    }

    if (parsed.protocol === 'exp:' && !isPrivateLanHost(hostname)) {
      return { mode: 'tunnel', reason: `exp:// launch with non-LAN host "${hostname}" treated as tunnel.` };
    }

    return { mode: 'unknown', reason: `Launch host "${host}" did not match LAN/tunnel heuristics.` };
  } catch {
    return { mode: 'unknown', reason: 'Launch URL could not be parsed for runtime mode detection.' };
  }
}

export function resolveApiBaseUrl(launchUrl: string | null | undefined): RuntimeNetworkState {
  const { mode, reason } = detectRuntimeMode(launchUrl);

  if (mode === 'tunnel') {
    if (API_URL_TUNNEL) {
      return {
        mode,
        launchUrl: launchUrl ?? null,
        baseUrl: API_URL_TUNNEL,
        source: 'EXPO_PUBLIC_API_URL_TUNNEL',
        reason,
      };
    }
    if (API_URL_DEFAULT) {
      return {
        mode,
        launchUrl: launchUrl ?? null,
        baseUrl: API_URL_DEFAULT,
        source: 'EXPO_PUBLIC_API_URL',
        reason: `${reason} Tunnel URL not configured; falling back to EXPO_PUBLIC_API_URL.`,
      };
    }
  }

  if (mode === 'lan' && API_URL_DEFAULT) {
    return {
      mode,
      launchUrl: launchUrl ?? null,
      baseUrl: API_URL_DEFAULT,
      source: 'EXPO_PUBLIC_API_URL',
      reason,
    };
  }

  if (API_URL_DEFAULT) {
    return {
      mode,
      launchUrl: launchUrl ?? null,
      baseUrl: API_URL_DEFAULT,
      source: 'EXPO_PUBLIC_API_URL',
      reason: mode === 'unknown' ? `${reason} Defaulting to EXPO_PUBLIC_API_URL.` : reason,
    };
  }

  if (API_URL_TUNNEL) {
    return {
      mode,
      launchUrl: launchUrl ?? null,
      baseUrl: API_URL_TUNNEL,
      source: 'EXPO_PUBLIC_API_URL_TUNNEL',
      reason: `${reason} EXPO_PUBLIC_API_URL missing; using tunnel URL.`,
    };
  }

  return {
    mode,
    launchUrl: launchUrl ?? null,
    baseUrl: null,
    source: 'none',
    reason: `${reason} No API URL env vars are configured.`,
  };
}

let runtimeState: RuntimeNetworkState = resolveApiBaseUrl(null);

export function initializeRuntimeNetwork(launchUrl: string | null | undefined): RuntimeNetworkState {
  runtimeState = resolveApiBaseUrl(launchUrl);
  console.log('[RuntimeNetwork] Initialized:', {
    mode: runtimeState.mode,
    source: runtimeState.source,
    baseUrl: runtimeState.baseUrl,
    reason: runtimeState.reason,
    launchUrl: runtimeState.launchUrl,
  });
  return runtimeState;
}

export function getRuntimeNetworkState(): RuntimeNetworkState {
  return runtimeState;
}

