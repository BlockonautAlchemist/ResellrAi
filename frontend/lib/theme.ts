import { Platform } from 'react-native';

export const colors = {
  primary: '#007AFF',
  primaryLight: '#E3F2FF',
  primaryMuted: '#E8F4FD',
  success: '#34C759',
  successLight: '#E8F8EC',
  error: '#FF3B30',
  errorLight: '#FFE5E5',
  warning: '#FF9500',
  warningLight: '#FFF3CD',
  warningDark: '#856404',
  ebay: '#e53238',

  text: '#333',
  textSecondary: '#555',
  textTertiary: '#666',
  textMuted: '#999',
  textInverse: '#fff',

  background: '#f5f5f5',
  surface: '#fff',
  surfaceSecondary: '#f0f0f0',
  surfaceTertiary: '#f9f9f9',
  inputBackground: '#f5f5f5',

  border: '#eee',
  borderMedium: '#ddd',
  disabled: '#ccc',
  separator: '#e0e0e0',

  overlay: 'rgba(0, 0, 0, 0.5)',
  whiteAlpha80: 'rgba(255,255,255,0.8)',

  // Gradient
  gradientTop: '#E8F0FE',
  gradientBottom: '#F8F9FB',

  // Premium card
  premiumCardBg: '#FFF8E1',
  premiumAccent: '#F5A623',
  premiumAccentLight: '#FFF0D4',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const typography = {
  sizes: {
    xs: 11,
    sm: 12,
    md: 13,
    body: 14,
    input: 15,
    button: 16,
    subtitle: 17,
    title: 18,
    xl: 20,
    heading: 24,
    large: 28,
    hero: 36,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: 'bold' as const,
  },
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const shadows = {
  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
    },
    android: { elevation: 1 },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    android: { elevation: 3 },
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
    },
    android: { elevation: 5 },
    default: {},
  }),
} as const;

export const tier = {
  free: {
    color: colors.warning,
    label: 'Free',
    limits: '5/day, 25/month',
  },
  premium: {
    color: colors.success,
    label: 'Premium',
    limits: 'Unlimited',
  },
} as const;
