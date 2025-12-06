// src/users/dto/change-password.dto.ts
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string; // mật khẩu hiện tại

  @IsString()
  @MinLength(6)
  newPassword: string; // mật khẩu mới

  @IsString()
  @MinLength(6)
  confirmNewPassword: string; // nhập lại mật khẩu mới
}
