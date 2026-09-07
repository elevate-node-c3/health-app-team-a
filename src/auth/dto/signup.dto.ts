import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';

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
  phone!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
