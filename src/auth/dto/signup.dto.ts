import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';
import { Gender } from 'src/auth/domain/enums/user.enum';
import { Match } from 'src/common/decorators/match.decorator';

export class SignupDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  email!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^(?:\+20|0)?1[0125]\d{8}$/, {
    message: 'Phone number must be a valid Egyptian mobile number',
  })
  phone!: string;

  @IsNotEmpty()
  @IsEnum(Gender)
  gender!: Gender;

  @IsNotEmpty()
  @IsString()
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)(?=.*[\W_]).{8,}$/, {
    message:
      'Password is too weak. Please use at least 8 characters, including a mix of letters, numbers, and symbols.',
  })
  password!: string;

  @IsNotEmpty()
  @IsString()
  @Match('password', { message: 'Confirm password must match the password' })
  confirmPassword!: string;
}
