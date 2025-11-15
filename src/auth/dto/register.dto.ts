import { IsEmail, IsOptional, IsString, MinLength, Matches, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  displayName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9._-]+$/)
  username?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
