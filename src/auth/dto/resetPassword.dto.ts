import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { Match } from 'src/common/decorators/match.decorator';

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase())
  email!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(
    /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[\W_]).{8,}$/,
    {
      message: 'Password is too weak. Please use at least 8 characters, including a mix of letters, numbers, and symbols.',
    },
  )
  password!: string;

  @IsNotEmpty()
  @IsString()
  @Match('password', { message: 'Confirm password must match the password' })
  confirmPassword!: string;
}
