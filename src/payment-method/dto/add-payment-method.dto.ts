import { IsBoolean, IsString, Length, Matches } from 'class-validator';
import { IsLuhnValid } from 'src/common/decorators/luhn.decorator';

export class AddPaymentMethodDto {
  @IsString()
  @Length(2, 100)
  holderName!: string;

  @Matches(/^\d{12,19}$/)
  @IsLuhnValid()
  cardNumber!: string;

  @Matches(/^\d{3,4}$/)
  ccv!: string;

  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/)
  expiry!: string;

  @IsBoolean()
  saveCard!: boolean;
}
