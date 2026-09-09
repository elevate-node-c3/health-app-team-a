import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgetPasswordDTO {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
