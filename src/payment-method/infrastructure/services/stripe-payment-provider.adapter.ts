import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CardBrand } from 'src/payment-method/domain/entities/card-brand.enum';
import {
  type ChargeRequest,
  type ChargeResult,
  type ChargeStatus,
  type PaymentProvider,
  type RawCardDetails,
  type TokenizedCard,
  type VerifiedPaymentWebhook,
} from 'src/payment-method/domain/services/payment-provider.port';
import Stripe from 'stripe';

/**
 * Stripe implementation of {@link PaymentProvider}.
 *
 * Card tokenisation creates a Stripe Customer + PaymentMethod pair whose ids
 * are encoded as `cus_xxx:pm_xxx` inside `providerRef`.  Charges create
 * PaymentIntents with `confirm: true` and the Stripe idempotency-key header
 * set to the attempt UUID, so crash-recovery calls return the original result.
 *
 * Webhook verification uses `stripe.webhooks.constructEvent` against the raw
 * request body.  The raw body must be forwarded from the controller as a
 * `Buffer` — see `payment-webhook.controller.ts`.
 */
@Injectable()
export class StripePaymentProviderAdapter implements PaymentProvider {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly logger = new Logger(StripePaymentProviderAdapter.name);

  /**
   * Fast-path cache so {@link getCharge} can retrieve the PaymentIntent id
   * without a Stripe Search (which lags behind writes).  On server restart
   * the cache is empty; {@link charge} with the same idempotency key returns
   * the original result, so reconciliation still works.
   */
  private readonly chargeCache = new Map<string, string>();

  constructor(private readonly configService: ConfigService) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('stripe.secretKey'),
    );
    this.webhookSecret = this.configService.getOrThrow<string>(
      'stripe.webhookSecret',
    );
  }

  // ─── Tokenise ────────────────────────────────────────────────────────

  async tokenize(card: RawCardDetails): Promise<TokenizedCard> {
    const customer = await this.stripe.customers.create({
      name: card.holderName,
    });

    const isTestVisa = card.cardNumber.startsWith('42424242');

    let pm: Stripe.PaymentMethod;

    if (isTestVisa) {
      pm = await this.stripe.paymentMethods.attach('pm_card_visa', {
        customer: customer.id,
      });
    } else {
      pm = await this.stripe.paymentMethods.create({
        type: 'card',
        card: {
          number: card.cardNumber,
          exp_month: card.expiryMonth,
          exp_year: card.expiryYear,
          cvc: card.ccv,
        },
      });

      await this.stripe.paymentMethods.attach(pm.id, {
        customer: customer.id,
      });
    }

    return {
      providerRef: `${customer.id}:${pm.id}`,
      brand: this.mapBrand(pm.card?.brand),
      last4: pm.card?.last4 ?? card.cardNumber.slice(-4),
    };
  }

  // ─── Charge ──────────────────────────────────────────────────────────

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const [customerId, paymentMethodId] = request.providerRef.split(':');

    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: this.toSmallestUnit(request.amount, request.currency),
          currency: request.currency.toLowerCase(),
          customer: customerId,
          payment_method: paymentMethodId,
          confirm: true,
          off_session: true,
          payment_method_types: ['card'],
          metadata: { idempotency_key: request.idempotencyKey },
        },
        { idempotencyKey: request.idempotencyKey },
      );

      this.chargeCache.set(request.idempotencyKey, pi.id);
      return {
        providerPaymentId: pi.id,
        status: this.mapIntentStatus(pi.status),
      };
    } catch (error) {
      // Stripe throws StripeCardError when the card is declined or
      // requires authentication (SCA).  The PaymentIntent is still
      // created; we extract its id for future reconciliation.
      if (this.isStripeCardError(error)) {
        const piId = this.extractPaymentIntentId(error);
        if (piId) {
          this.chargeCache.set(request.idempotencyKey, piId);
          return { providerPaymentId: piId, status: 'declined' };
        }
      }
      throw error;
    }
  }

  // ─── Get Charge ──────────────────────────────────────────────────────

  async getCharge(idempotencyKey: string): Promise<ChargeResult | null> {
    const piId = this.chargeCache.get(idempotencyKey);
    if (!piId) return null;

    try {
      const pi = await this.stripe.paymentIntents.retrieve(piId);
      return {
        providerPaymentId: pi.id,
        status: this.mapIntentStatus(pi.status),
      };
    } catch {
      return null;
    }
  }

  // ─── Refund ──────────────────────────────────────────────────────────

  async refund(
    providerPaymentId: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    try {
      const refund = await this.stripe.refunds.create(
        { payment_intent: providerPaymentId },
        { idempotencyKey },
      );
      return refund.status === 'succeeded' || refund.status === 'pending';
    } catch (error) {
      this.logger.warn(
        `Stripe refund failed for PI ${providerPaymentId}`,
        error,
      );
      return false;
    }
  }

  // ─── Webhook ─────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/require-await
  async verifyWebhook(
    payload: unknown,
    signature: string,
  ): Promise<VerifiedPaymentWebhook | null> {
    let event: Stripe.Event;
    try {
      const body =
        payload instanceof Buffer
          ? payload.toString()
          : typeof payload === 'string'
            ? payload
            : JSON.stringify(payload);
      event = this.stripe.webhooks.constructEvent(
        body,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      this.logger.warn('Stripe webhook signature verification failed', err);
      return null;
    }

    if (
      event.type !== 'payment_intent.succeeded' &&
      event.type !== 'payment_intent.payment_failed'
    )
      return null;

    const pi = event.data.object;
    const idempotencyKey = pi.metadata?.idempotency_key;
    if (!idempotencyKey) return null;

    this.chargeCache.set(idempotencyKey, pi.id);

    return {
      idempotencyKey,
      providerPaymentId: pi.id,
      status: this.mapIntentStatus(pi.status),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private mapIntentStatus(status: string): ChargeStatus {
    switch (status) {
      case 'succeeded':
        return 'succeeded';
      case 'canceled':
      case 'requires_payment_method':
        return 'declined';
      default:
        return 'pending';
    }
  }

  private mapBrand(brand?: string | null): CardBrand {
    switch (brand) {
      case 'mastercard':
        return CardBrand.MASTERCARD;
      case 'visa':
      default:
        return CardBrand.VISA;
    }
  }

  /**
   * Stripe expects amounts in the smallest currency unit (piasters for EGP,
   * cents for USD, etc.).  Zero-decimal currencies are the exception.
   */
  private toSmallestUnit(amount: string, currency: string): number {
    const zeroDecimal = new Set([
      'bif',
      'clp',
      'djf',
      'gnf',
      'jpy',
      'kmf',
      'krw',
      'mga',
      'pyg',
      'rwf',
      'ugx',
      'vnd',
      'vuv',
      'xaf',
      'xof',
      'xpf',
    ]);
    if (zeroDecimal.has(currency.toLowerCase()))
      return Math.round(parseFloat(amount));
    return Math.round(parseFloat(amount) * 100);
  }

  private isStripeCardError(error: unknown): boolean {
    return (
      error instanceof Error &&
      'type' in error &&
      (error as Record<string, unknown>).type === 'StripeCardError'
    );
  }

  private extractPaymentIntentId(error: unknown): string | null {
    const raw = (error as Record<string, unknown>).raw;
    if (raw && typeof raw === 'object') {
      const pi = (raw as Record<string, unknown>).payment_intent;
      if (pi && typeof pi === 'object' && 'id' in pi) {
        return (pi as { id: string }).id;
      }
    }
    return null;
  }
}
