import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseFilters,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import * as jwt from 'jsonwebtoken';
import { RegisterDto } from 'src/auth/dto/register.dto';
import { LoginDto } from 'src/auth/dto/login.dto';
// import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtUser } from './type/user';
import { CurrentUser } from 'src/decorators/current-user.decorator';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';
import { BusinessExceptionFilter } from 'src/filters/business-exception.filter';

@Controller('auth')
@UseFilters(BusinessExceptionFilter)
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() currentUser: any) {
    return currentUser;
  }

  // @UseGuards(JwtAuthGuard)
  // @Patch('update-me')
  // async updateMe(@Req() req: any, @Body() body: any) {
  //   return this.authService.updateMe(req.user.userId, body);
  // }
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // return { message: 'OTP sent if the email exists' };
  }

  @Post('verify-code')
  async verifyCode(@Body() body: { email: string; code: string }) {
    return this.authService.verifyResetCode(body.email, body.code);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPasswordWithCode(
      dto.email,
      dto.code,
      dto.newPassword,
    );
    return { message: 'Password updated' };
  }

  // @Get('google')
  // @UseGuards(AuthGuard('google'))
  // async googleAuth() {
  // }

  // @Get('google/redirect')
  // @UseGuards(AuthGuard('google'))
  // async googleRedirect(@Req() req, @Res() res: Response) {
  //   const user = req.user;

  //   const payload = {
  //     email: user.email,
  //     name: user.name,
  //     picture: user.picture,
  //   };

  //   const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '1h' });
  //   return res.redirect(`http://localhost:3000/auth/success?token=${token}`);
  // }
}
