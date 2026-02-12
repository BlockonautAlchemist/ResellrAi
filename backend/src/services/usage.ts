/**
 * Usage Limits Service
 *
 * Tracks per-user usage events and enforces free-tier limits.
 * Premium users are unlimited (tracked in user_subscriptions table).
 */

import { supabase } from './supabase.js';

// Free-tier limits
export const FREE_DAILY_LIMIT = 5;
export const FREE_MONTHLY_LIMIT = 25;

export interface UsageCheckResult {
  allowed: boolean;
  isPremium: boolean;
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  /** ISO string — when the limiting window resets (start of next day or month UTC) */
  resetAt: string;
  /** 'daily' | 'monthly' — which limit was hit, if any */
  limitType?: 'daily' | 'monthly';
}

/**
 * Check if a user has an active premium subscription.
 */
export async function isPremiumUser(userId: string): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('user_id, tier, status, current_period_end')
    .eq('user_id', userId)
    .eq('tier', 'premium')
    .limit(1);

  if (error) {
    console.warn('[Usage] isPremiumUser query error:', error.message);
    return false;
  }

  const record = data?.[0];
  if (!record) return false;

  const status = record.status as string;
  if (status === 'active' || status === 'trialing') return true;

  if (status === 'past_due' && record.current_period_end) {
    const end = new Date(record.current_period_end).getTime();
    if (Number.isFinite(end) && end > Date.now()) {
      return true;
    }
  }

  return false;
}

/**
 * Check whether a user is allowed to perform the given action.
 */
export async function checkUsage(
  userKey: string,
  action: string = 'generate'
): Promise<UsageCheckResult> {
  const premium = await isPremiumUser(userKey);

  if (premium) {
    return {
      allowed: true,
      isPremium: true,
      dailyUsed: 0,
      dailyLimit: Infinity,
      monthlyUsed: 0,
      monthlyLimit: Infinity,
      resetAt: '',
    };
  }

  const now = new Date();

  // Start of today (UTC)
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Start of this month (UTC)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // Count daily usage
  const { count: dailyCount, error: dailyErr } = await supabase
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_key', userKey)
    .eq('action', action)
    .gte('created_at', todayStart.toISOString());

  if (dailyErr) {
    console.error('[Usage] daily count error:', dailyErr.message);
  }

  // Count monthly usage
  const { count: monthlyCount, error: monthlyErr } = await supabase
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_key', userKey)
    .eq('action', action)
    .gte('created_at', monthStart.toISOString());

  if (monthlyErr) {
    console.error('[Usage] monthly count error:', monthlyErr.message);
  }

  const dailyUsed = dailyCount ?? 0;
  const monthlyUsed = monthlyCount ?? 0;

  // Determine which limit is hit (if any)
  let limitType: 'daily' | 'monthly' | undefined;
  let resetAt: string;

  if (dailyUsed >= FREE_DAILY_LIMIT) {
    limitType = 'daily';
    // Reset at start of next day UTC
    const nextDay = new Date(todayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    resetAt = nextDay.toISOString();
  } else if (monthlyUsed >= FREE_MONTHLY_LIMIT) {
    limitType = 'monthly';
    // Reset at start of next month UTC
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    resetAt = nextMonth.toISOString();
  } else {
    // Reset at start of next day (next soonest limit boundary)
    const nextDay = new Date(todayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    resetAt = nextDay.toISOString();
  }

  const allowed = !limitType;

  console.log(
    `[Usage] userKey=${userKey} daily=${dailyUsed}/${FREE_DAILY_LIMIT} monthly=${monthlyUsed}/${FREE_MONTHLY_LIMIT} allowed=${allowed}`
  );

  return {
    allowed,
    isPremium: false,
    dailyUsed,
    dailyLimit: FREE_DAILY_LIMIT,
    monthlyUsed,
    monthlyLimit: FREE_MONTHLY_LIMIT,
    resetAt,
    limitType,
  };
}

/**
 * Record a usage event (fire-and-forget safe).
 */
export async function recordUsage(userKey: string, action: string = 'generate'): Promise<void> {
  const { error } = await supabase
    .from('usage_events')
    .insert({ user_key: userKey, action });

  if (error) {
    console.error('[Usage] recordUsage insert error:', error.message);
  }
}
