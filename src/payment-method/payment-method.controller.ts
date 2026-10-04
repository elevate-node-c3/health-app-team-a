import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { type Request } from 'express';
import { Verified } from 'src/common/decorators/auth.decorator';

import { AddPaymentMethodDto } from './dto/add-payment-method.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { EditPaymentMethodDto } from './dto/edit-payment-method.dto';
import { PaymentMethodService } from './payment-method.service';

@Verified()
@Controller('payment-methods')
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @Get()
  async list(@Req() req: Request) {
    return this.paymentMethodService.list(req.credentials.user.id);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  async confirmPayment(
    @Param('id', ParseUUIDPipe) paymentMethodId: string,
    @Body() dto: ConfirmPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: Request,
  ) {
    return this.paymentMethodService.confirmPayment(
      req.credentials.user.id,
      paymentMethodId,
      dto.holdId,
      idempotencyKey ?? '',
    );
  }

  @Get('attempts/:idempotencyKey')
  async getPaymentStatus(
    @Param('idempotencyKey') idempotencyKey: string,
    @Req() req: Request,
  ) {
    return this.paymentMethodService.getPaymentStatus(
      req.credentials.user.id,
      idempotencyKey,
    );
  }

  @Post()
  async add(@Body() dto: AddPaymentMethodDto, @Req() req: Request) {
    return this.paymentMethodService.add(req.credentials.user.id, dto);
  }

  @Patch(':id')
  async edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditPaymentMethodDto,
    @Req() req: Request,
  ) {
    return this.paymentMethodService.edit(req.credentials.user.id, id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.paymentMethodService.remove(req.credentials.user.id, id);
  }
}
