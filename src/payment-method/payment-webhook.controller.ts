import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { type Request } from 'express';

import { PaymentWebhookService } from './payment-webhook.service';

/**
 * Stripe webhook endpoint.
 *
 * Webhook URL for the Stripe dashboard:
 *   POST https://<your-domain>/payment-provider/webhook
 *
 * The raw body (Buffer) is forwarded to the service so that
 * `stripe.webhooks.constructEvent` can verify the signature.
 * Enable `rawBody: true` in NestFactory to make `req.rawBody` available.
 *
 * Events to enable in Stripe:
 *   - payment_intent.succeeded
 *   - payment_intent.payment_failed
 */
@Controller('payment-provider/webhook')
export class PaymentWebhookController {
  constructor(private readonly paymentWebhookService: PaymentWebhookService) {}

  @Post()
  @HttpCode(200)
  handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.paymentWebhookService.handleProviderWebhook(
      req.rawBody ?? req.body,
      signature,
    );
  }
}
