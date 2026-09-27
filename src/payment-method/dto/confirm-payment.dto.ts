import { IsUUID } from 'class-validator';

export class ConfirmPaymentDto {
  @IsUUID()
  holdId!: string;
}
