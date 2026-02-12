import { supabase } from './supabase.js';
import type { EbayPublishResult } from '../types/ebay-schemas.js';
import { isPremiumUser } from './usage.js';

interface TrialRow {
  user_id: string;
  granted_at: string;
  used_at: string | null;
}

export interface PublishTrialStatus {
  granted: boolean;
  used: boolean;
  available: boolean;
  grantedAt?: string;
  usedAt?: string;
}

export async function grantOnEbayConnect(userId: string): Promise<void> {
  if (!userId) return;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('free_publish_trials')
    .upsert(
      {
        user_id: userId,
        granted_at: now,
        grant_source: 'ebay_connect',
        updated_at: now,
      },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );

  if (error) {
    throw new Error(`Failed to grant publish trial: ${error.message}`);
  }
}

export async function getTrialStatus(userId: string): Promise<PublishTrialStatus> {
  if (!userId) {
    return { granted: false, used: false, available: false };
  }

  const { data, error } = await supabase
    .from('free_publish_trials')
    .select('user_id, granted_at, used_at')
    .eq('user_id', userId)
    .limit(1);

  if (error) {
    console.warn('[PublishTrial] getTrialStatus query error:', error.message);
    return { granted: false, used: false, available: false };
  }

  const row = (data?.[0] ?? null) as TrialRow | null;
  if (!row) {
    return { granted: false, used: false, available: false };
  }

  const used = !!row.used_at;
  return {
    granted: true,
    used,
    available: !used,
    grantedAt: row.granted_at,
    usedAt: row.used_at || undefined,
  };
}

export async function canDirectPublish(
  userId: string
): Promise<{ allowed: boolean; reason: 'premium' | 'trial_available' | 'upgrade_required' }> {
  const isPremium = await isPremiumUser(userId);
  if (isPremium) {
    return { allowed: true, reason: 'premium' };
  }

  const trial = await getTrialStatus(userId);
  if (trial.available) {
    return { allowed: true, reason: 'trial_available' };
  }

  return { allowed: false, reason: 'upgrade_required' };
}

export async function consumeOnSuccessfulPublish(
  userId: string,
  listingId: string,
  publishResult: EbayPublishResult
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('free_publish_trials')
    .update({
      used_at: now,
      used_listing_id: listingId,
      used_publish_result: publishResult,
      updated_at: now,
    })
    .eq('user_id', userId)
    .is('used_at', null)
    .select('user_id')
    .limit(1);

  if (error) {
    throw new Error(`Failed to consume publish trial: ${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}

