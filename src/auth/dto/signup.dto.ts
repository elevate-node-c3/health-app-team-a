import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';

import { Gender } from '../domain/enums/user.enum';

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(?:\+?20|0020)?01[0125]\d{8}$/, {
    message: 'Phone must be a valid Egyptian mobile number',
  })
  phone!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/, {
    message:
      'Password is too weak. Please use at least 8 characters, including a mix of letters, numbers, and symbols.',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword!: string;
}
