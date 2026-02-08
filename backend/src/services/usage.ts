/**
 * Usage Limits Service
 *
 * Tracks per-user usage events and enforces free-tier limits.
 * Premium users (eBay-connected) are unlimited.
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
 * Check if a user has an active eBay account (premium).
 */
export async function isPremiumUser(userKey: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('ebay_accounts')
    .select('id')
    .eq('user_id', userKey)
    .eq('status', 'active')
    .limit(1);

  if (error) {
    console.warn('[Usage] isPremiumUser query error:', error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
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
