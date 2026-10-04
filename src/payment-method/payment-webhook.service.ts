import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PAYMENT_ATTEMPT_REPOSITORY } from './domain/repositories/payment-attempt.repository';
import { PAYMENT_PROVIDER } from './domain/services/payment-provider.port';
import { PaymentChargeService } from './payment-charge.service';

import type { PaymentAttemptRepository } from './domain/repositories/payment-attempt.repository';
import type { PaymentProvider } from './domain/services/payment-provider.port';

/**
 * Accepts payment outcomes the provider pushes to us.
 *
 * The endpoint is unauthenticated, so the signature check is the only thing
 * standing between a stranger and a forged "payment succeeded" — it runs before
 * anything is read or written.
 */
@Injectable()
export class PaymentWebhookService {
  constructor(
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    @Inject(PAYMENT_ATTEMPT_REPOSITORY)
    private readonly attemptRepository: PaymentAttemptRepository,
    private readonly chargeService: PaymentChargeService,
  ) {}

  async handleProviderWebhook(
    payload: unknown,
    signature: string | undefined,
  ): Promise<{ accepted: true }> {
    if (!signature)
      throw new UnauthorizedException('Missing provider signature');

    const verified = await this.paymentProvider.verifyWebhook(
      payload,
      signature,
    );
    if (!verified)
      throw new UnauthorizedException('Invalid provider signature');

    // The provider echoes our attempt id back as its idempotency key.
    const attempt = await this.attemptRepository.findById(
      verified.idempotencyKey,
    );
    if (!attempt) throw new NotFoundException('Payment attempt not found');

    // The webhook body says what was true when it was sent; re-reading the
    // charge gets the provider's current answer, which is what should be
    // applied. The body is the fallback when that read fails.
    const currentResult =
      (await this.paymentProvider.getCharge(attempt.id)) ?? verified;
    await this.chargeService.applyProviderResult(attempt, currentResult);

    return { accepted: true };
  }
}
