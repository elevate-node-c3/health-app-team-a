import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';

import { PaymentMethodService } from './payment-method.service';

@Controller('payment-provider/webhook')
export class PaymentWebhookController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @Post()
  @HttpCode(200)
  handle(
    @Body() payload: unknown,
    @Headers('provider-signature') signature: string | undefined,
  ) {
    return this.paymentMethodService.handleProviderWebhook(payload, signature);
  }
}
