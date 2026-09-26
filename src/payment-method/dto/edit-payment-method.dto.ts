import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class EditPaymentMethodDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  holderName?: string;

  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/)
  expiry?: string;
}
