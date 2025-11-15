import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { MailerService } from '@nestjs-modules/mailer';
import { User, UserDocument, UserSchema } from 'src/users/schema/user.schema';
import { RegisterDto } from 'src/auth/dto/register.dto';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { LoginDto } from 'src/auth/dto/login.dto';
import { RedisServiceIoredis } from 'src/redis/redis.services';
import * as crypto from 'node:crypto';
@Injectable()
export class AuthService {
  private readonly OTP_TTL_SEC = 10 * 60;
  private readonly VERIFIED_TTL_SEC = 5 * 60;
  private readonly COOLDOWN_SEC = 60;
  private readonly MAX_ATTEMPTS = 5;
  private readonly BCRYPT_ROUNDS = 12;

  // ====== REDIS KEY SHAPES ======
  private NS = 'auth.reset';
  private FN_OTP = 'forgot.otp';
  private FN_META = 'forgot.meta';
  private FN_VERIFIED = 'forgot.verified';
  private FN_COOLDOWN = 'forgot.cooldown';

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    private readonly redisService: RedisServiceIoredis,
  ) {}

  private sign(user: UserDocument) {
    const payload = {
      sub: user._id.toString(),
      roles: user.roles,
      id: user._id,
    };
    return this.jwt.sign(payload);
  }

  async register(dto: RegisterDto) {
    const existed = await this.userModel.findOne({ email: dto.email }).lean();
    console.log('existed', existed);
    if (existed) throw new ConflictException('EMAIL_EXISTS');

    if (dto.username) {
      const existedUsername = await this.userModel
        .findOne({ username: dto.username })
        .lean();
      if (existedUsername) throw new ConflictException('USERNAME_EXISTS');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.userModel.create({
      displayName: dto.displayName,
      email: dto.email,
      passwordHash,
      username: dto.username,
      phone: dto.phone,
      roles: ['customer'],
      isActive: true,
    });

    const accessToken = this.sign(user);
    return {
      accessToken,
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        roles: user.roles,
        username: user.username,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user) throw new UnauthorizedException('INVALID_CREDENTIALS');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('INVALID_CREDENTIALS');

    if (!user.isActive) throw new ForbiddenException('USER_DISABLED');

    const accessToken = this.sign(user);
    return {
      accessToken,
      user: {
        id: user._id,
        displayName: user.displayName,
        email: user.email,
        roles: user.roles,
        username: user.username,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  private normalizeEmail(email: string) {
    return String(email ?? '')
      .trim()
      .toLowerCase();
  }

  private generateOtp6() {
    const n = crypto.randomInt(0, 1_000_000);
    return n.toString().padStart(6, '0');
  }

  private serverSecret() {
    return process.env.AUTH_RESET_SECRET || 'please-change-me';
  }

  private hashOtp(otp: string) {
    return crypto
      .createHmac('sha256', this.serverSecret())
      .update(otp)
      .digest('hex');
  }

  private verifyOtpHash(storedHash: string, otp: string) {
    const calc = this.hashOtp(otp);
    return crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(calc));
  }

  private maskEmail(email: string) {
    const [name, domain] = email.split('@');
    if (!domain) return '***';
    const n = name.length;
    const head = name.slice(0, Math.min(2, n));
    const tail = name.slice(Math.max(0, n - 1));
    return `${head}${'*'.repeat(Math.max(1, n - head.length - tail.length))}${tail}@${domain}`;
  }

  private renderOtpEmail(otp: string) {
    const mins = Math.floor(this.OTP_TTL_SEC / 60);
    return `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;line-height:1.6">
        <h2>Reset your password</h2>
        <p>Use the following code to reset your password. It expires in <b>${mins} minutes</b>.</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:6px;padding:12px 16px;border:1px dashed #ccc;display:inline-block;border-radius:8px">
          ${otp}
        </div>
        <p style="color:#666;margin-top:14px">If you didn’t request this, you can ignore this email.</p>
      </div>
    `;
  }

  private async getJSON(ns: string, shard: string, fn: string, q: any[]) {
    const v = await this.redisService.getCacheNameSpace(ns, shard, fn, q);
    if (v == null) return null;
    if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch {
        /* fallthrough */
      }
    }
    return v;
  }
  private async setJSON(
    ns: string,
    shard: string,
    fn: string,
    q: any[],
    data: any,
    ttl?: number,
  ) {
    const val = typeof data === 'string' ? data : JSON.stringify(data);
    await this.redisService.setCacheNameSpace(ns, shard, fn, q, val, ttl);
  }
  private async delFn(ns: string, shard: string, fn: string) {
    await this.redisService.invalidateFunctionNameSpace(ns, shard, fn);
  }

  async forgotPassword(email: string) {
    const norm = this.normalizeEmail(email);
    const user = await this.usersService.findByEmail(norm);

    if (!user) {
      return {
        message: 'If the account exists, an OTP has been sent.',
        emailMasked: this.maskEmail(norm),
        expiresInSec: this.OTP_TTL_SEC,
      };
    }

    const cd = await this.getJSON(this.NS, norm, this.FN_COOLDOWN, [norm]);
    if (cd)
      throw new ForbiddenException(
        'Please wait before requesting another code.',
      );

    const otp = this.generateOtp6();
    const otpHash = this.hashOtp(otp);

    await this.setJSON(
      this.NS,
      norm,
      this.FN_OTP,
      [norm],
      { otpHash },
      this.OTP_TTL_SEC,
    );
    await this.setJSON(
      this.NS,
      norm,
      this.FN_META,
      [norm],
      { attempts: 0, lastSendAt: Date.now() },
      this.OTP_TTL_SEC,
    );
    await this.setJSON(
      this.NS,
      norm,
      this.FN_COOLDOWN,
      [norm],
      { on: true },
      this.COOLDOWN_SEC,
    );
    await this.delFn(this.NS, norm, this.FN_VERIFIED);

    await this.mailer.sendMail({
      to: norm,
      subject: 'Your password reset code',
      html: this.renderOtpEmail(otp),
      text: `Your password reset code is: ${otp}\nThis code expires in ${Math.floor(this.OTP_TTL_SEC / 60)} minutes.`,
    });

    return {
      message: 'OTP sent successfully.',
      emailMasked: this.maskEmail(norm),
      expiresInSec: this.OTP_TTL_SEC,
    };
  }

  async verifyResetCode(email: string, code: string) {
    const norm = this.normalizeEmail(email);
    const user = await this.usersService.findByEmail(norm);
    if (!user) throw new BadRequestException('Invalid code or email.');

    const otpObj = (await this.getJSON(this.NS, norm, this.FN_OTP, [norm])) as {
      otpHash: string;
    } | null;
    const metaObj = (await this.getJSON(this.NS, norm, this.FN_META, [
      norm,
    ])) as { attempts: number; lastSendAt: number } | null;

    if (!otpObj?.otpHash || !metaObj) {
      throw new BadRequestException('Code expired or not requested.');
    }

    if ((metaObj.attempts ?? 0) >= this.MAX_ATTEMPTS) {
      await this.delFn(this.NS, norm, this.FN_OTP);
      await this.delFn(this.NS, norm, this.FN_META);
      throw new ForbiddenException(
        'Too many incorrect attempts. Please request a new code.',
      );
    }

    const ok = this.verifyOtpHash(otpObj.otpHash, code);
    if (!ok) {
      const next = {
        attempts: (metaObj.attempts ?? 0) + 1,
        lastSendAt: metaObj.lastSendAt ?? Date.now(),
      };
      await this.setJSON(
        this.NS,
        norm,
        this.FN_META,
        [norm],
        next,
        this.OTP_TTL_SEC,
      );
      throw new BadRequestException('Invalid code.');
    }

    await this.setJSON(
      this.NS,
      norm,
      this.FN_VERIFIED,
      [norm],
      { ok: true },
      this.VERIFIED_TTL_SEC,
    );

    return {
      message: 'Code verified. You can now reset your password.',
      expiresInSec: this.VERIFIED_TTL_SEC,
    };
  }

  async resetPasswordWithCode(
    email: string,
    code: string,
    newPassword: string,
  ) {
    const norm = this.normalizeEmail(email);
    const user = await this.usersService.findByEmail(norm);
    if (!user) throw new BadRequestException('Invalid code or email.');

    const otpObj = (await this.getJSON(this.NS, norm, this.FN_OTP, [norm])) as {
      otpHash: string;
    } | null;

    const metaObj = (await this.getJSON(this.NS, norm, this.FN_META, [
      norm,
    ])) as { attempts: number; lastSendAt: number } | null;

    if (!otpObj?.otpHash || !metaObj) {
      throw new BadRequestException('Code expired or not requested.');
    }

    if ((metaObj.attempts ?? 0) >= this.MAX_ATTEMPTS) {
      await this.delFn(this.NS, norm, this.FN_OTP);
      await this.delFn(this.NS, norm, this.FN_META);
      throw new ForbiddenException(
        'Too many incorrect attempts. Please request a new code.',
      );
    }


    const ok = this.verifyOtpHash(otpObj.otpHash, code);
    if (!ok) {
      const nextMeta = {
        attempts: (metaObj.attempts ?? 0) + 1,
        lastSendAt: metaObj.lastSendAt ?? Date.now(),
      };
      await this.setJSON(
        this.NS,
        norm,
        this.FN_META,
        [norm],
        nextMeta,
        this.OTP_TTL_SEC,
      );
      throw new BadRequestException('Invalid code.');
    }

    const newHash = await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS);
    await this.userModel
      .updateOne(
        { _id: user._id },
        { $set: { passwordHash: newHash, passwordChangedAt: new Date() } },
      )
      .exec();

    await this.delFn(this.NS, norm, this.FN_VERIFIED);
    await this.delFn(this.NS, norm, this.FN_COOLDOWN);
    await this.delFn(this.NS, norm, this.FN_OTP);
    await this.delFn(this.NS, norm, this.FN_META);

    return { message: 'Password has been reset successfully.' };
  }
}
