import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { type Request } from 'express';
import { Auth } from 'src/common/decorators/auth.decorator';

import { AddPaymentMethodDto } from './dto/add-payment-method.dto';
import { EditPaymentMethodDto } from './dto/edit-payment-method.dto';
import { PaymentMethodService } from './payment-method.service';

@Auth()
@Controller('payment-methods')
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @Get()
  async list(@Req() req: Request) {
    return this.paymentMethodService.list(req.credentials.user.id);
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
