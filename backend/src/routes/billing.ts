import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { stripe } from '../services/billing/stripe.js';
import {
  upsertSubscription,
  markWebhookProcessed,
  getSubscription,
  SubscriptionRecord,
} from '../services/billing/subscriptions.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

function buildSubscriptionRecord(
  userId: string,
  subscription: Stripe.Subscription,
  customerId: string,
  latestInvoiceStatus?: string | null
): SubscriptionRecord {
  const priceId =
    subscription.items?.data?.[0]?.price?.id ?? null;

  return {
    user_id: userId,
    tier: 'premium',
    status: subscription.status,
    provider: 'stripe',
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    price_id: priceId,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    latest_invoice_status: latestInvoiceStatus ?? null,
  };
}

async function resolveUserIdFromSubscription(
  subscription: Stripe.Subscription
): Promise<string | null> {
  const direct = subscription.metadata?.user_id;
  if (direct) return direct;

  const customerId = subscription.customer as string | null;
  if (!customerId) return null;

  const customer = await stripe.customers.retrieve(customerId);
  if (customer && typeof customer !== 'string' && customer.metadata?.user_id) {
    return customer.metadata.user_id;
  }
  return null;
}

// =============================================================================
// CHECKOUT
// =============================================================================

router.post('/checkout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Reuse or create Stripe customer for this user
    const existingCustomers = await stripe.customers.search({
      query: `metadata['user_id']:'${userId}'`,
      limit: 1,
    });
    const customer =
      existingCustomers.data?.[0] ??
      (await stripe.customers.create({
        metadata: { user_id: userId },
      }));

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      subscription_data: {
        metadata: {
          user_id: userId,
        },
      },
      line_items: [
        {
          price: env.STRIPE_PREMIUM_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: env.STRIPE_SUCCESS_URL,
      cancel_url: env.STRIPE_CANCEL_URL,
      metadata: {
        user_id: userId,
        tier: 'premium',
      },
    });

    res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('[Billing] checkout error:', error);
    res.status(500).json({
      error: {
        code: 'CHECKOUT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create checkout session',
      },
    });
  }
});

router.post('/portal', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const existing = await getSubscription(userId);
    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const { data, error } = await stripe.customers.search({
        query: `metadata['user_id']:'${userId}'`,
        limit: 1,
      });
      if (error || !data || data.length === 0) {
        res.status(400).json({
          error: {
            code: 'CUSTOMER_NOT_FOUND',
            message: 'No billing customer found for this account',
          },
        });
        return;
      }
      customerId = data[0].id;
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: env.STRIPE_PORTAL_RETURN_URL,
    });

    res.json({ portalUrl: portal.url });
  } catch (error) {
    console.error('[Billing] portal error:', error);
    res.status(500).json({
      error: {
        code: 'PORTAL_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create billing portal session',
      },
    });
  }
});

// =============================================================================
// STRIPE WEBHOOK
// =============================================================================

router.post('/stripe/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  if (!sig || typeof sig !== 'string') {
    return res.status(400).send('Missing Stripe signature');
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[Stripe] webhook signature verification failed:', err);
    return res.status(400).send('Invalid signature');
  }

  const alreadyProcessed = await markWebhookProcessed(event.id);
  if (alreadyProcessed) {
    return res.json({ received: true, idempotent: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const userId = session.metadata?.user_id;
        const subscriptionId = session.subscription as string | null;
        const customerId = session.customer as string | null;
        if (!userId || !subscriptionId || !customerId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscription(buildSubscriptionRecord(userId, subscription, customerId));
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdFromSubscription(subscription);
        if (!userId) break;
        await upsertSubscription(buildSubscriptionRecord(userId, subscription, subscription.customer as string));
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdFromSubscription(subscription);
        if (!userId) break;
        await upsertSubscription(buildSubscriptionRecord(userId, subscription, subscription.customer as string));
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;
        if (!subscriptionId) break;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = await resolveUserIdFromSubscription(subscription);
        if (!userId) break;
        await upsertSubscription(
          buildSubscriptionRecord(userId, subscription, subscription.customer as string, invoice.status)
        );
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;
        if (!subscriptionId) break;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = await resolveUserIdFromSubscription(subscription);
        if (!userId) break;
        await upsertSubscription(
          buildSubscriptionRecord(userId, subscription, subscription.customer as string, invoice.status)
        );
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('[Stripe] webhook processing error:', err);
    return res.status(500).send('Webhook processing failed');
  }

  res.json({ received: true });
});

export default router;
