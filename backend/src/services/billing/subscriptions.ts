import Stripe from 'stripe';
import { supabase } from '../supabase.js';

export interface SubscriptionRecord {
  user_id: string;
  tier: 'free' | 'premium';
  status: string;
  provider: 'stripe';
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  price_id?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  latest_invoice_status?: string | null;
}

export function mapStripeStatus(
  status: Stripe.Subscription.Status
): string {
  return status;
}

export function resolvePremiumActive(
  status: string,
  currentPeriodEnd: string | null
): boolean {
  if (status === 'active' || status === 'trialing') return true;
  if (status === 'past_due' && currentPeriodEnd) {
    const end = new Date(currentPeriodEnd).getTime();
    return Number.isFinite(end) && end > Date.now();
  }
  return false;
}

export async function upsertSubscription(record: SubscriptionRecord): Promise<void> {
  const { error } = await supabase
    .from('user_subscriptions')
    .upsert(
      {
        ...record,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }
}

export async function markWebhookProcessed(eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('stripe_webhook_events')
    .select('event_id')
    .eq('event_id', eventId)
    .limit(1);

  if (error) {
    console.warn('[Stripe] webhook idempotency lookup error:', error.message);
    return false;
  }

  if (data && data.length > 0) {
    return true;
  }

  const { error: insertErr } = await supabase
    .from('stripe_webhook_events')
    .insert({ event_id: eventId });

  if (insertErr) {
    console.warn('[Stripe] webhook idempotency insert error:', insertErr.message);
  }

  return false;
}

export async function getSubscription(userId: string): Promise<SubscriptionRecord | null> {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .limit(1);

  if (error) {
    console.warn('[Subscriptions] getSubscription error:', error.message);
    return null;
  }

  return data?.[0] ?? null;
}
