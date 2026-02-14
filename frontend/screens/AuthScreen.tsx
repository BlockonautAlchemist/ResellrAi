import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { setHasSeenOnboardingAuth } from '../lib/onboarding-state';
import { colors, spacing, typography, radii } from '../lib/theme';
import { Card, PrimaryButton } from '../components/ui';

interface AuthScreenProps {
  navigation: any;
  route?: {
    params?: {
      mode?: 'onboarding' | 'default';
      onAuthSuccessRoute?: string;
    };
  };
}

export default function AuthScreen({ navigation, route }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const isOnboarding = route?.params?.mode === 'onboarding';
  const onAuthSuccessRoute = route?.params?.onAuthSuccessRoute;

  const handleSubmit = async () => {
    if (!isSupabaseConfigured()) {
      Alert.alert('Auth', 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
      return;
    }

    if (!email || !password) {
      Alert.alert('Auth', 'Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await setHasSeenOnboardingAuth(true);
        if (onAuthSuccessRoute) {
          navigation.reset({ index: 0, routes: [{ name: onAuthSuccessRoute }] });
        } else {
          navigation.goBack();
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          await setHasSeenOnboardingAuth(true);
          if (onAuthSuccessRoute) {
            navigation.reset({ index: 0, routes: [{ name: onAuthSuccessRoute }] });
          } else {
            navigation.goBack();
          }
        } else {
          Alert.alert('Account created', 'Please check your email to confirm your account.');
        }
      }
    } catch (err) {
      Alert.alert('Auth Failed', err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        {isOnboarding && <Text style={styles.step}>Step 1 of 3</Text>}
        <Text style={styles.title}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>
        <Text style={styles.subtitle}>
          {mode === 'signin'
            ? 'Sign in to save listings and manage your subscription.'
            : 'Create an account to get started.'}
        </Text>

        <Card elevated>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <PrimaryButton
            title={mode === 'signin' ? 'Sign In' : 'Create Account'}
            onPress={handleSubmit}
            loading={loading}
            variant="primary"
            size="md"
          />
          <Text
            style={styles.toggle}
            onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin'
              ? "Don't have an account? Create one"
              : 'Already have an account? Sign in'}
          </Text>
        </Card>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.gradientTop,
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
  step: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subtitle: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.text,
    backgroundColor: colors.surfaceSecondary,
  },
  toggle: {
    textAlign: 'center',
    marginTop: spacing.md,
    color: colors.primary,
    fontSize: typography.sizes.body,
  },
});
