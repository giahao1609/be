import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @Length(3, 120)
  displayName?: string;

  @IsOptional()
  @IsString()
  // username: a-z A-Z 0-9 _ .
  @Matches(/^[a-zA-Z0-9_.]{3,32}$/, {
    message: 'Username must be 3-32 chars, only letters, numbers, underscore, dot',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+0-9\s\-]{8,20}$/, {
    message: 'Invalid phone number format',
  })
  phone?: string;
}