import { IsEmail, Length, Matches } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class VerifyResetDto {
  @IsEmail()
  email!: string;

  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @Length(6, 255)
  newPassword!: string;

  @Length(6, 6)
  code!: string;
}
