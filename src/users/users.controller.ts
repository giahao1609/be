// src/users/users.controller.ts
import {
  Controller,
  Get,
  Patch,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { UploadService } from 'src/upload/upload.service'; // chỉnh lại path đúng với project của bạn
import { UpdateMyProfileDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';


@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly uploadService: UploadService,
  ) {}

  // ===== ADMIN LIST USERS =====
  @Get()
  async listUsers(@Query() q: QueryUsersDto) {
    return this.usersService.findMany(q);
  }

  // ===== LẤY PROFILE CỦA CHÍNH MÌNH =====
  @Get('me')
  async getMe(@CurrentUser() currentUser: any) {
    const user = await this.usersService.findById(currentUser._id);
    if (!user) return null;

    // ẩn field nhạy cảm
    const { passwordHash, resetExpires, ...safe } = user.toObject
      ? user.toObject()
      : user;
    return safe;
  }

  @Patch('me/profile')
  @UseInterceptors(FileInterceptor('avatar'))
  async updateMyProfile(
    @CurrentUser() currentUser: any,
    @Body() body: UpdateMyProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    let avatarUrl: string | undefined;

    if (avatar) {
      const folder = `users/${currentUser._id}/avatar`;
      const uploaded = await this.uploadService.uploadSingleToGCS(avatar, folder);
      avatarUrl = uploaded.url; 
    }

    const updated = await this.usersService.updateProfile(currentUser._id, {
      displayName: body.displayName,
      username: body.username,
      phone: body.phone,
      avatarUrl,
    });

    return updated;
  }

  // ===== ĐỔI MẬT KHẨU CỦA CHÍNH MÌNH =====
  @Patch('me/password')
  async changeMyPassword(
    @CurrentUser() currentUser: any,
    @Body() body: ChangePasswordDto,
  ) {
    if (body.newPassword !== body.confirmNewPassword) {
      throw new BadRequestException('Mật khẩu xác nhận không khớp');
    }

    await this.usersService.changePassword(
      currentUser._id,
      body.currentPassword,
      body.newPassword,
    );

    return {
      success: true,
      message: 'Đổi mật khẩu thành công',
    };
  }
}
